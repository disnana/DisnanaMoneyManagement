package receiptai

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"sync"
	"testing"
	"time"
)

type memoryResultExpiry struct {
	mu           sync.Mutex
	entries      map[resultExpiryEntry]struct{}
	failSchedule bool
	failRemove   JobKey
}

func newMemoryResultExpiry() *memoryResultExpiry {
	return &memoryResultExpiry{entries: map[resultExpiryEntry]struct{}{}}
}

func (m *memoryResultExpiry) schedule(_ context.Context, entry resultExpiryEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failSchedule {
		m.failSchedule = false
		return lostWrite
	}
	m.entries[entry] = struct{}{}
	return nil
}

func (m *memoryResultExpiry) due(_ context.Context, shard int, now time.Time, page []byte, limit int) ([]resultExpiryEntry, []byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var entries []resultExpiryEntry
	for entry := range m.entries {
		if shardFor(entry.Key) == shard && !now.Before(entry.ExpiresAt) && expiryOrder(entry) > string(page) {
			entries = append(entries, entry)
		}
	}
	sort.Slice(entries, func(i, j int) bool { return expiryOrder(entries[i]) < expiryOrder(entries[j]) })
	if len(entries) <= limit {
		return entries, nil, nil
	}
	return entries[:limit], []byte(expiryOrder(entries[limit-1])), nil
}

func expiryOrder(entry resultExpiryEntry) string {
	return fmt.Sprintf("%019d\x00%s\x00%s", entry.ExpiresAt.UnixMilli(), entry.Key.Subject, entry.Key.RequestID)
}

func (m *memoryResultExpiry) remove(_ context.Context, entry resultExpiryEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if entry.Key == m.failRemove {
		return lostWrite
	}
	delete(m.entries, entry)
	return nil
}

func fixtureRetainedAnalyzer(_ context.Context, input Group) (LunaResponse, error) {
	total, currency := int64(790), "JPY"
	return LunaResponse{ProviderID: "resp_retention_fixture", Result: Result{Documents: []Document{
		{SourceImageIDs: []string{input.Images[0].ID}, Type: PaymentReceipt, Status: Success,
			TotalMinor: &total, Currency: &currency},
	}}}, nil
}

func TestRuntimeResultRetentionStartsAtSettlementAndKeepsJobMetadata(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	runtime.service.analyzer = analyzerFunc(fixtureRetainedAnalyzer)
	if runtime.Config().ResultRetentionSeconds != 120 {
		t.Fatal("config did not disclose the configured duration in seconds")
	}
	view, err := runtime.Submit(ctx, key, 2, "price-1", raw)
	if err != nil || view.ResultExpiresAt != nil || view.ResultExpired || !view.Deadline.After(*now) {
		t.Fatalf("pending receipt has an unexpected expiry: %v", err)
	}
	*now = now.Add(15 * time.Second)
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err = runtime.Job(ctx, key)
	wantExpiry := now.Add(2 * time.Minute)
	if err != nil || !view.Settled || view.ResultExpiresAt == nil || !view.ResultExpiresAt.Equal(wantExpiry) ||
		view.ResultExpired || view.Groups[0].Result == nil || len(queue.rows) != 0 {
		t.Fatalf("settled result was not retained or input was not removed: %v", err)
	}
	stored, err := runtime.service.store.load(ctx, key)
	if err != nil || !stored.hasResults() {
		t.Fatalf("settled result payload was not stored: %v", err)
	}
	digest := stored.Groups[0].Job.Outcome.ResultSHA256

	*now = wantExpiry.Add(-time.Millisecond)
	if err := runtime.pollResultExpiry(ctx, new([receiptQueueShards]resultExpiryCursor)); err != nil {
		t.Fatal(err)
	}
	if view, err := runtime.Job(ctx, key); err != nil || view.ResultExpired || view.Groups[0].Result == nil {
		t.Fatalf("result was not visible before expiry: %v", err)
	}
	*now = wantExpiry
	if view, err := runtime.Job(ctx, key); err != nil || !view.ResultExpired || view.Groups[0].Result != nil {
		t.Fatalf("result was visible at expiry before database cleanup: %v", err)
	}
	if err := runtime.pollResultExpiry(ctx, new([receiptQueueShards]resultExpiryCursor)); err != nil {
		t.Fatal(err)
	}
	stored, err = runtime.service.store.load(ctx, key)
	if err != nil || stored.hasResults() || !stored.ResultExpired ||
		stored.Groups[0].Job.Outcome.ResultSHA256 != digest || stored.FinalCredit == nil || *stored.FinalCredit != 1 {
		t.Fatalf("cleanup removed important job metadata or kept result bytes: %v", err)
	}
	if replay, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil || !replay.Settled ||
		!replay.ResultExpired || replay.Groups[0].Result != nil || wallet.effects != 1 {
		t.Fatalf("expired request replay was not idempotent: %v", err)
	}
}

