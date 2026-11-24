package androidauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/disnana/dmm/server/internal/receiptai"
)

type fixtureReceiptAPI struct{}

func (fixtureReceiptAPI) Config() receiptai.ConfigView {
	return receiptai.ConfigView{PriceVersion: "test-1", CreditPerImage: 1, MaxJSONBytes: 4096}
}

func (fixtureReceiptAPI) Submit(_ context.Context, key receiptai.JobKey, maximum int64, version string, raw []byte) (receiptai.JobView, error) {
	if key.Subject != "google-account-sub" || key.RequestID != "fixture" || version != "test-1" ||
		maximum != 1 || string(raw) != `{"groups":[]}` {
		return receiptai.JobView{}, receiptai.ErrReceiptInput
	}
	return receiptai.JobView{}, nil
}

func (fixtureReceiptAPI) Job(_ context.Context, key receiptai.JobKey) (receiptai.JobView, error) {
	if key.Subject != "google-account-sub" || key.RequestID != "fixture" {
		return receiptai.JobView{}, receiptai.ErrReceiptNotFound
	}
	return receiptai.JobView{}, nil
}

func TestReceiptUploadPreservesSignedBodyAndDoesNotWidenOtherProofs(t *testing.T) {
	sessions := NewMemorySessions()
	f := setupWithReceipts(t, func() SessionStore { return sessions }, true, fixtureReceiptAPI{})
	session := f.login()
	origin := f.a.URL
	path := receiptJobsPrefix + "fixture"
	request := `{"maximum_credit":1,"price_version":"test-1","request":{"groups":[]}}`
	f.want(origin, http.MethodPost, path, request, session.Access, ticket{}, nil, 401)
	conf := f.challenge(origin, http.MethodGet, receiptConfigPath, "", session.Access, "")
	upload := f.challenge(origin, http.MethodPost, path, request, session.Access, "")
	f.clock.Add(int64(6 * time.Second))
	f.want(origin, http.MethodGet, receiptConfigPath, "", session.Access, conf, f.device, 401)
	f.want(origin, http.MethodPost, path, request, session.Access, upload, f.device, 202)
	f.want(origin, http.MethodPost, path, request, session.Access, upload, f.device, 401)

	changed := f.challenge(origin, http.MethodPost, path, request, session.Access, "")
	f.want(origin, http.MethodPost, path, request+" ", session.Access, changed, f.device, 401)
	status := f.challenge(origin, http.MethodGet, path, "", session.Access, "")
	f.want(origin, http.MethodGet, path, "", session.Access, status, f.device, 200)
}

func TestReceiptErrorsAreStable(t *testing.T) {
	tests := []struct {
		err  error
		code int
	}{
		{credits.ErrInsufficient, 402},
		{receiptai.ErrReceiptQuote, 409},
		{receiptai.ErrReceiptInput, 400},
		{receiptai.ErrReceiptNotFound, 404},
	}
	for _, tt := range tests {
		w := httptest.NewRecorder()
		replyReceipt(w, 202, receiptai.JobView{}, tt.err)
		if w.Code != tt.code {
			t.Fatalf("got status %d, want %d for %v", w.Code, tt.code, tt.err)
		}
	}
}
