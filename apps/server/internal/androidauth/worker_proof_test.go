package androidauth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestWebReadGrantIsBoundToAssignedNode(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := &WorkerProof{key: public}
	now := time.Now().Truncate(time.Second)
	sid := strings.Repeat("a", 64)
	signed := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"iss": "mane-auth-staging", "aud": "mane-web-shop-read", "node": "staging-b",
		"sub": sid, "iat": now.Unix(), "exp": now.Add(5 * time.Minute).Unix(),
	})
	signed.Header["kid"] = "mane-web-read-v1"
	token, err := signed.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	if key, ok := verifier.WebReadSession(token, "staging-b", now); !ok || key != sid {
		t.Fatal("assigned node rejected the grant")
	}
	if _, ok := verifier.WebReadSession(token, "staging-a", now); ok {
		t.Fatal("accepted a grant for a different node")
	}
	if _, ok := verifier.WebReadSession(token, "staging-b", now.Add(5*time.Minute)); ok {
		t.Fatal("accepted an expired grant")
	}
}

func TestWorkerProofAllowsOnlyItsOwnFreshRequestOnce(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(public)
	if err != nil {
		t.Fatal(err)
	}
	verifier, err := NewWorkerProof(base64.StdEncoding.EncodeToString(der))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().Truncate(time.Second)
	raw := []byte("challenge body")
	claims := workerClaims{Method: "POST", Path: "/auth/challenge",
		BodyHash: base64.RawURLEncoding.EncodeToString(sha256Bytes(raw)), RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "mane-auth-staging", Audience: jwt.ClaimStrings{"staging-a"}, IssuedAt: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(5 * time.Second)), ID: "c268fb05-e07f-4d36-b906-a65bdf96bb1d",
		}}
	signed := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	signed.Header["kid"] = "mane-worker-v1"
	token, err := signed.SignedString(private)
	if err != nil {
		t.Fatal(err)
	}
	if verifier.accepts(token, "staging-b", "POST", "/auth/challenge", raw, now) ||
		verifier.accepts(token, "staging-a", "POST", "/auth/challenge", []byte("wrong"), now) ||
		verifier.accepts(token, "staging-a", "GET", "/auth/challenge", raw, now) ||
		verifier.accepts(token, "staging-a", "POST", "/auth/challenge", raw, now.Add(5*time.Second)) {
		t.Fatal("accepted a mismatched or expired proof")
	}
	if !verifier.accepts(token, "staging-a", "POST", "/auth/challenge", raw, now) ||
		verifier.accepts(token, "staging-a", "POST", "/auth/challenge", raw, now) {
		t.Fatal("proof must be accepted exactly once")
	}
}
