package webshop

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/gocql/gocql"
)

const Prefix = "/_internal/web-shop/"

type Wallet interface {
	Snapshot(context.Context, string) (credits.Snapshot, error)
	Summary(context.Context, string) (credits.Summary, error)
	History(context.Context, string, string, int) (credits.HistoryPage, error)
	GrantPurchase(context.Context, string, string, int64, time.Time) error
	ReversePurchase(context.Context, string, string) error
}
type proofCheck func(string, string, string, []byte, time.Time) bool

type API struct {
	wallet       Wallet
	store        store
	proof        proofCheck
	verifyGoogle func(context.Context, string, string) (string, error)
}

func New(wallet Wallet, db *gocql.Session, check proofCheck, verify func(context.Context, string, string) (string, error)) (*API, error) {
	if wallet == nil || db == nil || check == nil || verify == nil {
		return nil, errors.New("web shop requires ScyllaDB and Worker proof")
	}
	for _, table := range []string{"shop_order_owners", "shop_orders", "shop_oauth_attempts", "shop_sessions", "shop_rate_windows", "shop_stripe_events"} {
		if err := db.Query("SELECT * FROM " + table + " LIMIT 1").Iter().Close(); err != nil {
			return nil, err
		}
	}
	return &API{wallet: wallet, store: store{db: db}, proof: check, verifyGoogle: verify}, nil
}

var (
	orderID   = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	hashID    = regexp.MustCompile(`^[a-f0-9]{64}$`)
	secretID  = regexp.MustCompile(`^[a-zA-Z0-9_-]{43}$`)
	packID    = regexp.MustCompile(`^[a-z0-9_-]{1,40}$`)
	sessionID = regexp.MustCompile(`^cs_test_[a-zA-Z0-9_]{5,255}$`)
	intentID  = regexp.MustCompile(`^pi_[a-zA-Z0-9_]{5,255}$`)
	errBad    = errors.New("invalid shop request")
	errAuth   = errors.New("unauthorized")
)

type input struct {
	Key      string `json:"key"`
	Claim    string `json:"claim"`
	Verifier string `json:"verifier"`
	Nonce    string `json:"nonce"`
	IDToken  string `json:"id_token"`
	Subject  string `json:"subject"`
	Limit    int    `json:"limit"`
	Cursor   string `json:"cursor"`
	Order    order  `json:"order"`
	Action   string `json:"action"`
}

func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost || r.URL.RawQuery != "" || r.URL.ForceQuery || r.URL.EscapedPath() != r.URL.Path {
		http.NotFound(w, r)
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 12<<10))
	if err != nil || !a.proof(r.Header.Get("X-Mane-Worker-Proof"), r.Method, r.URL.Path, raw, time.Now()) {
		http.NotFound(w, r)
		return
	}
	var in input
	if err := json.Unmarshal(raw, &in); err != nil {
		shopResponse(w, nil, errBad)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, Prefix)
	var result any
	switch path {
	case "identity":
		var subject string
		subject, err = a.verifyGoogle(r.Context(), in.IDToken, in.Nonce)
		if err != nil {
			err = errAuth
		}
		result = map[string]string{"subject": subject}
	case "session-get", "session-put", "session-delete", "oauth-put", "oauth-claim", "rate", "event-get", "event-put":
		result, err = a.sessions(r.Context(), path, in)
	case "wallet", "orders", "wallet-summary", "orders-page", "activity-page":
		if in.Subject == "" || len(in.Subject) > 255 {
			err = errBad
			break
		}
		switch path {
		case "wallet":
			result, err = a.wallet.Snapshot(r.Context(), in.Subject)
		case "orders":
			result, err = a.store.list(r.Context(), in.Subject)
		case "wallet-summary":
			result, err = a.wallet.Summary(r.Context(), in.Subject)
		case "orders-page", "activity-page":
			const pageSize = 20
			if len(in.Cursor) > 208 {
				err = errBad
			} else if path == "orders-page" {
				result, err = a.store.orderPage(r.Context(), in.Subject, in.Cursor, pageSize)
			} else {
				result, err = a.wallet.History(r.Context(), in.Subject, in.Cursor, pageSize)
			}
		}
	case "order-get", "order-create", "order-checkout", "order-apply":
		result, err = a.orders(r.Context(), path, in)
	default:
		err = gocql.ErrNotFound
	}
	shopResponse(w, result, err)
}

