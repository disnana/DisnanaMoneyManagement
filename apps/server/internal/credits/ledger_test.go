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
