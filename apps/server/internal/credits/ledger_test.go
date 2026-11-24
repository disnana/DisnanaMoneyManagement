package credits

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestSpendEarliestExpiryFirst(t *testing.T) {
	now := time.UnixMilli(1000)
	lots := []lot{{Amount: 5, Expires: 0}, {Amount: 10, Expires: 3000}, {Amount: 9, Expires: 1000}, {Amount: 3, Expires: 2000}}
	next, err := apply(lots, operation{Kind: "spend", Amount: 6}, now)
	if want := []lot{{Amount: 7, Expires: 3000}, {Amount: 5, Expires: 0}}; err != nil || !reflect.DeepEqual(next, want) {
		t.Fatalf("spend = %v, %v; want %v", next, err, want)
	}
	for _, tc := range []struct{ now, want int64 }{{2999, 12}, {3000, 5}} {
		if balance, err := activeBalance(next, tc.now); err != nil || balance != tc.want {
			t.Fatalf("balance at %d = %d, %v; want %d", tc.now, balance, err, tc.want)
		}
	}
	if _, err := apply(next, operation{Kind: "spend", Amount: 6}, time.UnixMilli(3000)); !errors.Is(err, ErrInsufficient) {
		t.Fatalf("insufficient funds: %v", err)
	}
}

func TestGrantLimitsAndExpiration(t *testing.T) {
	now := time.UnixMilli(1000)
	lots := []lot{{Amount: maxBalance - 1, Expires: 2000}}
	if _, err := apply(lots, operation{Kind: "grant", Amount: 2, Expires: 2000}, now); err == nil {
		t.Fatal("grant beyond the balance limit succeeded")
	}
	if _, err := apply(lots, operation{Kind: "grant", Amount: 1, Expires: 1000}, now); err == nil {
		t.Fatal("already expired grant succeeded")
	}
	next, err := apply(lots, operation{Kind: "grant", Amount: 1, Expires: 2000}, now)
	if err != nil || !reflect.DeepEqual(next, []lot{{Amount: maxBalance, Expires: 2000}}) {
		t.Fatalf("grant = %v, %v", next, err)
	}
}

