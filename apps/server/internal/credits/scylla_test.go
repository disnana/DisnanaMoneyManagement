package credits

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"
)

func TestScyllaWallet(t *testing.T) {
	if os.Getenv("MANE_TEST_SCYLLA") != "1" {
		t.Skip("requires an isolated Scylla keyspace with schema.cql applied")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	a, err := OpenFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	b, err := OpenFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()

	subject := fmt.Sprintf("wallet-test-%d", time.Now().UnixNano())
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		wallet, err := OpenFromEnv()
		if err != nil {
			t.Error(err)
			return
		}
		defer wallet.Close()
		if err := wallet.session.Query("DELETE FROM credit_wallet_entries WHERE subject = ?", subject).WithContext(cleanup).Exec(); err != nil {
			t.Error(err)
		}
	})
	if n, err := a.Balance(ctx, subject); n != 0 || err != nil {
		t.Fatalf("initial balance = %d, %v", n, err)
	}
	runConcurrently := func(f func(*Wallet) error) {
		t.Helper()
		var wg sync.WaitGroup
		for _, wallet := range []*Wallet{a, b} {
			wg.Go(func() {
				if err := f(wallet); err != nil {
					t.Error(err)
				}
			})
		}
		wg.Wait()
	}
	runConcurrently(func(w *Wallet) error { return w.Grant(ctx, subject, "same-grant", 10, time.Time{}) })
	runConcurrently(func(w *Wallet) error { return w.Spend(ctx, subject, "same-spend", 6) })
	if n, err := b.Balance(ctx, subject); n != 4 || err != nil {
		t.Fatalf("balance after concurrent retries = %d, %v", n, err)
	}
	if err := b.Spend(ctx, subject, "same-spend", 3); !errors.Is(err, ErrOperationConflict) {
		t.Fatalf("mismatched retry = %v", err)
	}
	if err := b.Spend(ctx, subject, "insufficient", 5); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("overdraft = %v", err)
	}
	if err := a.GrantPurchase(ctx, subject, "purchase", 9, time.Time{}); err != nil {
		t.Fatal(err)
	}
	runConcurrently(func(w *Wallet) error { return w.ReversePurchase(ctx, subject, "purchase") })
	if err := b.ReversePurchase(ctx, subject, "reversed-before-grant"); err != nil {
		t.Fatal(err)
	}
	if err := a.GrantPurchase(ctx, subject, "reversed-before-grant", 9, time.Time{}); !errors.Is(err, ErrPurchaseReversed) {
		t.Fatalf("late grant after reversal = %v", err)
	}
	snapshot, err := b.Snapshot(ctx, subject)
	if err != nil || snapshot.Balance != 4 || len(snapshot.History) != 5 {
		t.Fatalf("unexpected snapshot after reversal and retry: %+v, %v", snapshot, err)
	}
}
