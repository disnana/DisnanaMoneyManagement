package androidauth

import (
	"context"
	"crypto/x509"
	"errors"
	"time"

	"github.com/gocql/gocql"
)

type scyllaSessions struct{ db *gocql.Session }

func NewScyllaSessions(db *gocql.Session) (SessionStore, error) {
	if err := db.Query("SELECT id FROM android_account_sessions LIMIT 1").Iter().Close(); err != nil {
		return nil, err
	}
	return scyllaSessions{db}, nil
}

func (m scyllaSessions) find(ctx context.Context, id string, now time.Time) (session, error) {
	s := session{id: id}
	var encoded string
	err := m.db.Query("SELECT subject, device, device_key, refresh_hash, refresh_expiry FROM android_account_sessions WHERE id = ?", id).
		WithContext(ctx).Scan(&s.subject, &s.device, &encoded, &s.refreshHash, &s.refreshExpiry)
	if errors.Is(err, gocql.ErrNotFound) || err == nil && !now.Before(s.refreshExpiry) {
		return session{}, errAuth
	}
	if err != nil {
		return session{}, err
	}
	key, fingerprint, err := publicKey(encoded)
	if err != nil || fingerprint != s.device {
		return session{}, errAuth
	}
	s.key = key
	return s, nil
}

func (m scyllaSessions) insert(ctx context.Context, s session) error {
	key, err := x509.MarshalPKIXPublicKey(s.key)
	if err != nil {
		return err
	}
	return m.write(ctx, m.db.Query("INSERT INTO android_account_sessions (id, subject, device, device_key, refresh_hash, refresh_expiry) VALUES (?, ?, ?, ?, ?, ?) IF NOT EXISTS",
		s.id, s.subject, s.device, wire.EncodeToString(key), s.refreshHash, s.refreshExpiry))
}

func (m scyllaSessions) rotate(ctx context.Context, s session, previous string) error {
	// Write every column so TTL extends for the whole session when the refresh token rotates.
	key, err := x509.MarshalPKIXPublicKey(s.key)
	if err != nil {
		return err
	}
	return m.write(ctx, m.db.Query("UPDATE android_account_sessions SET subject = ?, device = ?, device_key = ?, refresh_hash = ?, refresh_expiry = ? WHERE id = ? IF refresh_hash = ?",
		s.subject, s.device, wire.EncodeToString(key), s.refreshHash, s.refreshExpiry, s.id, previous))
}

func (m scyllaSessions) remove(ctx context.Context, id string) error {
	_, err := m.db.Query("DELETE FROM android_account_sessions WHERE id = ? IF EXISTS", id).
		WithContext(ctx).SerialConsistency(gocql.LocalSerial).MapScanCAS(map[string]any{})
	return err
}

func (m scyllaSessions) write(ctx context.Context, query *gocql.Query) error {
	applied, err := query.WithContext(ctx).SerialConsistency(gocql.LocalSerial).MapScanCAS(map[string]any{})
	if err == nil && !applied {
		return errAuth
	}
	return err
}
