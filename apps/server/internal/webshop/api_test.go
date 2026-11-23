package webshop

import (
	"context"
	"errors"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/gocql/gocql"
)

func TestUnsignedShopRouteLooksAbsent(t *testing.T) {
	a := &API{proof: func(string, string, string, []byte, time.Time) bool { return false }}
	r := httptest.NewRequest("POST", Prefix+"order-apply", strings.NewReader("{}"))
	w := httptest.NewRecorder()
	a.ServeHTTP(w, r)
	if w.Code != 404 || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("unsigned request = %d, %v", w.Code, w.Header())
	}
}

func TestEvidenceDoesNotRegressRefund(t *testing.T) {
	current := order{Amount: 100, Status: "pending"}
	event := order{Amount: 100, Session: "cs_test_example", Intent: "pi_example"}
	if applied, err := applyEvidence(&current, event, "grant"); err != nil || !applied || current.Status != "fulfillment_pending" {
		t.Fatalf("payment = %+v, %t, %v", current, applied, err)
	}
	event.Refunded = 100
	if applied, err := applyEvidence(&current, event, "refund"); err != nil || !applied || current.Status != "refund_pending" {
		t.Fatalf("refund = %+v, %t, %v", current, applied, err)
	}
	event.Refunded = 0
	if applied, err := applyEvidence(&current, event, "grant"); err != nil || applied || current.Status != "refund_pending" {
		t.Fatalf("late payment = %+v, %t, %v", current, applied, err)
	}
	event.Amount = 500
	if _, err := applyEvidence(&current, event, "grant"); !errors.Is(err, errBad) {
		t.Fatalf("mismatched amount = %v", err)
	}
}

func TestScyllaShop(t *testing.T) {
	if os.Getenv("MANE_TEST_SCYLLA") != "1" {
		t.Skip("requires an isolated Scylla keyspace and both schemas")
	}
	makeAPI := func() (*API, *credits.Wallet) {
		t.Helper()
		wallet, err := credits.OpenFromEnv()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(wallet.Close)
		api, err := New(wallet, wallet.Session(), func(string, string, string, []byte, time.Time) bool { return true },
			func(context.Context, string, string) (string, error) { return "test", nil })
		if err != nil {
			t.Fatal(err)
		}
		return api, wallet
	}
	a, wallet := makeAPI()
	b, _ := makeAPI()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	id := gocql.TimeUUID().String()
	sub := "shop-test-" + id
	o := order{ID: id, Subject: sub, Pack: "trial", Title: "Test credits", Credits: 10, Amount: 200}
	created, err := a.orders(ctx, "order-create", input{Order: o})
	if err != nil || created.Status != "pending" {
		t.Fatalf("create = %+v, %v", created, err)
	}
	if _, err := b.orders(ctx, "order-get", input{Order: order{ID: id, Subject: "other-subject"}}); !errors.Is(err, gocql.ErrNotFound) {
		t.Fatalf("other account read = %v", err)
	}
	if orders, err := b.store.list(ctx, sub); err != nil || len(orders) != 1 || orders[0].ID != id {
		t.Fatalf("history = %+v, %v", orders, err)
	}
	sessionKey := strings.Repeat("a", 64)
	if _, err := a.sessions(ctx, "session-put", input{Key: sessionKey, Subject: sub}); err != nil {
		t.Fatal(err)
	}
	if result, err := b.sessions(ctx, "session-get", input{Key: sessionKey}); err != nil || result.(map[string]string)["subject"] != sub {
		t.Fatalf("shared session = %+v, %v", result, err)
	}
	if _, err := b.sessions(ctx, "session-delete", input{Key: sessionKey}); err != nil {
		t.Fatal(err)
	}
	if _, err := a.sessions(ctx, "session-get", input{Key: sessionKey}); !errors.Is(err, gocql.ErrNotFound) {
		t.Fatalf("logout = %v", err)
	}
	stateKey := strings.Repeat("b", 64)
	if _, err := a.sessions(ctx, "oauth-put", input{Key: stateKey, Nonce: strings.Repeat("n", 43), Verifier: strings.Repeat("v", 43)}); err != nil {
		t.Fatal(err)
	}
	claim := input{Key: stateKey, Claim: gocql.TimeUUID().String()}
	for _, api := range []*API{b, a} {
		if _, err := api.sessions(ctx, "oauth-claim", claim); err != nil {
			t.Fatal(err)
		}
	}
	claim.Claim = gocql.TimeUUID().String()
	if _, err := a.sessions(ctx, "oauth-claim", claim); !errors.Is(err, gocql.ErrNotFound) {
		t.Fatalf("used OAuth state = %v", err)
	}
	evidence := order{ID: id, Amount: 200, Session: "cs_test_example", Intent: "pi_example"}
	var wg sync.WaitGroup
	for _, api := range []*API{a, b} {
		wg.Go(func() {
			result, err := api.settle(ctx, "grant", evidence)
			if err != nil || result.Status != "paid" {
				t.Errorf("grant = %+v, %v", result, err)
			}
		})
	}
	wg.Wait()
	if balance, err := wallet.Balance(ctx, sub); err != nil || balance != 10 {
		t.Fatalf("balance after concurrent confirmation = %d, %v", balance, err)
	}
	evidence.Refunded = 200
	if result, err := b.settle(ctx, "refund", evidence); err != nil || result.Status != "refunded" {
		t.Fatalf("refund = %+v, %v", result, err)
	}
	evidence.Refunded = 0
	if result, err := a.settle(ctx, "grant", evidence); err != nil || result.Status != "refunded" {
		t.Fatalf("late payment = %+v, %v", result, err)
	}
	if balance, err := wallet.Balance(ctx, sub); err != nil || balance != 0 {
		t.Fatalf("balance after refund = %d, %v", balance, err)
	}
}
