package receiptai

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
)

func TestScyllaReceiptJobRevision(t *testing.T) {
	if os.Getenv("MANE_TEST_SCYLLA") != "1" {
		t.Skip("requires an isolated Scylla keyspace with credit and receipt job schemas")
	}
	wallet, err := credits.OpenFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	defer wallet.Close()
	db := wallet.Session()
	store, err := NewScyllaJobs(db, 4096)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var randomID [16]byte
	if _, err := rand.Read(randomID[:]); err != nil {
		t.Fatal(err)
	}
	key := JobKey{Subject: "receipt-test-" + hex.EncodeToString(randomID[:]), RequestID: "test"}
	defer func() {
		if err := db.Query("DELETE FROM receipt_ai_jobs WHERE subject = ? AND request_id = ?",
			key.Subject, key.RequestID).Exec(); err != nil {
			t.Errorf("clean up isolated receipt test: %v", err)
		}
	}()
	top, _ := receiptImages(t)
	deadline := time.Now().Add(time.Hour).UTC()
	input := ReceiptIntake{BodySHA256: digestString([]byte("test")), PriceVersion: "test-v1", MaximumCredit: 1, Deadline: deadline}
	row, err := newReceiptJob(input, []Group{{ID: "test", Images: []Image{top}}})
	if err != nil {
		t.Fatal(err)
	}
	if ok, err := store.putIfAbsent(ctx, key, row); err != nil || !ok {
		t.Fatalf("create failed: %v, %v", ok, err)
	}
	if ok, err := store.putIfAbsent(ctx, key, row); err != nil || ok {
		t.Fatalf("duplicate request inserted: %v, %v", ok, err)
	}
	if ok, err := store.replace(ctx, key, row.Revision, row.accept()); err != nil || !ok {
		t.Fatalf("first CAS failed: %v, %v", ok, err)
	}
	if ok, err := store.replace(ctx, key, row.Revision, row.accept()); err != nil || ok {
		t.Fatalf("stale CAS succeeded: %v, %v", ok, err)
	}
	stored, err := store.load(ctx, key)
	if err != nil || !stored.Accepted || stored.Revision != 2 || stored.Intake.BodySHA256 != input.BodySHA256 {
		t.Fatalf("read-back mismatch: %+v, %v", stored, err)
	}
	if _, err := store.load(ctx, JobKey{Subject: key.Subject + "-other", RequestID: key.RequestID}); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("wrong owner reached record: %v", err)
	}
}

func scyllaRuntimeFixture(t *testing.T) (*credits.Wallet, context.Context, string) {
	t.Helper()
	if os.Getenv("MANE_TEST_SCYLLA") != "1" {
		t.Skip("requires an isolated Scylla keyspace with credit and receipt runtime schemas")
	}
	wallet, err := credits.OpenFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(wallet.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		t.Fatal(err)
	}
	return wallet, ctx, "receipt-runtime-test-" + hex.EncodeToString(nonce[:])
}

