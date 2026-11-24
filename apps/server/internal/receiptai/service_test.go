package receiptai

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var lostWrite = errors.New("simulated lost response to committed write")

type memoryJobs struct {
	mu      sync.Mutex
	rows    map[JobKey]ReceiptJob
	loseCAS func(ReceiptJob) bool
}

func (m *memoryJobs) putIfAbsent(_ context.Context, key JobKey, row ReceiptJob) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, found := m.rows[key]; found {
		return false, nil
	}
	m.rows[key] = row
	return true, nil
}

func (m *memoryJobs) load(_ context.Context, key JobKey) (ReceiptJob, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, found := m.rows[key]
	if !found {
		return ReceiptJob{}, ErrReceiptNotFound
	}
	return row, nil
}

func (m *memoryJobs) replace(_ context.Context, key JobKey, prior int64, row ReceiptJob) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.rows[key].Revision != prior {
		return false, nil
	}
	m.rows[key] = row
	if m.loseCAS != nil && m.loseCAS(row) {
		m.loseCAS = nil
		return false, lostWrite
	}
	return true, nil
}

type memoryCredits struct {
	mu              sync.Mutex
	holds           map[JobKey]int64
	used            map[JobKey]int64
	effects         int
	loseSettlement  bool
	loseReservation bool
	aborted         map[JobKey]bool
}

func (w *memoryCredits) Reserve(_ context.Context, subject, id string, amount int64) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	key := JobKey{Subject: subject, RequestID: id}
	if w.aborted[key] {
		return ErrJobConflict
	}
	if previous, found := w.holds[key]; found && previous != amount {
		return ErrJobConflict
	}
	w.holds[key] = amount
	if w.loseReservation {
		w.loseReservation = false
		return lostWrite
	}
	return nil
}

func (w *memoryCredits) AbortReservation(_ context.Context, subject, id string) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	key := JobKey{Subject: subject, RequestID: id}
	if w.used[key] > 0 {
		return ErrJobConflict
	}
	delete(w.holds, key)
	w.aborted[key] = true
	return nil
}

func (w *memoryCredits) Settle(_ context.Context, subject, id string, used int64) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	key := JobKey{Subject: subject, RequestID: id}
	if prior, found := w.used[key]; found {
		if prior != used {
			return ErrJobConflict
		}
		return nil
	}
	held, found := w.holds[key]
	if !found || used < 0 || used > held {
		return ErrJobConflict
	}
	w.used[key] = used
	w.effects++
	if w.loseSettlement {
		w.loseSettlement = false
		return lostWrite
	}
	return nil
}

type analyzerFunc func(context.Context, Group) (LunaResponse, error)

func (f analyzerFunc) Analyze(ctx context.Context, group Group) (LunaResponse, error) {
	return f(ctx, group)
}

func serviceFixture(t *testing.T) (*Service, *memoryJobs, *memoryCredits, JobKey, time.Time, ReceiptIntake, []byte, Group) {
	t.Helper()
	jobs := &memoryJobs{rows: make(map[JobKey]ReceiptJob)}
	wallet := &memoryCredits{holds: make(map[JobKey]int64), used: make(map[JobKey]int64), aborted: make(map[JobKey]bool)}
	now := time.Unix(1700000000, 0)
	service := &Service{store: jobs, credits: wallet, limits: fixtureLimits(), now: func() time.Time { return now }}
	key := JobKey{Subject: "owner-A", RequestID: "receipt-1"}
	top, bottom := receiptImages(t)
	group := Group{ID: "pages", Images: []Image{top, bottom}}
	raw := requestJSON(t, Request{Groups: []Group{group}})
	intake := ReceiptIntake{BodySHA256: digestString(raw), PriceVersion: "price-1", MaximumCredit: 2, Deadline: now.Add(time.Minute)}
	return service, jobs, wallet, key, now, intake, raw, group
}