func shopResponse(w http.ResponseWriter, data any, err error) {
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		code := http.StatusServiceUnavailable
		switch {
		case errors.Is(err, errBad), errors.Is(err, credits.ErrInvalidHistoryCursor):
			code = http.StatusBadRequest
		case errors.Is(err, errAuth):
			code = http.StatusUnauthorized
		case errors.Is(err, gocql.ErrNotFound):
			code = http.StatusNotFound
		case errors.Is(err, errConflict), errors.Is(err, credits.ErrOperationConflict):
			code = http.StatusConflict
		}
		w.WriteHeader(code)
		data = map[string]string{"error": http.StatusText(code)}
	}
	if data == nil {
		data = map[string]bool{"ok": true}
	}
	_ = json.NewEncoder(w).Encode(data)
}

func (a *API) sessions(ctx context.Context, path string, in input) (any, error) {
	if !hashID.MatchString(in.Key) {
		return nil, errBad
	}
	q := a.store.query
	switch path {
	case "event-get":
		var at time.Time
		err := q(ctx, "SELECT received_at FROM shop_stripe_events WHERE id = ?", in.Key).Scan(&at)
		return map[string]bool{"received": true}, err
	case "event-put":
		return nil, q(ctx, "INSERT INTO shop_stripe_events (id, received_at) VALUES (?, ?)", in.Key, time.Now()).Exec()
	case "rate":
		if in.Limit < 1 || in.Limit > 100 {
			return nil, errBad
		}
		allowed, err := a.store.allow(ctx, in.Key, in.Limit)
		return map[string]bool{"allowed": allowed}, err
	case "oauth-put":
		if !secretID.MatchString(in.Nonce) || !secretID.MatchString(in.Verifier) {
			return nil, errBad
		}
		return nil, q(ctx, "INSERT INTO shop_oauth_attempts (id, nonce, verifier, claim_id) VALUES (?, ?, ?, '')", in.Key, in.Nonce, in.Verifier).Exec()
	case "oauth-claim":
		if !orderID.MatchString(in.Claim) {
			return nil, errBad
		}
		if _, err := cas(q(ctx, "UPDATE shop_oauth_attempts SET claim_id = ? WHERE id = ? IF claim_id = ''", in.Claim, in.Key)); err != nil {
			return nil, err
		}
		var claim, nonce, verifier string
		err := q(ctx, "SELECT claim_id, nonce, verifier FROM shop_oauth_attempts WHERE id = ?", in.Key).Scan(&claim, &nonce, &verifier)
		if err != nil {
			return nil, err
		}
		if claim != in.Claim || nonce == "" || verifier == "" {
			return nil, gocql.ErrNotFound
		}
		return map[string]string{"nonce": nonce, "verifier": verifier}, nil
	case "session-put":
		if in.Subject == "" || len(in.Subject) > 255 {
			return nil, errBad
		}
		return nil, q(ctx, "INSERT INTO shop_sessions (id, subject) VALUES (?, ?)", in.Key, in.Subject).Exec()
	case "session-delete":
		return nil, q(ctx, "DELETE FROM shop_sessions WHERE id = ?", in.Key).Exec()
	default:
		var subject string
		err := q(ctx, "SELECT subject FROM shop_sessions WHERE id = ?", in.Key).Scan(&subject)
		return map[string]string{"subject": subject}, err
	}
}

func stripeURL(value, host string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.Host == host && u.User == nil && len(value) <= 2048
}

