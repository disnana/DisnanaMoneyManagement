// Package store is the SQLite persistence layer (pure Go driver, no CGO).
package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

var (
	ErrNotFound = errors.New("not found")
	ErrQuota    = errors.New("storage quota exceeded")
)

type Store struct {
	db *sql.DB
}

// Open opens (and migrates) the database. WAL + busy timeout suit a single-writer server.
func Open(path string) (*Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite: one writer; keeps transactions simple and race-free
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// ---- users & credentials -------------------------------------------------

type User struct {
	ID        []byte
	Name      string
	CreatedAt time.Time
}

func NewID() []byte {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

func (s *Store) CreateUser(ctx context.Context, u User, credID, credData []byte) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	if _, err := tx.ExecContext(ctx, `INSERT INTO users(id,name,created_at) VALUES(?,?,?)`, u.ID, u.Name, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO credentials(id,user_id,data,created_at) VALUES(?,?,?,?)`, credID, u.ID, credData, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) GetUser(ctx context.Context, id []byte) (User, error) {
	var u User
	var created int64
	err := s.db.QueryRowContext(ctx, `SELECT id,name,created_at FROM users WHERE id=?`, id).Scan(&u.ID, &u.Name, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	u.CreatedAt = time.Unix(created, 0)
	return u, err
}

// Credentials returns the stored WebAuthn credential blobs (JSON) of a user.
func (s *Store) Credentials(ctx context.Context, userID []byte) ([][]byte, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT data FROM credentials WHERE user_id=?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out [][]byte
	for rows.Next() {
		var d []byte
		if err := rows.Scan(&d); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) UserByCredential(ctx context.Context, credID []byte) (userID []byte, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT user_id FROM credentials WHERE id=?`, credID).Scan(&userID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return userID, err
}

func (s *Store) UpdateCredential(ctx context.Context, credID, data []byte) error {
	_, err := s.db.ExecContext(ctx, `UPDATE credentials SET data=? WHERE id=?`, data, credID)
	return err
}

func (s *Store) DeleteUser(ctx context.Context, id []byte) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id=?`, id)
	return err
}

// ---- sessions ------------------------------------------------------------

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// NewSession returns a fresh opaque bearer token; only its SHA-256 is persisted.
func (s *Store) NewSession(ctx context.Context, userID []byte, ttl time.Duration) (token string, expires time.Time, err error) {
	raw := make([]byte, 32)
	if _, err = rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token = base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now()
	expires = now.Add(ttl)
	_, err = s.db.ExecContext(ctx, `INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)`,
		hashToken(token), userID, now.Unix(), expires.Unix())
	return token, expires, err
}

func (s *Store) UserForToken(ctx context.Context, token string) ([]byte, error) {
	var uid []byte
	err := s.db.QueryRowContext(ctx, `SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?`,
		hashToken(token), time.Now().Unix()).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return uid, err
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash=?`, hashToken(token))
	return err
}

