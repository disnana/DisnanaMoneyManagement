package credits

import (
	"context"
	"encoding/json"
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
	emptySubject := subject + "-empty"
	expirySubject := subject + "-expiry"
	t.Cleanup(func() {
		cleanup, stop := context.WithTimeout(context.Background(), 5*time.Second)
		defer stop()
		wallet, err := OpenFromEnv()
		if err != nil {
			t.Error(err)
			return
		}
		defer wallet.Close()
		for _, testSubject := range []string{subject, emptySubject, expirySubject} {
			if err := wallet.session.Query("DELETE FROM credit_wallet_entries WHERE subject = ?", testSubject).WithContext(cleanup).Exec(); err != nil {
				t.Error(err)
			}
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
	if err := a.GrantPurchase(ctx, subject, "expired-purchase", 9, time.Now().Add(-time.Hour)); err != nil {
		t.Fatalf("record paid order with expired credits: %v", err)
	}
	snapshot, err := b.Snapshot(ctx, subject)
	if err != nil || snapshot.Balance != 4 || len(snapshot.History) != 6 {
		t.Fatalf("unexpected snapshot after reversal and retry: %+v, %v", snapshot, err)
	}
	t.Run("receipt reservations are atomic and preserve purchase reversals", func(t *testing.T) {
		if err := a.GrantPurchase(ctx, subject, "receipt-purchase", 8, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
		runConcurrently(func(w *Wallet) error { return w.Reserve(ctx, subject, "same-spend", 6) })
		if err := b.Reserve(ctx, subject, "same-spend", 5); !errors.Is(err, ErrOperationConflict) {
			t.Fatalf("mismatched reserve retry = %v", err)
		}
		if n, err := b.Balance(ctx, subject); n != 6 || err != nil {
			t.Fatalf("balance after holding credits = %d, %v", n, err)
		}
		if err := a.ReversePurchase(ctx, subject, "receipt-purchase"); err != nil {
			t.Fatal(err)
		}
		runConcurrently(func(w *Wallet) error { return w.Settle(ctx, subject, "same-spend", 2) })
		if n, err := b.Balance(ctx, subject); n != 4 || err != nil {
			t.Fatalf("balance after settling reversed credits = %d, %v", n, err)
		}
		if err := a.Settle(ctx, subject, "same-spend", 0); !errors.Is(err, ErrOperationConflict) {
			t.Fatalf("mismatched settle retry = %v", err)
		}
		if err := a.Reserve(ctx, subject, "cancel-receipt", 4); err != nil {
			t.Fatal(err)
		}
		if err := b.Spend(ctx, subject, "unavailable-while-held", 1); !errors.Is(err, ErrInsufficient) {
			t.Fatalf("spend of held credits = %v", err)
		}
		runConcurrently(func(w *Wallet) error { return w.Settle(ctx, subject, "cancel-receipt", 0) })
		if n, err := b.Balance(ctx, subject); n != 4 || err != nil {
			t.Fatalf("balance after releasing hold = %d, %v", n, err)
		}
	})
	t.Run("abort blocks delayed reservation and preserves completed charges", func(t *testing.T) {
		runConcurrently(func(w *Wallet) error { return w.AbortReservation(ctx, emptySubject, "expired") })
		if err := b.Reserve(ctx, emptySubject, "expired", 1); !errors.Is(err, ErrReservationCanceled) {
			t.Fatalf("reserve of canceled ID without wallet = %v", err)
		}
		if err := a.Settle(ctx, emptySubject, "expired", 0); err != nil {
			t.Fatalf("settle cancellation with zero = %v", err)
		}
		if err := a.Settle(ctx, emptySubject, "expired", 1); !errors.Is(err, ErrOperationConflict) {
			t.Fatalf("settle cancellation with consumption = %v", err)
		}
		if err := b.Grant(ctx, emptySubject, "fund-account", 4, time.Time{}); err != nil {
			t.Fatal(err)
		}
		if err := a.Reserve(ctx, emptySubject, "expired", 1); !errors.Is(err, ErrReservationCanceled) {
			t.Fatalf("grant reopened canceled ID = %v", err)
		}

		runConcurrently(func(w *Wallet) error {
			if w == b {
				return w.AbortReservation(ctx, emptySubject, "racing")
			}
			err := w.Reserve(ctx, emptySubject, "racing", 4)
			if errors.Is(err, ErrReservationCanceled) {
				return nil
			}
			return err
		})
		if err := a.Reserve(ctx, emptySubject, "racing", 4); !errors.Is(err, ErrReservationCanceled) {
			t.Fatalf("reserve after racing abort = %v", err)
		}
		if n, err := b.Balance(ctx, emptySubject); n != 4 || err != nil {
			t.Fatalf("racing abort left a hold = %d, %v", n, err)
		}

		if err := a.Reserve(ctx, emptySubject, "held", 4); err != nil {
			t.Fatal(err)
		}
		runConcurrently(func(w *Wallet) error { return w.AbortReservation(ctx, emptySubject, "held") })
		if n, err := b.Balance(ctx, emptySubject); n != 4 || err != nil {
			t.Fatalf("abort did not restore hold exactly once = %d, %v", n, err)
		}
		if err := b.AbortReservation(ctx, subject, "same-spend"); !errors.Is(err, ErrOperationConflict) {
			t.Fatalf("abort of positive settlement = %v", err)
		}
		if err := a.Reserve(ctx, subject, "same-spend", 6); err != nil {
			t.Fatalf("retry of prior completed reservation = %v", err)
		}
	})
	t.Run("available expiration is listed then archived exactly once", func(t *testing.T) {
		if err := a.Grant(ctx, expirySubject, "active", 4, time.Time{}); err != nil {
			t.Fatal(err)
		}
		seedExpired := func(item lot) {
			t.Helper()
			_, lots, err := a.read(ctx, expirySubject)
			if err != nil {
				t.Fatal(err)
			}
			data, err := json.Marshal(append(lots, item))
			if err != nil {
				t.Fatal(err)
			}
			if err := a.session.Query("UPDATE credit_wallet_entries SET lots = ? WHERE subject = ? AND entry = 'wallet'", string(data), expirySubject).WithContext(ctx).Exec(); err != nil {
				t.Fatal(err)
			}
		}
		first := lot{Amount: 3, Expires: 1000, Source: "expired-reserve"}
		second := lot{Amount: 2, Expires: 2000, Source: "expired-settle"}
		seedExpired(first)
		snapshot, err := b.Snapshot(ctx, expirySubject)
		if err != nil || snapshot.Balance != 4 || len(snapshot.ExpiredLots) != 1 || snapshot.ExpiredLots[0] != first {
			t.Fatalf("unarchived expiration = %+v, %v", snapshot, err)
		}
		runConcurrently(func(w *Wallet) error { return w.Reserve(ctx, expirySubject, "hold", 2) })
		seedExpired(second)
		runConcurrently(func(w *Wallet) error { return w.Settle(ctx, expirySubject, "hold", 1) })
		snapshot, err = b.Snapshot(ctx, expirySubject)
		if err != nil || snapshot.Balance != 3 || len(snapshot.ExpiredLots) != 0 {
			t.Fatalf("after archiving expiration = %+v, %v", snapshot, err)
		}
		expired := map[string]lot{}
		cursor := ""
		for {
			page, err := b.History(ctx, expirySubject, cursor, 1)
			if err != nil {
				t.Fatal(err)
			}
			for _, record := range page.Items {
				if record.Operation.Kind != "expire" {
					continue
				}
				op := record.Operation
				if len(op.ExpiredLots) != 1 || op.Amount != op.ExpiredLots[0].Amount {
					t.Fatalf("unexpected expiration record: %+v", record)
				}
				item := op.ExpiredLots[0]
				if _, exists := expired[item.Source]; exists {
					t.Fatalf("archived lot twice: %+v", item)
				}
				expired[item.Source] = item
			}
			cursor = page.NextCursor
			if cursor == "" {
				break
			}
		}
		if len(expired) != 2 || expired[first.Source] != first || expired[second.Source] != second {
			t.Fatalf("archived original lot details = %+v", expired)
		}
	})
	t.Run("history beyond 50 records", func(t *testing.T) {
		const count = 55
		const stamp = 1700000000000
		for index := range count {
			id := fmt.Sprintf("history-test-%02d", index)
			data, err := json.Marshal(historyEntry{ID: id, At: stamp, Operation: operation{Kind: "spend", Amount: 1}})
			if err != nil {
				t.Fatal(err)
			}
			key := fmt.Sprintf("history:%019d:%s", stamp, id)
			if err := a.session.Query("INSERT INTO credit_wallet_entries (subject, entry, operation) VALUES (?, ?, ?)", subject, key, string(data)).WithContext(ctx).Exec(); err != nil {
				t.Fatal(err)
			}
		}
		seen, cursor := map[string]bool{}, ""
		for _, size := range []int{20, 20, 20, 1} {
			page, err := b.History(ctx, subject, cursor, 20)
			if err != nil || len(page.Items) != size {
				t.Fatalf("history page = %+v, %v", page, err)
			}
			for _, item := range page.Items {
				if seen[item.ID] {
					t.Fatalf("duplicate history ID %q", item.ID)
				}
				seen[item.ID] = true
			}
			cursor = page.NextCursor
		}
		if cursor != "" || !seen["history-test-00"] {
			t.Fatal("did not reach the end of the history")
		}
	})
}
