package androidauth

import (
	"context"
	"crypto/rsa"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// GoogleIDToken verifies claims against a trusted Google signing key source.
// The caller supplies a resolver for Google's published keys. The PoC tests inject a fixture key.
type GoogleIDToken struct {
	Audience string
	Key      func(context.Context, string) (*rsa.PublicKey, error)
	Now      func() time.Time
}

func (g GoogleIDToken) Subject(ctx context.Context, raw string) (string, error) {
	if g.Audience == "" || g.Key == nil || len(raw) > 8192 {
		return "", errAuth
	}
	claims := &jwt.RegisteredClaims{}
	now := g.Now
	if now == nil {
		now = time.Now
	}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		kid, ok := t.Header["kid"].(string)
		if !ok || kid == "" || len(kid) > 128 {
			return nil, errAuth
		}
		return g.Key(ctx, kid)
	}, jwt.WithValidMethods([]string{"RS256"}), jwt.WithAudience(g.Audience), jwt.WithExpirationRequired(), jwt.WithTimeFunc(now))
	if err != nil || !parsed.Valid || claims.Subject == "" || len(claims.Subject) > 255 ||
		(claims.Issuer != "accounts.google.com" && claims.Issuer != "https://accounts.google.com") {
		return "", errAuth
	}
	if len(claims.Audience) != 1 {
		return "", errors.New("unsupported Google token audience set")
	}
	return claims.Subject, nil
}

type IntegrityVerdict struct {
	Package           string
	RequestHash       string
	Timestamp         time.Time
	AppRecognition    string
	DeviceRecognition []string
}

func (v IntegrityVerdict) accepts(pkg, hash string, now time.Time) bool {
	if v.Package != pkg || v.RequestHash != hash || v.AppRecognition != "PLAY_RECOGNIZED" ||
		v.Timestamp.Before(now.Add(-2*time.Minute)) || v.Timestamp.After(now.Add(5*time.Second)) {
		return false
	}
	for _, verdict := range v.DeviceRecognition {
		if verdict == "MEETS_DEVICE_INTEGRITY" {
			return true
		}
	}
	return false
}