func TestSettledJobRetainsRecoveryIndexUntilExpiryIsScheduled(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, _, raw, _ := runtimeFixture(t)
	runtime.service.analyzer = analyzerFunc(fixtureRetainedAnalyzer)
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	index := runtime.results.(*memoryResultExpiry)
	index.failSchedule = true
	if err := runtime.process(ctx, key); !errors.Is(err, lostWrite) || len(queue.rows) != 1 || wallet.effects != 1 {
		t.Fatalf("failed expiry scheduling dropped recovery work: %v", err)
	}
	if err := runtime.process(ctx, key); err != nil || len(index.entries) != 1 || len(queue.rows) != 0 || wallet.effects != 1 {
		t.Fatalf("retry lost expiry scheduling, image cleanup, or idempotency: %v", err)
	}
}

func TestLegacySettledResultGetsAFullWindowOnFirstAuthenticatedRead(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, raw, group := runtimeFixture(t)
	runtime.service.analyzer = analyzerFunc(fixtureRetainedAnalyzer)
	intake := ReceiptIntake{BodySHA256: digestString(raw), PriceVersion: "price-1",
		MaximumCredit: 2, Deadline: now.Add(time.Minute)}
	if _, err := runtime.service.AcceptDurableInput(ctx, key, intake, raw); err != nil {
		t.Fatal(err)
	}
	if err := runtime.service.RunStandardGroup(ctx, key, group, "legacy", now.Add(time.Second), now.Add(5*time.Second)); err != nil {
		t.Fatal(err)
	}
	row, err := runtime.service.SettleReceipt(ctx, key, 1)
	if err != nil || !row.Settled || !row.ResultExpiresAt.IsZero() || len(queue.rows) != 0 {
		t.Fatalf("legacy fixture should have no expiry or recovery row: %v", err)
	}
	*now = now.Add(24 * time.Hour)
	view, err := runtime.Job(ctx, key)
	expiry := now.Add(runtime.config.ResultRetention)
	if err != nil || view.ResultExpiresAt == nil || !view.ResultExpiresAt.Equal(expiry) || view.Groups[0].Result == nil {
		t.Fatalf("legacy result did not receive a full retention window: %v", err)
	}
	*now = expiry
	if err := runtime.pollResultExpiry(ctx, new([receiptQueueShards]resultExpiryCursor)); err != nil {
		t.Fatal(err)
	}
	row, err = runtime.service.store.load(ctx, key)
	if err != nil || !row.ResultExpired || row.hasResults() || wallet.effects != 1 {
		t.Fatalf("legacy result was not cleaned without changing settlement: %v", err)
	}
}

func TestExpiryIndexCannotRemoveUnsettledResult(t *testing.T) {
	ctx := context.Background()
	runtime, _, _, key, now, raw, group := runtimeFixture(t)
	runtime.service.analyzer = analyzerFunc(fixtureRetainedAnalyzer)
	if _, err := runtime.Submit(ctx, key, 2, "price-1", raw); err != nil {
		t.Fatal(err)
	}
	if err := runtime.service.RunStandardGroup(ctx, key, group, "unsettled", now.Add(time.Second), now.Add(5*time.Second)); err != nil {
		t.Fatal(err)
	}
	entry := resultExpiryEntry{Key: key, ExpiresAt: *now}
	if err := runtime.results.schedule(ctx, entry); err != nil {
		t.Fatal(err)
	}
	if err := runtime.pollResultExpiry(ctx, new([receiptQueueShards]resultExpiryCursor)); err != nil {
		t.Fatal(err)
	}
	row, err := runtime.service.store.load(ctx, key)
	if err != nil || row.Settled || row.ResultExpired || !row.ResultExpiresAt.IsZero() || !row.hasResults() {
		t.Fatalf("an unsettled result was affected by expiry: %v", err)
	}
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || !view.Settled || view.ResultExpiresAt == nil || !view.ResultExpiresAt.After(*now) ||
		view.Groups[0].Result == nil {
		t.Fatalf("settlement did not preserve the result with its configured period: %v", err)
	}
}

func TestResultExpiryWalksPastAFullFailedPage(t *testing.T) {
	ctx := context.Background()
	runtime, _, _, first, now, _, _ := runtimeFixture(t)
	index := runtime.results.(*memoryResultExpiry)
	index.failRemove = first
	later := JobKey{Subject: first.Subject}
	for i := range 256 {
		later.RequestID = fmt.Sprintf("later-%d", i)
		if shardFor(first) == shardFor(later) {
			break
		}
	}
	if shardFor(first) != shardFor(later) {
		t.Fatal("fixture needs two keys in the same expiry shard")
	}
	for _, entry := range []resultExpiryEntry{
		{Key: first, ExpiresAt: now.Add(-time.Second)},
		{Key: later, ExpiresAt: *now},
	} {
		if err := index.schedule(ctx, entry); err != nil {
			t.Fatal(err)
		}
	}
	var cursors [receiptQueueShards]resultExpiryCursor
	if err := runtime.pollResultExpiry(ctx, &cursors); !errors.Is(err, lostWrite) {
		t.Fatalf("expected a failure on the first page: %v", err)
	}
	if err := runtime.pollResultExpiry(ctx, &cursors); err != nil {
		t.Fatalf("later expiry was blocked by the first page: %v", err)
	}
	if len(index.entries) != 1 {
		t.Fatal("expiry retry lost work or failed to advance")
	}
	if err := runtime.pollResultExpiry(ctx, &cursors); !errors.Is(err, lostWrite) {
		t.Fatalf("the failed entry was not retried: %v", err)
	}
}
