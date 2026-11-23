package androidauth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

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
