package receiptai

import (
	"context"
	"errors"
	"sort"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type memoryPendingEntry struct {
	details pendingReceipt
	data    []byte
}

type memoryPendingQueue struct {
	mu         sync.Mutex
	rows       map[JobKey]memoryPendingEntry
	loseInsert bool
	failRemove bool
}

func (m *memoryPendingQueue) insert(_ context.Context, key JobKey, pending pendingReceipt, raw []byte) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.rows[key]; exists {
		return false, nil
	}
	m.rows[key] = memoryPendingEntry{details: pending, data: append([]byte(nil), raw...)}
	if m.loseInsert {
		m.loseInsert = false
		return false, lostWrite
	}
	return true, nil
}

func (m *memoryPendingQueue) load(_ context.Context, key JobKey) (pendingReceipt, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if row, exists := m.rows[key]; exists {
		return row.details, nil
	}
	return pendingReceipt{}, ErrReceiptNotFound
}

func (m *memoryPendingQueue) body(_ context.Context, key JobKey) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if row, exists := m.rows[key]; exists && row.data != nil {
		return append([]byte(nil), row.data...), nil
	}
	return nil, ErrReceiptNotFound
}

func (m *memoryPendingQueue) page(_ context.Context, shard int, after JobKey, limit int) ([]JobKey, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	less := func(a, b JobKey) bool {
		if a.Subject != b.Subject {
			return a.Subject < b.Subject
		}
		return a.RequestID < b.RequestID
	}
	keys := make([]JobKey, 0)
	for key := range m.rows {
		if shardFor(key) == shard && less(after, key) {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return less(keys[i], keys[j]) })
	return keys[:min(limit, len(keys))], nil
}

func (m *memoryPendingQueue) remove(_ context.Context, key JobKey) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failRemove {
		m.failRemove = false
		return lostWrite
	}
	delete(m.rows, key)
	return nil
}

func runtimeFixture(t *testing.T) (*Runtime, *memoryPendingQueue, *memoryCredits, JobKey, *time.Time, []byte, Group) {
	t.Helper()
	service, _, wallet, key, now, _, raw, group := serviceFixture(t)
	service.now = func() time.Time { return now }
	queue := &memoryPendingQueue{rows: make(map[JobKey]memoryPendingEntry)}
	runtime, err := newRuntime(service, queue, RuntimeConfig{
		PriceVersion: "price-1", CreditPerImage: 1, JobTimeout: time.Minute,
		ClaimDuration: time.Second, AcknowledgeTimeout: 5 * time.Second,
		PollInterval: time.Second, PollBatchSize: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	return runtime, queue, wallet, key, &now, raw, group
}

func TestRuntimeRecoversStagedInputAndBindsOriginalQuote(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, _, raw, _ := runtimeFixture(t)
	if _, err := runtime.Submit(ctx, key, 1, "price-1", raw); !errors.Is(err, ErrReceiptQuote) || len(queue.rows) != 0 {
		t.Fatalf("incorrect quote was staged: %v", err)
	}
	queue.loseInsert = true
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); !errors.Is(err, lostWrite) || wallet.holds[key] != 0 {
		t.Fatalf("unexpected result of a lost staging acknowledgement: %v", err)
	}

	changed := runtime.config
	changed.PriceVersion, changed.CreditPerImage = "price-2", 2
	other, err := newRuntime(runtime.service, queue, changed)
	if err != nil {
		t.Fatal(err)
	}
	altered := append(append([]byte(nil), raw...), ' ')
	if _, err := other.Submit(ctx, key, 2, "price-1", altered); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("different bytes were allowed after the first staging write: %v", err)
	}
	view, err := other.Submit(ctx, key, 2, "price-1", raw)
	if err != nil || !view.Accepted || view.State != JobQueued || view.PriceVersion != "price-1" ||
		wallet.holds[key] != 2 || view.RequestID != key.RequestID {
		t.Fatalf("original consent was not recovered: %v", err)
	}
	if _, err := other.Job(ctx, JobKey{Subject: "other-owner", RequestID: key.RequestID}); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("another subject could read the receipt: %v", err)
	}
}

