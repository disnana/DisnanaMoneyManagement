package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // postgres driver ("pgx")
	_ "modernc.org/sqlite"             // pure-Go sqlite driver ("sqlite", no CGO)
)

//go:embed schema_sqlite.sql
var schemaSQLite string

//go:embed schema_postgres.sql
var schemaPostgres string

type dialect int

const (
	sqliteDialect dialect = iota
	postgresDialect
)

// sqlStore implements Store on top of database/sql for both SQLite and PostgreSQL.
type sqlStore struct {
	db  *sql.DB
	d   dialect
	clk clock
}

// OpenSQLite opens (and migrates) a SQLite file. Single writer, WAL: right for dev and single-node installs.
func OpenSQLite(path string) (Store, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=synchronous(NORMAL)", path)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schemaSQLite); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate sqlite: %w", err)
	}
	return &sqlStore{db: db, d: sqliteDialect}, nil
}

// OpenPostgres connects to PostgreSQL (single instance or a managed service) and migrates the schema.
func OpenPostgres(ctx context.Context, url string) (Store, error) {
	db, err := sql.Open("pgx", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	if _, err := db.ExecContext(ctx, schemaPostgres); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate postgres: %w", err)
	}
	return &sqlStore{db: db, d: postgresDialect}, nil
}

// q rewrites ? placeholders to $1, $2, ... for PostgreSQL.
func (s *sqlStore) q(query string) string {
	if s.d != postgresDialect {
		return query
	}
	var b strings.Builder
	n := 0
	for _, r := range query {
		if r == '?' {
			n++
			b.WriteString("$" + strconv.Itoa(n))
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (s *sqlStore) Close() error                   { return s.db.Close() }
func (s *sqlStore) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }

// ---- identity ------------------------------------------------------------

func (s *sqlStore) CreateUser(ctx context.Context, u User, credID, credData []byte) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	now := time.Now().Unix()
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO users(id,name,created_at) VALUES(?,?,?)`), u.ID, u.Name, now); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO credentials(id,user_id,data,created_at) VALUES(?,?,?,?)`), credID, u.ID, credData, now); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *sqlStore) GetUser(ctx context.Context, id []byte) (User, error) {
	var u User
	var created int64
	err := s.db.QueryRowContext(ctx, s.q(`SELECT id,name,created_at FROM users WHERE id=?`), id).Scan(&u.ID, &u.Name, &created)
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	u.CreatedAt = time.Unix(created, 0)
	return u, err
}

func (s *sqlStore) Credentials(ctx context.Context, userID []byte) ([][]byte, error) {
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT data FROM credentials WHERE user_id=?`), userID)
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

func (s *sqlStore) UserByCredential(ctx context.Context, credID []byte) ([]byte, error) {
	var uid []byte
	err := s.db.QueryRowContext(ctx, s.q(`SELECT user_id FROM credentials WHERE id=?`), credID).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return uid, err
}

func (s *sqlStore) UpdateCredential(ctx context.Context, credID, data []byte) error {
	_, err := s.db.ExecContext(ctx, s.q(`UPDATE credentials SET data=? WHERE id=?`), data, credID)
	return err
}

func (s *sqlStore) DeleteUser(ctx context.Context, id []byte) error {
	_, err := s.db.ExecContext(ctx, s.q(`DELETE FROM users WHERE id=?`), id)
	return err
}

// ---- sessions ------------------------------------------------------------

// NewSession returns a fresh opaque bearer token; only its SHA-256 is persisted.
func (s *sqlStore) NewSession(ctx context.Context, userID []byte, ttl time.Duration) (string, time.Time, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	now := time.Now()
	expires := now.Add(ttl)
	_, err := s.db.ExecContext(ctx, s.q(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)`),
		hashToken(token), userID, now.Unix(), expires.Unix())
	return token, expires, err
}

func (s *sqlStore) UserForToken(ctx context.Context, token string) ([]byte, error) {
	var uid []byte
	err := s.db.QueryRowContext(ctx, s.q(`SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?`),
		hashToken(token), time.Now().Unix()).Scan(&uid)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return uid, err
}

func (s *sqlStore) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, s.q(`DELETE FROM sessions WHERE token_hash=?`), hashToken(token))
	return err
}

func (s *sqlStore) PurgeExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, s.q(`DELETE FROM sessions WHERE expires_at<=?`), time.Now().Unix())
	return err
}

// ---- operation log -------------------------------------------------------