func (a *API) orders(ctx context.Context, path string, in input) (order, error) {
	o := in.Order
	if !orderID.MatchString(o.ID) {
		return order{}, errBad
	}
	switch path {
	case "order-create":
		if o.Subject == "" || len(o.Subject) > 255 || !packID.MatchString(o.Pack) || len(o.Title) == 0 || len(o.Title) > 320 ||
			o.Amount <= 0 || o.Amount > 99999999 || o.Credits <= 0 || o.Credits > 1<<53-1 ||
			(o.Validity != nil && (*o.Validity <= 0 || *o.Validity > 10*365*86400)) {
			return order{}, errBad
		}
		return a.store.create(ctx, order{ID: o.ID, Subject: o.Subject, Pack: o.Pack, Title: o.Title, Amount: o.Amount,
			Credits: o.Credits, Validity: o.Validity, Created: time.Now().Unix()})
	case "order-checkout":
		if !sessionID.MatchString(o.Session) || !stripeURL(o.CheckoutURL, "checkout.stripe.com") {
			return order{}, errBad
		}
		return a.store.update(ctx, o.ID, func(current *order) (bool, error) {
			if current.Subject != o.Subject || current.Status != "pending" || current.Session != "" && current.Session != o.Session {
				return false, errConflict
			}
			if current.CheckoutURL == o.CheckoutURL && current.Session == o.Session {
				return false, nil
			}
			current.Session, current.CheckoutURL = o.Session, o.CheckoutURL
			return true, nil
		})
	case "order-apply":
		return a.settle(ctx, in.Action, o)
	default:
		current, _, err := a.store.read(ctx, o.ID)
		if err == nil && o.Subject != "" && current.Subject != o.Subject {
			return order{}, gocql.ErrNotFound
		}
		return current, err
	}
}

func (a *API) settle(ctx context.Context, action string, evidence order) (order, error) {
	current, err := a.store.update(ctx, evidence.ID, func(o *order) (bool, error) {
		return applyEvidence(o, evidence, action)
	})
	if err != nil {
		return current, err
	}
	next := ""
	switch current.Status {
	case "fulfillment_pending":
		if action != "grant" {
			return current, nil
		}
		var expiry time.Time
		if current.Expires != 0 {
			expiry = time.UnixMilli(current.Expires)
		}
		err = a.wallet.GrantPurchase(ctx, current.Subject, current.ID, current.Credits, expiry)
		if errors.Is(err, credits.ErrPurchaseReversed) {
			latest, _, readErr := a.store.read(ctx, current.ID)
			return latest, readErr
		}
		next = "paid"
	case "refund_pending":
		if action != "refund" {
			return current, nil
		}
		err = a.wallet.ReversePurchase(ctx, current.Subject, current.ID)
		next = "refunded"
	}
	if err != nil || next == "" {
		return current, err
	}
	return a.store.update(ctx, current.ID, func(o *order) (bool, error) {
		if o.Status != current.Status {
			return false, nil
		}
		o.Status = next
		return true, nil
	})
}

func applyEvidence(o *order, event order, action string) (bool, error) {
	if event.Session != "" && !sessionID.MatchString(event.Session) ||
		event.Intent != "" && !intentID.MatchString(event.Intent) ||
		event.Session != "" && o.Session != "" && event.Session != o.Session ||
		event.Intent != "" && o.Intent != "" && event.Intent != o.Intent {
		return false, errConflict
	}
	if action == "expired" || action == "payment_failed" {
		if o.Status != "pending" {
			return false, nil
		}
		o.Status, o.CheckoutURL = action, ""
		return true, nil
	}
	if o.Amount != event.Amount || event.Intent == "" || event.Refunded < 0 || event.Refunded > o.Amount ||
		event.Receipt != "" && !stripeURL(event.Receipt, "pay.stripe.com") {
		return false, errBad
	}
	if o.Status == "refunded" || o.Status == "refund_pending" {
		return false, nil
	}
	switch action {
	case "refund":
		if event.Refunded != o.Amount {
			return false, errBad
		}
		o.Status = "refund_pending"
	case "review":
		if event.Refunded == o.Amount {
			return false, errBad
		}
		if o.Status == "review_required" && o.Refunded >= event.Refunded {
			return false, nil
		}
		o.Status = "review_required"
	case "grant":
		if event.Refunded != 0 || event.Session == "" || event.Expires < 0 {
			return false, errBad
		}
		if o.Status == "fulfillment_pending" && o.Expires != event.Expires {
			return false, errConflict
		}
		if o.Status == "paid" || o.Status == "review_required" || o.Status == "fulfillment_pending" {
			return false, nil
		}
		o.Status, o.Expires = "fulfillment_pending", event.Expires
	default:
		return false, errBad
	}
	o.Intent, o.Refunded, o.CheckoutURL = event.Intent, event.Refunded, ""
	if event.Session != "" {
		o.Session = event.Session
	}
	if event.Receipt != "" {
		o.Receipt = event.Receipt
	}
	return true, nil
}
