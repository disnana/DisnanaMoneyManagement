package androidauth

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

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
