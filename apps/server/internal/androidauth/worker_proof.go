package androidauth

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// WebReadSession verifies a short-lived read grant and returns its parent Web session hash.
func (w *WorkerProof) WebReadSession(token, node string, now time.Time) (string, bool) {
	if len(token) > 2048 {
		return "", false
	}
	claims := &struct {
		Node string `json:"node"`
		jwt.RegisteredClaims
	}{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Header["kid"] != "mane-web-read-v1" {
			return nil, errAuth
		}
		return w.key, nil
	}, jwt.WithValidMethods([]string{"EdDSA"}), jwt.WithIssuer("mane-auth-staging"),
		jwt.WithAudience("mane-web-shop-read"), jwt.WithExpirationRequired(), jwt.WithTimeFunc(func() time.Time { return now }))
	if err != nil || !parsed.Valid || claims.Node != node || claims.IssuedAt == nil || claims.IssuedAt.After(now.Add(time.Second)) ||
		claims.ExpiresAt.Sub(claims.IssuedAt.Time) != 5*time.Minute || len(claims.Subject) != 64 {
		return "", false
	}
	_, err = hex.DecodeString(claims.Subject)
	return claims.Subject, err == nil
}

type WorkerProof struct {
	key  ed25519.PublicKey
	mu   sync.Mutex
	seen map[string]time.Time
}

type workerClaims struct {
	Method   string `json:"method"`
	Path     string `json:"path"`
	BodyHash string `json:"body_sha256"`
	jwt.RegisteredClaims
}

func NewWorkerProof(raw string) (*WorkerProof, error) {
	der, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, errors.New("invalid Worker public key encoding")
	}
	parsed, err := x509.ParsePKIXPublicKey(der)
	key, ok := parsed.(ed25519.PublicKey)
	if err != nil || !ok {
		return nil, errors.New("Worker public key must be an Ed25519 public key in DER SPKI format")
	}
	return &WorkerProof{key: key, seen: map[string]time.Time{}}, nil
}

func (w *WorkerProof) accepts(token, node, method, path string, raw []byte, now time.Time) bool {
	if len(token) > 2048 {
		return false
	}
	claims := &workerClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(t *jwt.Token) (any, error) {
		if t.Header["kid"] != "mane-worker-v1" {
			return nil, errAuth
		}
		return w.key, nil
	}, jwt.WithValidMethods([]string{"EdDSA"}), jwt.WithIssuer("mane-auth-staging"),
		jwt.WithAudience(node), jwt.WithExpirationRequired(), jwt.WithTimeFunc(func() time.Time { return now }))
	if err != nil || !parsed.Valid || claims.IssuedAt == nil || len(claims.ID) != 36 ||
		claims.IssuedAt.Time.After(now.Add(time.Second)) || claims.ExpiresAt.Sub(claims.IssuedAt.Time) != 5*time.Second ||
		claims.Method != method || claims.Path != path ||
		claims.BodyHash != base64.RawURLEncoding.EncodeToString(sha256Bytes(raw)) {
		return false
	}

	w.mu.Lock()
	defer w.mu.Unlock()
	for id, expiry := range w.seen {
		if !now.Before(expiry) {
			delete(w.seen, id)
		}
	}
	if _, duplicate := w.seen[claims.ID]; duplicate || len(w.seen) >= 4096 {
		return false
	}
	w.seen[claims.ID] = claims.ExpiresAt.Time
	return true
}

func sha256Bytes(raw []byte) []byte {
	hash := sha256.Sum256(raw)
	return hash[:]
}

// ForWebShop binds shop commands to this node and limits the proof to shop paths.
func (w *WorkerProof) ForWebShop(node string) func(string, string, string, []byte, time.Time) bool {
	return func(token, method, path string, body []byte, now time.Time) bool {
		return strings.HasPrefix(path, "/_internal/web-shop/") && w.accepts(token, node, method, path, body, now)
	}
}