func TestAcceptDurableInputRecoversReservationAndBindsOriginalQuote(t *testing.T) {
	ctx := context.Background()
	s, jobs, wallet, key, _, intake, raw, _ := serviceFixture(t)
	jobs.loseCAS = func(row ReceiptJob) bool { return row.Accepted }
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); !errors.Is(err, lostWrite) {
		t.Fatalf("expected uncertain acknowledgement, got %v", err)
	}
	priceChanged := intake
	priceChanged.PriceVersion, priceChanged.MaximumCredit = "price-2", 3
	row, err := s.AcceptDurableInput(ctx, key, priceChanged, raw)
	if err != nil || !row.Accepted || row.Intake.PriceVersion != "price-1" || wallet.holds[key] != 2 {
		t.Fatalf("did not recover original quote: %+v, %v", row, err)
	}

	modified := append(append([]byte(nil), raw...), ' ')
	priceChanged.BodySHA256 = digestString(modified)
	if _, err := s.AcceptDurableInput(ctx, key, priceChanged, modified); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("expected conflicting bytes, got %v", err)
	}
	if _, err := jobs.load(ctx, JobKey{Subject: "owner-B", RequestID: key.RequestID}); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("another owner accessed job: %v", err)
	}
}

func TestRunStandardGroupCommitsResultBeforeSettlementAndSendsOnce(t *testing.T) {
	ctx := context.Background()
	s, jobs, _, key, now, intake, raw, group := serviceFixture(t)
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); err != nil {
		t.Fatal(err)
	}
	var sends atomic.Int32
	s.analyzer = analyzerFunc(func(context.Context, Group) (LunaResponse, error) {
		sends.Add(1)
		return LunaResponse{ProviderID: "resp_123", Result: Result{
			Documents: []Document{{SourceImageIDs: []string{"top"}, Type: ATMStatement, Status: OutOfScope}},
		}}, nil
	})

	changed := group
	changed.Images = append([]Image(nil), group.Images...)
	changed.Images[0].Data = []byte("replaced")
	if err := s.RunStandardGroup(ctx, key, changed, "attempt-1", now.Add(time.Second), now.Add(time.Minute)); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("changed images were accepted: %v", err)
	}
	var calls sync.WaitGroup
	for _, id := range []string{"attempt-1", "attempt-2"} {
		calls.Add(1)
		go func() {
			defer calls.Done()
			_ = s.RunStandardGroup(ctx, key, group, id, now.Add(time.Second), now.Add(time.Minute))
		}()
	}
	calls.Wait()
	saved, err := jobs.load(ctx, key)
	got := saved.Groups[0]
	if err != nil || sends.Load() != 1 || got.Job.State != JobSettling || got.Job.ProviderID != "resp_123" ||
		got.Job.Outcome.State != JobPartial || got.Result == "" || digestString([]byte(got.Result)) != got.Job.Outcome.ResultSHA256 {
		t.Fatalf("wrong persisted result or duplicate request: %+v sends=%d err=%v", got.Job, sends.Load(), err)
	}
}

func TestRunStandardGroupDoesNotSendAfterUncertainCAS(t *testing.T) {
	ctx := context.Background()
	s, jobs, _, key, now, intake, raw, group := serviceFixture(t)
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); err != nil {
		t.Fatal(err)
	}
	jobs.loseCAS = func(row ReceiptJob) bool { return row.Groups[0].Job.State == JobSubmitting }
	s.analyzer = analyzerFunc(func(context.Context, Group) (LunaResponse, error) {
		t.Fatal("sent with unacknowledged CAS")
		return LunaResponse{}, nil
	})
	if err := s.RunStandardGroup(ctx, key, group, "attempt-1", now.Add(time.Second), now.Add(2*time.Second)); !errors.Is(err, lostWrite) {
		t.Fatalf("expected uncertain write, got %v", err)
	}
	if err := s.RunStandardGroup(ctx, key, group, "attempt-2", now.Add(time.Second), now.Add(2*time.Second)); err == nil {
		t.Fatal("retry was accepted")
	}
	s.now = func() time.Time { return now.Add(3 * time.Second) }
	if err := s.RecoverGroup(ctx, key, group.ID); err != nil {
		t.Fatal(err)
	}
	row, _ := jobs.load(ctx, key)
	if row.Groups[0].Job.State != JobSubmissionUnknown {
		t.Fatalf("expected unresolved, got %v", row.Groups[0].Job.State)
	}
	s.now = func() time.Time { return intake.Deadline }
	if err := s.RecoverGroup(ctx, key, group.ID); err != nil {
		t.Fatal(err)
	}
	row, _ = jobs.load(ctx, key)
	if row.Groups[0].Job.Outcome.State != JobExpired || row.Groups[0].Job.State != JobSettling {
		t.Fatalf("expected pending expiry settlement, got %+v", row.Groups[0].Job)
	}
}