func TestRuntimeConcurrentWorkersDeduplicateEligibleImagesAndCleanUp(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, _, raw, _ := runtimeFixture(t)
	var calls atomic.Int32
	runtime.service.analyzer = analyzerFunc(func(_ context.Context, input Group) (LunaResponse, error) {
		calls.Add(1)
		imageID := input.Images[0].ID
		total := int64(790)
		return LunaResponse{ProviderID: "resp_shared", Result: Result{Documents: []Document{
			{SourceImageIDs: []string{imageID}, Type: ItemizedReceipt, Status: Success, TotalMinor: &total},
			{SourceImageIDs: []string{imageID}, Type: PaymentReceipt, Status: Success, TotalMinor: &total},
			{SourceImageIDs: []string{input.Images[1].ID}, Type: UnknownDocument, Status: Unreadable},
		}}}, nil
	})
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}

	var workers sync.WaitGroup
	for range 2 {
		workers.Go(func() {
			var cursors [receiptQueueShards]JobKey
			if err := runtime.poll(ctx, &cursors, runtime.process); err != nil {
				t.Error(err)
			}
		})
	}
	workers.Wait()
	// Allow another pass to recover if both workers encountered a CAS conflict.
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || !view.Settled || view.FinalCredit == nil || *view.FinalCredit != 1 ||
		wallet.effects != 1 || calls.Load() != 1 || len(queue.rows) != 0 {
		t.Fatalf("provider, physical image, or settlement was duplicated: %v", err)
	}
}

func TestRuntimeDoesNotResendUnknownAndUsesPinnedTariff(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, _, group := runtimeFixture(t)
	first, second := group.Images[0], group.Images[1]
	raw := requestJSON(t, Request{Groups: []Group{
		{ID: "recognized", Images: []Image{first}}, {ID: "unknown", Images: []Image{second}},
	}})
	calls := 0
	runtime.service.analyzer = analyzerFunc(func(_ context.Context, input Group) (LunaResponse, error) {
		calls++
		if input.ID == "unknown" {
			return LunaResponse{}, ErrLunaSubmissionUnknown
		}
		return LunaResponse{ProviderID: "resp_scope", Result: Result{Documents: []Document{
			{Type: ATMStatement, Status: OutOfScope, SourceImageIDs: []string{input.Images[0].ID}},
		}}}, nil
	})
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	runtime.config.PriceVersion, runtime.config.CreditPerImage = "price-2", 10
	for range 2 {
		if err := runtime.process(ctx, key); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 2 || wallet.effects != 0 {
		t.Fatal("unknown submission was sent twice or settled early")
	}
	*now = now.Add(time.Minute)
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || view.State != JobPartial || view.FinalCredit == nil || *view.FinalCredit != 1 ||
		view.Groups[1].State != JobExpired || wallet.used[key] != 1 || len(queue.rows) != 0 {
		t.Fatalf("unknown image was not released or original tariff changed: %v", err)
	}
}

func TestRuntimeRecoversUnacknowledgedReservationAfterDeadline(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	wallet.loseReservation = true
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); !errors.Is(err, lostWrite) || wallet.holds[key] != 2 {
		t.Fatalf("expected unacknowledged durable hold: %v", err)
	}
	if err := runtime.process(ctx, key); err != nil || wallet.holds[key] != 2 {
		t.Fatalf("runtime should wait for retry before the deadline: %v", err)
	}
	*now = now.Add(time.Minute)
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || view.Accepted || view.State != JobExpired || !view.Settled || wallet.holds[key] != 0 ||
		!wallet.aborted[key] || len(queue.rows) != 0 {
		t.Fatalf("expired intake left a hold or image: %v", err)
	}
}

