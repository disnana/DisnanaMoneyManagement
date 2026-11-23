package webshop

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
)

const Prefix = "/_internal/web-shop/"

type Wallet interface {
	Snapshot(context.Context, string) (credits.Snapshot, error)
	GrantPurchase(context.Context, string, string, int64, time.Time) error
	ReversePurchase(context.Context, string, string) error
}

type API struct {
	wallet       Wallet
	key          []byte
	verifyGoogle func(context.Context, string, string) (string, error)
	now          func() time.Time
}

var orderID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func New(wallet Wallet, encoded string, verify func(context.Context, string, string) (string, error)) (*API, error) {
	key, err := base64.RawURLEncoding.DecodeString(encoded)
	if wallet == nil || verify == nil || err != nil || len(key) < 32 {
		return nil, errors.New("web shop requires ScyllaDB and a base64url worker key of at least 32 bytes")
	}
	return &API{wallet: wallet, key: key, verifyGoogle: verify, now: time.Now}, nil
}

func (a *API) isSigned(r *http.Request, raw []byte) bool {
	stamp, proof, ok := strings.Cut(r.Header.Get("X-Mane-Web-Signature"), ".")
	ts, err := strconv.ParseInt(stamp, 10, 64)
	if !ok || err != nil || ts < a.now().Unix()-30 || ts > a.now().Unix()+30 {
		return false
	}
	sig, err := base64.RawURLEncoding.DecodeString(proof)
	sum := sha256.Sum256(raw)
	mac := hmac.New(sha256.New, a.key)
	mac.Write([]byte(strings.Join([]string{stamp, r.Method, r.URL.Path, hex.EncodeToString(sum[:])}, "\n")))
	return err == nil && hmac.Equal(sig, mac.Sum(nil))
}

func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	respond := func(status int, payload any) {
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(payload)
	}
	reject := func(status int) { respond(status, map[string]string{"error": http.StatusText(status)}) }
	if r.Method != http.MethodPost || r.URL.RawQuery != "" || r.URL.ForceQuery || r.URL.EscapedPath() != r.URL.Path {
		reject(400)
		return
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 12<<10))
	if err != nil {
		reject(400)
		return
	}
	if !a.isSigned(r, raw) {
		reject(403)
		return
	}
	var input struct {
		Subject string `json:"subject"`
		IDToken string `json:"id_token"`
		Nonce   string `json:"nonce"`
		Order   string `json:"order_id"`
		Amount  int64  `json:"amount"`
		Expires int64  `json:"expires_at_ms"`
	}
	if err := json.Unmarshal(raw, &input); err != nil {
		reject(400)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, Prefix)
	if path == "identity" {
		sub, err := a.verifyGoogle(r.Context(), input.IDToken, input.Nonce)
		if err != nil {
			reject(401)
			return
		}
		respond(200, map[string]string{"subject": sub})
		return
	}
	if input.Subject == "" || len(input.Subject) > 255 {
		reject(400)
		return
	}
	switch path {
	case "wallet":
		wallet, err := a.wallet.Snapshot(r.Context(), input.Subject)
		if err != nil {
			reject(503)
			return
		}
		respond(200, wallet)
		return
	case "grant", "reverse":
		if !orderID.MatchString(input.Order) || (path == "grant" && (input.Amount <= 0 || input.Amount > 1<<53-1 || input.Expires < 0)) {
			reject(400)
			return
		}
		if path == "grant" {
			var expiry time.Time
			if input.Expires != 0 {
				expiry = time.UnixMilli(input.Expires)
			}
			err = a.wallet.GrantPurchase(r.Context(), input.Subject, input.Order, input.Amount, expiry)
		} else {
			err = a.wallet.ReversePurchase(r.Context(), input.Subject, input.Order)
		}
		if errors.Is(err, credits.ErrOperationConflict) || errors.Is(err, credits.ErrPurchaseReversed) {
			reject(409)
			return
		}
		if err != nil {
			reject(503)
			return
		}
		respond(200, map[string]bool{"applied": true})
	default:
		reject(404)
	}
}