func TestScyllaReceiptPendingQueue(t *testing.T) {
	wallet, ctx, subject := scyllaRuntimeFixture(t)
	queue := scyllaPending{db: wallet.Session()}
	first := JobKey{Subject: subject, RequestID: "a-000"}
	second := JobKey{Subject: subject}
	for i := 1; i < 1024; i++ {
		second.RequestID = fmt.Sprintf("a-%03d", i)
		if shardFor(first) == shardFor(second) {
			break
		}
	}
	if shardFor(first) != shardFor(second) {
		t.Fatal("could not construct two keys on one shard")
	}
	for _, key := range []JobKey{first, second} {
		t.Cleanup(func() {
			if err := queue.remove(context.Background(), key); err != nil {
				t.Errorf("clean up pending Scylla fixture: %v", err)
			}
		})
	}
	body := []byte("temporary test body")
	digest := digestString(body)
	pending := pendingReceipt{
		Intake:         ReceiptIntake{BodySHA256: digest, PriceVersion: "test-v1", MaximumCredit: 1, Deadline: time.Now().Add(time.Hour).UTC()},
		CreditPerImage: 1, Limits: fixtureLimits(), Groups: []pendingGroup{{ID: "receipt", Digest: digest, ImageIDs: []string{"photo"}}},
	}
	for _, key := range []JobKey{second, first} {
		if inserted, err := queue.insert(ctx, key, pending, body); err != nil || !inserted {
			t.Fatalf("pending insert failed: %v %v", inserted, err)
		}
	}
	if inserted, err := queue.insert(ctx, first, pending, []byte("replacement")); err != nil || inserted {
		t.Fatalf("duplicate pending request wrote again: %v %v", inserted, err)
	}
	if saved, err := queue.body(ctx, first); err != nil || string(saved) != string(body) {
		t.Fatalf("pending raw bytes were not preserved: %v", err)
	}
	if details, err := queue.load(ctx, first); err != nil || details.Intake.BodySHA256 != digest {
		t.Fatalf("pending metadata was not preserved: %v", err)
	}
	start := JobKey{Subject: subject, RequestID: "0"}
	if keys, err := queue.page(ctx, shardFor(first), start, 1); err != nil || len(keys) != 1 || keys[0] != first {
		t.Fatalf("first bounded page has the wrong key: %v %v", keys, err)
	}
	if keys, err := queue.page(ctx, shardFor(first), first, 1); err != nil || len(keys) != 1 || keys[0] != second {
		t.Fatalf("second bounded page has the wrong key: %v %v", keys, err)
	}
	if err := queue.remove(ctx, first); err != nil {
		t.Fatal(err)
	}
	if err := queue.remove(ctx, first); err != nil {
		t.Fatalf("pending removal was not idempotent: %v", err)
	}
	if _, err := queue.load(ctx, first); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("metadata remained after pending removal: %v", err)
	}
	if _, err := queue.body(ctx, first); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("image remained after pending removal: %v", err)
	}
}

func TestScyllaReceiptRuntimeStandardAndExpiredIntake(t *testing.T) {
	wallet, ctx, subject := scyllaRuntimeFixture(t)
	db := wallet.Session()
	store, err := NewScyllaJobs(db, 16<<10)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	analyzer := analyzerFunc(func(_ context.Context, input Group) (LunaResponse, error) {
		calls++
		amount := int64(123)
		currency := "JPY"
		return LunaResponse{ProviderID: "resp_scylla_fixture", Result: Result{Documents: []Document{
			{SourceImageIDs: []string{input.Images[0].ID}, Type: PaymentReceipt, Status: Success,
				TotalMinor: &amount, Currency: &currency},
		}}}, nil
	})
	service, err := NewService(store, wallet, analyzer, fixtureLimits())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	service.now = func() time.Time { return now }
	runtime, err := NewRuntime(service, db, RuntimeConfig{
		PriceVersion: "scylla-test", CreditPerImage: 1, JobTimeout: time.Minute, ResultRetention: 2 * time.Minute,
		ClaimDuration: time.Second, AcknowledgeTimeout: 5 * time.Second,
		PollInterval: time.Second, PollBatchSize: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	key := JobKey{Subject: subject, RequestID: "standard"}
	abandoned := JobKey{Subject: subject + "-empty", RequestID: "expired"}
	for _, target := range []JobKey{key, abandoned} {
		t.Cleanup(func() {
			if err := runtime.queue.remove(context.Background(), target); err != nil {
				t.Errorf("remove Scylla test input: %v", err)
			}
			if err := db.Query("DELETE FROM receipt_ai_jobs WHERE subject = ? AND request_id = ?",
				target.Subject, target.RequestID).Exec(); err != nil {
				t.Errorf("remove Scylla test job: %v", err)
			}
			if err := db.Query("DELETE FROM credit_wallet_entries WHERE subject = ?", target.Subject).Exec(); err != nil {
				t.Errorf("remove Scylla test wallet: %v", err)
			}
		})
	}
	if err := wallet.Grant(ctx, subject, "fixture-grant", 2, time.Time{}); err != nil {
		t.Fatal(err)
	}
	image, _ := receiptImages(t)
	raw := requestJSON(t, Request{Groups: []Group{{ID: "receipt", Images: []Image{image}}}})
	if view, err := runtime.Submit(ctx, key, 1, "scylla-test", raw); err != nil || !view.Accepted {
		t.Fatalf("receipt was not accepted through Scylla: %v", err)
	}
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || !view.Settled || view.State != JobCompleted ||
		view.FinalCredit == nil || *view.FinalCredit != 1 || calls != 1 {
		t.Fatalf("unexpected settled Standard job: %+v %v", view, err)
	}
	if balance, err := wallet.Balance(ctx, subject); err != nil || balance != 1 {
		t.Fatalf("wallet did not settle exactly once: %d %v", balance, err)
	}
	if _, err := runtime.queue.body(ctx, key); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("settled job retained its image: %v", err)
	}
	if view.ResultExpiresAt == nil || view.Groups[0].Result == nil {
		t.Fatal("settled job did not retain its result and expiry")
	}
	expiry := *view.ResultExpiresAt
	t.Cleanup(func() {
		if err := runtime.results.remove(context.Background(), resultExpiryEntry{Key: key, ExpiresAt: expiry}); err != nil {
			t.Errorf("remove Scylla test result index: %v", err)
		}
	})

	if _, err := runtime.Submit(ctx, abandoned, 1, "scylla-test", raw); !errors.Is(err, credits.ErrInsufficient) {
		t.Fatalf("fixture should fail before acceptance due to insufficient credit: %v", err)
	}
	now = now.Add(time.Minute)
	if err := runtime.process(ctx, abandoned); err != nil {
		t.Fatal(err)
	}
	view, err = runtime.Job(ctx, abandoned)
	if err != nil || view.Accepted || !view.Settled || view.State != JobExpired ||
		view.FinalCredit == nil || *view.FinalCredit != 0 {
		t.Fatalf("expired, abandoned intake has the wrong client view: %+v %v", view, err)
	}
	if _, err := runtime.queue.body(ctx, abandoned); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("abandoned job retained its image: %v", err)
	}
	now = expiry
	if err := runtime.pollResultExpiry(ctx, new([receiptQueueShards]resultExpiryCursor)); err != nil {
		t.Fatal(err)
	}
	stored, err := store.load(ctx, key)
	if err != nil || !stored.Settled || !stored.ResultExpired || stored.hasResults() {
		t.Fatalf("Scylla expiry did not clear only the result: %v", err)
	}
}