func TestRuntimeSettlesExpiredAcceptedJobWithoutReadingImages(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	stored := queue.rows[key]
	stored.data = nil
	queue.rows[key] = stored
	*now = now.Add(time.Minute)
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || !view.Settled || view.State != JobExpired || wallet.effects != 1 || wallet.used[key] != 0 ||
		len(queue.rows) != 0 {
		t.Fatalf("expiry required raw input or retained the hold: %v", err)
	}
}

func TestReceiptJobChargesOnlyKnownAnalysisOutcomes(t *testing.T) {
	total := int64(0)
	blur := QualityBlur
	tests := []struct {
		document Document
		eligible bool
	}{
		{Document{Type: ItemizedReceipt, Status: Success, TotalMinor: &total}, true},
		{Document{Type: ItemizedReceipt, Status: Partial, TotalMinor: &total}, true},
		{Document{Type: ItemizedReceipt, Status: Partial}, false},
		{Document{Type: Invoice, Status: Partial, TotalMinor: &total}, false},
		{Document{Type: ATMStatement, Status: OutOfScope}, true},
		{Document{Type: UnknownDocument, Status: OutOfScope}, false},
		{Document{Type: UnknownDocument, Status: Unreadable, QualityReason: &blur}, true},
		{Document{Type: UnknownDocument, Status: Unreadable}, false},
	}
	for _, test := range tests {
		if got := eligibleDocument(test.document); got != test.eligible {
			t.Errorf("unexpected charge for %s/%s: got %v", test.document.Type, test.document.Status, got)
		}
	}
}

func TestRuntimeRetriesImageDeletionWithoutResettlement(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	queue.failRemove = true
	*now = now.Add(time.Minute)
	if err := runtime.processPending(ctx, key, false); !errors.Is(err, lostWrite) || len(queue.rows) != 1 ||
		wallet.effects != 1 {
		t.Fatalf("expected retryable image deletion after one settlement: %v", err)
	}
	if err := runtime.processPending(ctx, key, false); err != nil || len(queue.rows) != 0 ||
		wallet.effects != 1 {
		t.Fatalf("cleanup did not recover independently of submission: %v", err)
	}
}

func TestRuntimeRecoveryContinuesWhileProviderSlotsAreBusy(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runtime, queue, _, expired, now, raw, _ := runtimeFixture(t)
	runtime.config.JobTimeout = 10 * time.Second
	if _, err := runtime.Submit(ctx, expired, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	expiredRow := queue.rows[expired]
	delete(queue.rows, expired)
	*now = now.Add(time.Minute)
	runtime.config.JobTimeout = time.Minute
	runtime.config.PollInterval = 2 * time.Millisecond
	runtime.config.PollBatchSize = 4

	started := make(chan struct{}, receiptSendWorkers)
	runtime.service.analyzer = analyzerFunc(func(ctx context.Context, _ Group) (LunaResponse, error) {
		started <- struct{}{}
		<-ctx.Done()
		return LunaResponse{}, ErrLunaSubmissionUnknown
	})
	for _, id := range []string{"blocked-1", "blocked-2"} {
		key := JobKey{Subject: expired.Subject, RequestID: id}
		if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
			t.Fatal(err)
		}
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		runtime.Run(ctx)
	}()
	defer func() {
		cancel()
		<-done
	}()

	timer := time.NewTimer(3 * time.Second)
	defer timer.Stop()
	for range receiptSendWorkers {
		select {
		case <-started:
		case <-timer.C:
			t.Fatal("provider slots were not both started")
		}
	}

	queue.mu.Lock()
	queue.rows[expired] = expiredRow
	queue.mu.Unlock()
	poll := time.NewTicker(2 * time.Millisecond)
	defer poll.Stop()
	for {
		view, err := runtime.Job(ctx, expired)
		if err == nil && view.State == JobExpired && view.Settled {
			return
		}
		select {
		case <-poll.C:
		case <-timer.C:
			t.Fatal("expiry recovery waited for busy provider slots")
		}
	}
}
