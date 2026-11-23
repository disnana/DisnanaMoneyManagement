package webshop

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
)

type walletFixture struct{}

func (walletFixture) Snapshot(_ context.Context, subject string) (credits.Snapshot, error) {
	if subject != "same-google-sub" {
		return credits.Snapshot{}, fmt.Errorf("unexpected subject")
	}
	return credits.Snapshot{Balance: 12}, nil
}
func (walletFixture) GrantPurchase(context.Context, string, string, int64, time.Time) error {
	return nil
}
func (walletFixture) ReversePurchase(context.Context, string, string) error { return nil }

func TestSignedBackendRequestsBindMethodPathBodyAndTime(t *testing.T) {
	key := []byte(strings.Repeat("a", 32))
	api, err := New(walletFixture{}, base64.RawURLEncoding.EncodeToString(key), func(context.Context, string, string) (string, error) {
		return "same-google-sub", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	api.now = func() time.Time { return time.Unix(100, 0) }
	const body = `{"subject":"same-google-sub"}`
	path := Prefix + "wallet"
	sign := func(path, body string, timestamp int64) string {
		mac := hmac.New(sha256.New, key)
		fmt.Fprintf(mac, "%d\nPOST\n%s\n%x", timestamp, path, sha256.Sum256([]byte(body)))
		return fmt.Sprintf("%d.%s", timestamp, base64.RawURLEncoding.EncodeToString(mac.Sum(nil)))
	}
	for _, tc := range []struct {
		name, body, signature string
		want                  int
	}{
		{"valid", body, sign(path, body, 100), 200},
		{"unsigned", body, "", 403},
		{"altered body", body + " ", sign(path, body, 100), 403},
		{"different path", body, sign(Prefix+"grant", body, 100), 403},
		{"expired", body, sign(path, body, 69), 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, path, strings.NewReader(tc.body))
			r.Header.Set("X-Mane-Web-Signature", tc.signature)
			w := httptest.NewRecorder()
			api.ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got HTTP %d; want %d", w.Code, tc.want)
			}
		})
	}
}
