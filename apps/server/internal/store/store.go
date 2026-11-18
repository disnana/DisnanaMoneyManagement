// Package store defines the persistence interface and its backends.
//
// The sync log is ordered by a server-assigned (ts, id) cursor instead of a dense per-user sequence, so
// any number of stateless nodes can append concurrently without coordinating (this is also what makes a
// leaderless backend such as ScyllaDB possible). Node clocks may skew a little; clients therefore rewind
// the cursor by a small overlap when a sync session starts and de-duplicate by operation id.
package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

var (
	ErrNotFound = errors.New("not found")
	ErrQuota    = errors.New("storage quota exceeded")
	ErrBadID    = errors.New("invalid operation id")
)

type User struct {
	ID        []byte
	Name      string
	CreatedAt time.Time
}

// Cursor is a position in a user's op log. The zero value is "from the beginning".
type Cursor struct {
	TS int64  // microseconds since the Unix epoch, assigned by the server
	ID string // operation id (tie-breaker for equal timestamps)
}

func (c Cursor) String() string {
	if c == (Cursor{}) {
		return ""
	}
	return strconv.FormatInt(c.TS, 10) + "." + c.ID
}

func ParseCursor(s string) (Cursor, error) {
	if s == "" {
		return Cursor{}, nil
	}
	ts, id, ok := strings.Cut(s, ".")
	n, err := strconv.ParseInt(ts, 10, 64)
	if !ok || err != nil || n < 0 || !ValidOpID(id) {
		return Cursor{}, fmt.Errorf("invalid cursor")
	}
	return Cursor{TS: n, ID: id}, nil
}

// Less reports whether c sorts strictly before o.
func (c Cursor) Less(o Cursor) bool { return c.TS < o.TS || (c.TS == o.TS && c.ID < o.ID) }

// ValidOpID accepts ULID/UUID-like ids: [A-Za-z0-9_-]{1,64}.
func ValidOpID(id string) bool {
	if len(id) == 0 || len(id) > 64 {
		return false
	}
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
		default:
			return false
		}
	}
	return true
}

type Op struct {
	TS      int64
	ID      string
	Device  string
	Payload []byte // opaque ciphertext
}

func (o Op) Cursor() Cursor { return Cursor{TS: o.TS, ID: o.ID} }

type PushResult struct {
	Accepted   int
	Duplicates int
	Cursor     Cursor // position of the newest op stored for the user (after this push)
}

type Snapshot struct {
	Upto      Cursor
	Payload   []byte
	UpdatedAt int64
}

type Usage struct {
	Ops   int64
	Bytes int64
}

// Store is implemented by every backend. All methods must be safe for concurrent use by many nodes.
type Store interface {
	Close() error
	Ping(ctx context.Context) error

	CreateUser(ctx context.Context, u User, credID, credData []byte) error
	GetUser(ctx context.Context, id []byte) (User, error)
	Credentials(ctx context.Context, userID []byte) ([][]byte, error)
	UserByCredential(ctx context.Context, credID []byte) ([]byte, error)
	UpdateCredential(ctx context.Context, credID, data []byte) error
	DeleteUser(ctx context.Context, id []byte) error

	NewSession(ctx context.Context, userID []byte, ttl time.Duration) (token string, expires time.Time, err error)
	UserForToken(ctx context.Context, token string) ([]byte, error)
	DeleteSession(ctx context.Context, token string) error
	PurgeExpiredSessions(ctx context.Context) error

	// Push appends ops (idempotent by op id). maxUserBytes <= 0 disables the quota.
	Push(ctx context.Context, userID []byte, ops []Op, maxUserBytes int64) (PushResult, error)
	// Pull returns up to limit ops strictly after the cursor, in order.
	Pull(ctx context.Context, userID []byte, after Cursor, limit int) (ops []Op, hasMore bool, err error)
	PutSnapshot(ctx context.Context, userID []byte, snap Snapshot, prune bool, maxUserBytes int64) error
	GetSnapshot(ctx context.Context, userID []byte) (Snapshot, error)
	Usage(ctx context.Context, userID []byte) (Usage, error)
}

// Open selects a backend from a URL: sqlite:./dmm.db, postgres://user:pass@host/db, scylla://host1,host2/keyspace.
func Open(ctx context.Context, url string) (Store, error) {
	switch {
	case strings.HasPrefix(url, "sqlite:"):
		return OpenSQLite(strings.TrimPrefix(strings.TrimPrefix(url, "sqlite://"), "sqlite:"))
	case strings.HasPrefix(url, "postgres://"), strings.HasPrefix(url, "postgresql://"):
		return OpenPostgres(ctx, url)
	case strings.HasPrefix(url, "scylla://"):
		return nil, errors.New("scylla backend is not implemented yet (see docs: Store interface is ready for it)")
	default:
		return nil, fmt.Errorf("unsupported DMM_DB_URL scheme (use sqlite:, postgres:// or scylla://)")
	}
}

// ---- shared helpers ------------------------------------------------------

func NewID() []byte {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// clock hands out strictly increasing microsecond timestamps within one process.
type clock struct{ last atomic.Int64 }

func (c *clock) Next() int64 {
	for {
		prev := c.last.Load()
		now := time.Now().UnixMicro()
		if now <= prev {
			now = prev + 1
		}
		if c.last.CompareAndSwap(prev, now) {
			return now
		}
	}
}