func TestLatePurchaseGrantDoesNotMakeExpiredCreditsSpendable(t *testing.T) {
	now := time.UnixMilli(4000)
	lots, err := apply([]lot{{Amount: 7}}, operation{Kind: "grant", Amount: 10, Expires: 3000, Source: "order"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if balance, err := activeBalance(lots, now.UnixMilli()); err != nil || balance != 7 {
		t.Fatalf("available amount after expired payment = %d, %v", balance, err)
	}
}

func TestReservationRetainsSpendingOrderAndSource(t *testing.T) {
	lots := []lot{{Amount: 3}, {Amount: 5, Expires: 5000, Source: "purchase"}, {Amount: 2, Expires: 2000}}
	next, held := debitLots(lots, 4, true)
	wantHeld := []lot{{Amount: 2, Expires: 2000}, {Amount: 2, Expires: 5000, Source: "purchase"}}
	wantNext := []lot{{Amount: 3, Expires: 5000, Source: "purchase"}, {Amount: 3}}
	if !reflect.DeepEqual(held, wantHeld) || !reflect.DeepEqual(next, wantNext) {
		t.Fatalf("hold = %v, remaining = %v; want %v, %v", held, next, wantHeld, wantNext)
	}
}

func TestSettlementDoesNotRestoreExpiredOrRefundedLots(t *testing.T) {
	lots := []lot{{Amount: 2, Expires: 5000, Source: "paid"}, {Amount: 3, Expires: 3000}}
	held := []lot{{Amount: 2, Expires: 2000}, {Amount: 3, Expires: 4000, Source: "refunded"},
		{Amount: 4, Expires: 5000, Source: "paid"}, {Amount: 1, Source: "paid"}}
	var checked []string
	next, err := restoreReservedLots(lots, held, 4, 3000, func(source string) (bool, error) {
		checked = append(checked, source)
		return source == "refunded", nil
	})
	want := []lot{{Amount: 6, Expires: 5000, Source: "paid"}, {Amount: 1, Source: "paid"}}
	if err != nil || !reflect.DeepEqual(next, want) || !reflect.DeepEqual(checked, []string{"refunded", "paid"}) {
		t.Fatalf("restored = %v, checked = %v, err = %v; want %v", next, checked, err, want)
	}
}

func TestSettlementRetainsHoldOnReversalLookupOrCapacityFailure(t *testing.T) {
	lookupErr := errors.New("reversal lookup unavailable")
	held := []lot{{Amount: 3, Source: "receipt-purchase"}}
	if _, err := restoreReservedLots(nil, held, 0, 1000, func(string) (bool, error) {
		return false, lookupErr
	}); !errors.Is(err, lookupErr) {
		t.Fatalf("expected reversal lookup to fail closed: %v", err)
	}
	if _, err := restoreReservedLots([]lot{{Amount: maxBalance}}, held, 0, 1000, func(string) (bool, error) {
		return false, nil
	}); err == nil {
		t.Fatal("settlement raised balance above wallet limit")
	}
}

func TestReservationJournalAcceptsOnlyConsistentCancellation(t *testing.T) {
	zero, used := int64(0), int64(1)
	held := []lot{{Amount: 1}}
	for _, tc := range []struct {
		name   string
		record reservation
		valid  bool
	}{
		{"missing marker", reservation{}, false},
		{"canceled before reservation", reservation{Canceled: true}, true},
		{"marker cannot contain credits", reservation{Canceled: true, Lots: held}, false},
		{"canceled after release", reservation{Amount: 1, Lots: held, Used: &zero, Canceled: true}, true},
		{"canceled hold must be released", reservation{Amount: 1, Lots: held, Canceled: true}, false},
		{"positive settlement is not canceled", reservation{Amount: 1, Lots: held, Used: &used, Canceled: true}, false},
		{"positive settlement remains valid", reservation{Amount: 1, Lots: held, Used: &used}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.record.valid() != tc.valid {
				t.Fatalf("reservation validity = %t, want %t", !tc.valid, tc.valid)
			}
		})
	}
}

func TestExpiryUsesUnspentAvailableAmountsAndOriginalLotDetails(t *testing.T) {
	const deadline = 2000
	initial := []lot{{Amount: 10, Expires: deadline, Source: "purchase"}, {Amount: 4}}
	afterSpend, err := apply(initial, operation{Kind: "spend", Amount: 3}, time.UnixMilli(deadline-1))
	if err != nil {
		t.Fatal(err)
	}
	summary, err := summarizeLots(afterSpend, deadline)
	wantExpired := []lot{{Amount: 7, Expires: deadline, Source: "purchase"}}
	if err != nil || summary.Balance != 4 || !reflect.DeepEqual(summary.Lots, []lot{{Amount: 4}}) ||
		!reflect.DeepEqual(summary.ExpiredLots, wantExpired) {
		t.Fatalf("summary at expiration = %+v, %v", summary, err)
	}
	expiry, err := expirationOperation(afterSpend, deadline)
	if err != nil || expiry.Kind != "expire" || expiry.Amount != 7 || !reflect.DeepEqual(expiry.ExpiredLots, wantExpired) {
		t.Fatalf("expiration history operation = %+v, %v", expiry, err)
	}
	next, err := apply(afterSpend, operation{Kind: "reverse", Source: "purchase"}, time.UnixMilli(deadline))
	if err != nil {
		t.Fatal(err)
	}
	if expiry, err := expirationOperation(next, deadline); err != nil || expiry.Amount != 0 {
		t.Fatalf("pruned expiration was counted again: %+v, %v", expiry, err)
	}
}

func TestExpiryDoesNotCountHeldCredits(t *testing.T) {
	const deadline = 2000
	lots := []lot{{Amount: 10, Expires: deadline}}
	available, held := debitLots(lots, 7, true)
	expiry, err := expirationOperation(available, deadline)
	if err != nil || expiry.Amount != 3 {
		t.Fatalf("unspent available portion = %+v, %v", expiry, err)
	}
	next, err := restoreReservedLots(available, held, 1, deadline, func(string) (bool, error) {
		return false, nil
	})
	if err != nil || len(next) != 0 {
		t.Fatalf("settling held expired credits made them available: %+v, %v", next, err)
	}
}