func (s *sqlStore) Push(ctx context.Context, userID []byte, ops []Op, maxUserBytes int64) (PushResult, error) {
	var res PushResult
	for _, op := range ops {
		if !ValidOpID(op.ID) {
			return res, ErrBadID
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return res, err
	}
	defer tx.Rollback()

	if s.d == postgresDialect {
		// Serialise pushes of one account across nodes so the quota check is exact.
		if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, hex.EncodeToString(userID)); err != nil {
			return res, err
		}
	}
	var used int64
	if maxUserBytes > 0 {
		if err := tx.QueryRowContext(ctx, s.q(`SELECT COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=?`), userID).Scan(&used); err != nil {
			return res, err
		}
		var snap int64
		err := tx.QueryRowContext(ctx, s.q(`SELECT LENGTH(payload) FROM snapshots WHERE user_id=?`), userID).Scan(&snap)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return res, err
		}
		used += snap
	}

	for _, op := range ops {
		if maxUserBytes > 0 && used+int64(len(op.Payload)) > maxUserBytes {
			// Re-sent ops must still be recognised as duplicates, not rejected by the quota.
			var one int
			if err := tx.QueryRowContext(ctx, s.q(`SELECT 1 FROM ops WHERE user_id=? AND id=?`), userID, op.ID).Scan(&one); err == nil {
				res.Duplicates++
				continue
			}
			return res, ErrQuota
		}
		ts := s.clk.Next()
		r, err := tx.ExecContext(ctx, s.q(`INSERT INTO ops(user_id,ts,id,device,payload) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING`),
			userID, ts, op.ID, op.Device, op.Payload)
		if err != nil {
			return res, err
		}
		if n, _ := r.RowsAffected(); n == 0 {
			res.Duplicates++
			continue
		}
		res.Accepted++
		used += int64(len(op.Payload))
	}

	var ts int64
	var id string
	err = tx.QueryRowContext(ctx, s.q(`SELECT ts,id FROM ops WHERE user_id=? ORDER BY ts DESC, id DESC LIMIT 1`), userID).Scan(&ts, &id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return res, err
	}
	if err := tx.Commit(); err != nil {
		return res, err
	}
	res.Cursor = Cursor{TS: ts, ID: id}
	return res, nil
}

func (s *sqlStore) Pull(ctx context.Context, userID []byte, after Cursor, limit int) ([]Op, bool, error) {
	rows, err := s.db.QueryContext(ctx, s.q(`SELECT ts,id,device,payload FROM ops
		WHERE user_id=? AND (ts>? OR (ts=? AND id>?)) ORDER BY ts, id LIMIT ?`),
		userID, after.TS, after.TS, after.ID, limit+1)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	var ops []Op
	for rows.Next() {
		var o Op
		if err := rows.Scan(&o.TS, &o.ID, &o.Device, &o.Payload); err != nil {
			return nil, false, err
		}
		ops = append(ops, o)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	hasMore := len(ops) > limit
	if hasMore {
		ops = ops[:limit]
	}
	return ops, hasMore, nil
}

func (s *sqlStore) PutSnapshot(ctx context.Context, userID []byte, snap Snapshot, prune bool, maxUserBytes int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if s.d == postgresDialect {
		if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, hex.EncodeToString(userID)); err != nil {
			return err
		}
	}
	if maxUserBytes > 0 {
		keep := `SELECT COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=?`
		args := []any{userID}
		if prune { // pruned ops no longer count
			keep += ` AND (ts>? OR (ts=? AND id>?))`
			args = append(args, snap.Upto.TS, snap.Upto.TS, snap.Upto.ID)
		}
		var opBytes int64
		if err := tx.QueryRowContext(ctx, s.q(keep), args...).Scan(&opBytes); err != nil {
			return err
		}
		if opBytes+int64(len(snap.Payload)) > maxUserBytes {
			return ErrQuota
		}
	}
	if _, err := tx.ExecContext(ctx, s.q(`INSERT INTO snapshots(user_id,upto_ts,upto_id,payload,updated_at) VALUES(?,?,?,?,?)
		ON CONFLICT(user_id) DO UPDATE SET upto_ts=excluded.upto_ts,upto_id=excluded.upto_id,payload=excluded.payload,updated_at=excluded.updated_at`),
		userID, snap.Upto.TS, snap.Upto.ID, snap.Payload, time.Now().Unix()); err != nil {
		return err
	}
	if prune {
		if _, err := tx.ExecContext(ctx, s.q(`DELETE FROM ops WHERE user_id=? AND (ts<? OR (ts=? AND id<=?))`),
			userID, snap.Upto.TS, snap.Upto.TS, snap.Upto.ID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *sqlStore) GetSnapshot(ctx context.Context, userID []byte) (Snapshot, error) {
	var sn Snapshot
	err := s.db.QueryRowContext(ctx, s.q(`SELECT upto_ts,upto_id,payload,updated_at FROM snapshots WHERE user_id=?`), userID).
		Scan(&sn.Upto.TS, &sn.Upto.ID, &sn.Payload, &sn.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return sn, ErrNotFound
	}
	return sn, err
}

func (s *sqlStore) Usage(ctx context.Context, userID []byte) (Usage, error) {
	var u Usage
	err := s.db.QueryRowContext(ctx, s.q(`SELECT COUNT(*), COALESCE(SUM(LENGTH(payload)),0) FROM ops WHERE user_id=?`), userID).Scan(&u.Ops, &u.Bytes)
	return u, err
}