func TestSettleReceiptReplaysWalletAndFinishesAllGroupsOnce(t *testing.T) {
	ctx := context.Background()
	s, jobs, wallet, key, now, intake, raw, group := serviceFixture(t)
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SettleReceipt(ctx, key, 1); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("queued job was settled: %v", err)
	}
	s.analyzer = analyzerFunc(func(context.Context, Group) (LunaResponse, error) {
		return LunaResponse{ProviderID: "resp_123", Result: Result{
			Documents: []Document{{SourceImageIDs: []string{"top", "bottom"}, Type: ATMStatement, Status: OutOfScope}},
		}}, nil
	})
	if err := s.RunStandardGroup(ctx, key, group, "attempt-1", now.Add(time.Second), now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SettleReceipt(ctx, key, 3); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("accepted charge above quote: %v", err)
	}
	wallet.loseSettlement = true
	if _, err := s.SettleReceipt(ctx, key, 1); !errors.Is(err, lostWrite) {
		t.Fatalf("expected uncertain wallet write, got %v", err)
	}
	row, _ := jobs.load(ctx, key)
	if row.Settled || row.FinalCredit == nil || *row.FinalCredit != 1 {
		t.Fatalf("settlement amount not staged: %+v", row)
	}
	if _, err := s.SettleReceipt(ctx, key, 0); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("settlement amount was changed: %v", err)
	}
	jobs.loseCAS = func(row ReceiptJob) bool { return row.Settled }
	if _, err := s.SettleReceipt(ctx, key, 1); !errors.Is(err, lostWrite) {
		t.Fatalf("expected uncertain job write, got %v", err)
	}
	finished, err := s.SettleReceipt(ctx, key, 1)
	if err != nil || !finished.Settled || wallet.effects != 1 || finished.Groups[0].Job.State != JobCompleted {
		t.Fatalf("settlement was incomplete or repeated: %+v effects=%d err=%v", finished, wallet.effects, err)
	}
}

func TestTechnicalFailureCanOnlyReleaseCredits(t *testing.T) {
	ctx := context.Background()
	s, _, wallet, key, now, intake, raw, group := serviceFixture(t)
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); err != nil {
		t.Fatal(err)
	}
	s.analyzer = analyzerFunc(func(context.Context, Group) (LunaResponse, error) {
		return LunaResponse{}, ErrLunaRejected
	})
	if err := s.RunStandardGroup(ctx, key, group, "attempt-1", now.Add(time.Second), now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SettleReceipt(ctx, key, 1); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("technical failure could be charged: %v", err)
	}
	row, err := s.SettleReceipt(ctx, key, 0)
	if err != nil || !row.Settled || row.Groups[0].Job.State != JobFailed || wallet.effects != 1 || wallet.used[key] != 0 {
		t.Fatalf("technical failure did not release credits: %+v, %v", row, err)
	}
}

func TestRecoverExpiredIntakeReleasesLostReservationAndBlocksLateReserve(t *testing.T) {
	ctx := context.Background()
	s, jobs, wallet, key, _, intake, raw, _ := serviceFixture(t)
	wallet.loseReservation = true
	if _, err := s.AcceptDurableInput(ctx, key, intake, raw); !errors.Is(err, lostWrite) || wallet.holds[key] != 2 {
		t.Fatalf("expected durable hold with lost acknowledgement: %v", err)
	}
	if err := s.RecoverExpiredIntake(ctx, key); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("recovery abandoned active intake: %v", err)
	}
	s.now = func() time.Time { return intake.Deadline }
	jobs.loseCAS = func(row ReceiptJob) bool { return row.Abandoned && !row.Settled }
	if err := s.RecoverExpiredIntake(ctx, key); !errors.Is(err, lostWrite) {
		t.Fatalf("expected uncertain abandonment journal: %v", err)
	}
	if err := s.RecoverExpiredIntake(ctx, key); err != nil {
		t.Fatal(err)
	}
	if err := s.RecoverExpiredIntake(ctx, key); err != nil {
		t.Fatal(err)
	}
	row, _ := jobs.load(ctx, key)
	if !row.Abandoned || !row.Settled || row.Accepted || row.Groups[0].Job.State != JobExpired || wallet.holds[key] != 0 {
		t.Fatalf("expiration didn't release hold: %+v", row)
	}
	if err := wallet.Reserve(ctx, key.Subject, key.RequestID, 2); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("late reserve could recreate hold: %v", err)
	}
}