func TestScyllaReceiptExpiryUsesOrderedBoundedPages(t *testing.T) {
	wallet, ctx, subject := scyllaRuntimeFixture(t)
	index := scyllaResultExpiry{db: wallet.Session()}
	first := JobKey{Subject: subject, RequestID: "first"}
	second := JobKey{Subject: subject}
	for i := range 256 {
		second.RequestID = fmt.Sprintf("second-%d", i)
		if shardFor(first) == shardFor(second) {
			break
		}
	}
	shard := shardFor(first)
	if shard != shardFor(second) {
		t.Fatal("fixture needs two keys in the same expiry shard")
	}
	cutoff := time.Now().UTC().Truncate(time.Millisecond)
	early := resultExpiryEntry{Key: first, ExpiresAt: cutoff.Add(-time.Second)}
	late := resultExpiryEntry{Key: second, ExpiresAt: cutoff}
	for _, entry := range []resultExpiryEntry{late, early} {
		if err := index.schedule(ctx, entry); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := index.remove(context.Background(), entry); err != nil {
				t.Errorf("remove expiry fixture: %v", err)
			}
		})
	}
	seen := make(map[JobKey]bool)
	var page []byte
	for range 32 {
		rows, next, err := index.due(ctx, shard, cutoff, page, 1)
		if err != nil || len(rows) > 1 {
			t.Fatalf("expiry index returned an invalid page: %v", err)
		}
		for _, row := range rows {
			if row.Key == late.Key && !seen[early.Key] {
				t.Fatal("expiry index returned the later row first")
			}
			seen[row.Key] = true
		}
		if len(next) == 0 {
			break
		}
		page = next
	}
	if !seen[early.Key] || !seen[late.Key] {
		t.Fatal("both expiry entries were not returned from paged scanning")
	}
}