func (s *Store) PurgeExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at<=?`, time.Now().Unix())
	return err
}

// ---- operation log -------------------------------------------------------

type Op struct {
	Seq       int64
	ID        string
	Device    string
	Payload   []byte
	CreatedAt int64
}

type PushResult struct {
	Accepted   int
	Duplicates int
	LastSeq    int64
}

// Push appends ops atomically. Re-sending an already stored op id is a no-op (idempotent), so
// clients can safely retry after a dropped connection. maxUserBytes <= 0 disables the quota.
func (s *Store) Push(ctx context.Context, userID []byte, ops []Op, maxUserBytes int64) (PushResult, error) {
	var res PushResult
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer tx.Rollback()

	var last int64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(seq),0) FROM ops WHERE user_id=?`, userID).Scan(&last); err != nil {
		return res, err
	}
	var used int64
	if maxUserBytes > 0 {
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=?`, userID).Scan(&used); err != nil {
			return res, err
		}
		var snap int64
		_ = tx.QueryRowContext(ctx, `SELECT COALESCE(LENGTH(payload),0) FROM snapshots WHERE user_id=?`, userID).Scan(&snap)
		used += snap
	}
	now := time.Now().Unix()
	for _, op := range ops {
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1 FROM ops WHERE user_id=? AND id=?`, userID, op.ID).Scan(&exists); err == nil {
			res.Duplicates++
			continue
		} else if !errors.Is(err, sql.ErrNoRows) {
			return res, err
		}
		if maxUserBytes > 0 {
			used += int64(len(op.Payload))
			if used > maxUserBytes {
				return res, ErrQuota
			}
		}
		last++
		if _, err := tx.ExecContext(ctx, `INSERT INTO ops(user_id,seq,id,device,payload,created_at) VALUES(?,?,?,?,?,?)`,
			userID, last, op.ID, op.Device, op.Payload, now); err != nil {
			return res, err
		}
		res.Accepted++
	}
	if err := tx.Commit(); err != nil {
		return res, err
	}
	res.LastSeq = last
	return res, nil
}

// Pull returns up to limit ops with seq > since, in order, and whether more remain.
func (s *Store) Pull(ctx context.Context, userID []byte, since int64, limit int) (ops []Op, lastSeq int64, hasMore bool, err error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seq,id,device,payload,created_at FROM ops WHERE user_id=? AND seq>? ORDER BY seq LIMIT ?`,
		userID, since, limit+1)
	if err != nil {
		return nil, 0, false, err
	}
	defer rows.Close()
	for rows.Next() {
		var o Op
		if err := rows.Scan(&o.Seq, &o.ID, &o.Device, &o.Payload, &o.CreatedAt); err != nil {
			return nil, 0, false, err
		}
		ops = append(ops, o)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, false, err
	}
	if len(ops) > limit {
		ops, hasMore = ops[:limit], true
	}
	lastSeq = since
	if n := len(ops); n > 0 {
		lastSeq = ops[n-1].Seq
	}
	return ops, lastSeq, hasMore, nil
}

type Snapshot struct {
	UptoSeq   int64
	Payload   []byte
	UpdatedAt int64
}

// PutSnapshot stores the encrypted full state at uptoSeq. With prune, ops at or below uptoSeq are
// dropped (the client guarantees every device has pulled them or will bootstrap from the snapshot).
func (s *Store) PutSnapshot(ctx context.Context, userID []byte, snap Snapshot, prune bool, maxUserBytes int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if maxUserBytes > 0 {
		var opBytes int64
		if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=? AND (?=0 OR seq>?)`,
			userID, boolInt(prune), snap.UptoSeq).Scan(&opBytes); err != nil {
			return err
		}
		if opBytes+int64(len(snap.Payload)) > maxUserBytes {
			return ErrQuota
		}
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO snapshots(user_id,upto_seq,payload,updated_at) VALUES(?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET upto_seq=excluded.upto_seq,payload=excluded.payload,updated_at=excluded.updated_at`,
		userID, snap.UptoSeq, snap.Payload, time.Now().Unix()); err != nil {
		return err
	}
	if prune {
		if _, err := tx.ExecContext(ctx, `DELETE FROM ops WHERE user_id=? AND seq<=?`, userID, snap.UptoSeq); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetSnapshot(ctx context.Context, userID []byte) (Snapshot, error) {
	var sn Snapshot
	err := s.db.QueryRowContext(ctx, `SELECT upto_seq,payload,updated_at FROM snapshots WHERE user_id=?`, userID).
		Scan(&sn.UptoSeq, &sn.Payload, &sn.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return sn, ErrNotFound
	}
	return sn, err
}

type Usage struct {
	Ops   int64
	Bytes int64
}

func (s *Store) Usage(ctx context.Context, userID []byte) (Usage, error) {
	var u Usage
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*), COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=?`, userID).Scan(&u.Ops, &u.Bytes)
	return u, err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
