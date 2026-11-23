package androidauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/hmac"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type session struct {
	id, subject, device, refreshHash string
	key                              *ecdsa.PublicKey
	refreshExpiry                    time.Time
}
type tokens struct {
	IssuerNodeID string `json:"issuer_node_id"`
	Origin       string `json:"origin,omitempty"`
	Session      string `json:"session_id"`
	Access       string `json:"access_token"`
	Refresh      string `json:"refresh_token"`
	Expires      int64  `json:"expires_at"`
}

type SessionStore interface {
	find(context.Context, string, time.Time) (session, error)
	insert(context.Context, session) error
	rotate(context.Context, session, string) error
	remove(context.Context, string) error
}

// MemorySessions is shared by local test nodes in one process. It has no persistence.
type MemorySessions struct {
	mu   sync.Mutex
	rows map[string]session
}

func NewMemorySessions() *MemorySessions { return &MemorySessions{rows: make(map[string]session)} }

func (n *Node) issue(s session, refresh string) (tokens, error) {
	now := n.now()
	claims := accessClaims{Device: s.device, RegisteredClaims: jwt.RegisteredClaims{
		ID: s.id, Subject: s.subject, Issuer: "mane-android-poc", Audience: jwt.ClaimStrings{"mane-android-api"},
		IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(10 * time.Minute)),
	}}
	t := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	t.Header["kid"] = n.cfg.SigningKeyID
	signed, err := t.SignedString(n.cfg.SigningKey)
	result := tokens{IssuerNodeID: n.cfg.NodeID, Session: s.id, Access: signed, Refresh: refresh, Expires: claims.ExpiresAt.Unix()}
	if n.cfg.DirectSessions {
		result.Origin = n.cfg.PublicOrigin
	}
	return result, err
}

type accessClaims struct {
	Device string `json:"device"`
	jwt.RegisteredClaims
}

func (n *Node) access(ctx context.Context, raw string) (session, error) {
	claims := &accessClaims{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		if t.Header["kid"] != n.cfg.SigningKeyID {
			return nil, errAuth
		}
		return n.cfg.SigningKey.Public().(ed25519.PublicKey), nil
	}, jwt.WithValidMethods([]string{"EdDSA"}), jwt.WithAudience("mane-android-api"), jwt.WithIssuer("mane-android-poc"), jwt.WithExpirationRequired(), jwt.WithTimeFunc(n.now))
	if err != nil || !parsed.Valid {
		return session{}, errAuth
	}
	s, err := n.sessions.find(ctx, claims.ID, n.now())
	if err != nil {
		return session{}, err
	}
	if claims.Subject != s.subject || claims.Device != s.device {
		return session{}, errAuth
	}
	return s, nil
}

func (m *MemorySessions) find(_ context.Context, id string, now time.Time) (session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.rows[id]
	if !ok || !now.Before(s.refreshExpiry) {
		delete(m.rows, id)
		return session{}, errAuth
	}
	return s, nil
}

func (m *MemorySessions) insert(_ context.Context, s session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, exists := m.rows[s.id]; exists {
		return errAuth
	}
	m.rows[s.id] = s
	return nil
}

func (m *MemorySessions) rotate(_ context.Context, s session, previous string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	current, ok := m.rows[s.id]
	if !ok || current.refreshHash != previous {
		return errAuth
	}
	m.rows[s.id] = s
	return nil
}

func (m *MemorySessions) remove(_ context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.rows, id)
	return nil
}

func (n *Node) start(ctx context.Context, subject, device string, key *ecdsa.PublicKey) (tokens, error) {
	refresh := randomID()
	s := session{randomID(), subject, device, digest([]byte(refresh)), key, n.now().Add(14 * 24 * time.Hour)}
	result, err := n.issue(s, refresh)
	if err != nil {
		return tokens{}, err
	}
	return result, n.sessions.insert(ctx, s)
}

func (n *Node) renew(ctx context.Context, s session, presented string) (tokens, error) {
	previous := s.refreshHash
	if !n.now().Before(s.refreshExpiry) || !hmac.Equal([]byte(previous), []byte(digest([]byte(presented)))) {
		return tokens{}, errAuth
	}
	refresh := randomID()
	s.refreshHash = digest([]byte(refresh))
	s.refreshExpiry = n.now().Add(14 * 24 * time.Hour)
	result, err := n.issue(s, refresh)
	if err != nil {
		return tokens{}, err
	}
	return result, n.sessions.rotate(ctx, s, previous)
}
