package store

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// Every backend must pass the same suite. PostgreSQL runs when DMM_TEST_PG_URL is set (CI provides one).
func backends(t *testing.T) map[string]Store {
	t.Helper()
	out := map[string]Store{}
	sq, err := OpenSQLite(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	out["sqlite"] = sq
	if url := os.Getenv("DMM_TEST_PG_URL"); url != "" {
		pg, err := OpenPostgres(context.Background(), url)
		if err != nil {
			t.Fatal(err)
		}
		out["postgres"] = pg
	}
	t.Cleanup(func() {
		for _, s := range out {
			s.Close()
		}
	})
	return out
}

func newUser(t *testing.T, s Store) []byte {
	t.Helper()
	u := User{ID: NewID(), Name: "u"}
	if err := s.CreateUser(context.Background(), u, NewID(), []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	return u.ID
}

func op(id, payload string) Op { return Op{ID: id, Device: "d1", Payload: []byte(payload)} }

func forEach(t *testing.T, fn func(t *testing.T, s Store)) {
	for name, s := range backends(t) {
		t.Run(name, func(t *testing.T) { fn(t, s) })
	}
}

func TestPushPullOrderAndIdempotency(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		uid := newUser(t, s)
		r, err := s.Push(ctx, uid, []Op{op("a", "1"), op("b", "2"), op("c", "3")}, 0)
		if err != nil || r.Accepted != 3 || r.Duplicates != 0 {
			t.Fatalf("push: %+v %v", r, err)
		}
		// retrying the same ops (dropped connection) is harmless
		r2, err := s.Push(ctx, uid, []Op{op("b", "2"), op("d", "4")}, 0)
		if err != nil || r2.Accepted != 1 || r2.Duplicates != 1 {
			t.Fatalf("retry: %+v %v", r2, err)
		}
		ops, more, err := s.Pull(ctx, uid, Cursor{}, 100)
		if err != nil || more || len(ops) != 4 {
			t.Fatalf("pull: %d ops more=%v err=%v", len(ops), more, err)
		}
		for i, want := range []string{"a", "b", "c", "d"} {
			if ops[i].ID != want {
				t.Fatalf("order[%d]=%s want %s", i, ops[i].ID, want)
			}
		}
		if r2.Cursor != ops[3].Cursor() {
			t.Fatalf("cursor %v != newest %v", r2.Cursor, ops[3].Cursor())
		}
	})
}

func TestPullPaginationAndCursor(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		uid := newUser(t, s)
		var batch []Op
		for i := 0; i < 25; i++ {
			batch = append(batch, op(fmt.Sprintf("op%02d", i), "x"))
		}
		if _, err := s.Push(ctx, uid, batch, 0); err != nil {
			t.Fatal(err)
		}
		var cur Cursor
		var got []string
		for page := 0; ; page++ {
			ops, more, err := s.Pull(ctx, uid, cur, 10)
			if err != nil {
				t.Fatal(err)
			}
			for _, o := range ops {
				got = append(got, o.ID)
			}
			if len(ops) > 0 {
				cur = ops[len(ops)-1].Cursor()
			}
			if !more {
				break
			}
			if page > 5 {
				t.Fatal("pagination does not terminate")
			}
		}
		if len(got) != 25 || got[0] != "op00" || got[24] != "op24" {
			t.Fatalf("got %d ops: %v", len(got), got)
		}
		// nothing new after the last cursor
		ops, more, _ := s.Pull(ctx, uid, cur, 10)
		if len(ops) != 0 || more {
			t.Fatal("expected no new ops")
		}
	})
}

func TestAccountsAreIsolated(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		a, b := newUser(t, s), newUser(t, s)
		if _, err := s.Push(ctx, a, []Op{op("same-id", "A")}, 0); err != nil {
			t.Fatal(err)
		}
		// the same op id in another account is a different op
		r, err := s.Push(ctx, b, []Op{op("same-id", "B")}, 0)
		if err != nil || r.Accepted != 1 {
			t.Fatalf("%+v %v", r, err)
		}
		ops, _, _ := s.Pull(ctx, b, Cursor{}, 10)
		if len(ops) != 1 || !bytes.Equal(ops[0].Payload, []byte("B")) {
			t.Fatalf("leak between accounts: %+v", ops)
		}
	})
}

func TestQuota(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		uid := newUser(t, s)
		if _, err := s.Push(ctx, uid, []Op{op("a", "12345")}, 10); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Push(ctx, uid, []Op{op("b", "123456")}, 10); err != ErrQuota {
			t.Fatalf("want ErrQuota, got %v", err)
		}
		// a retry of an op that already fits must not trip the quota
		r, err := s.Push(ctx, uid, []Op{op("a", "12345")}, 10)
		if err != nil || r.Duplicates != 1 {
			t.Fatalf("%+v %v", r, err)
		}
	})
}

func TestSnapshotAndPrune(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		uid := newUser(t, s)
		if _, err := s.GetSnapshot(ctx, uid); err != ErrNotFound {
			t.Fatalf("want ErrNotFound, got %v", err)
		}
		r, _ := s.Push(ctx, uid, []Op{op("a", "1"), op("b", "2")}, 0)
		if _, err := s.Push(ctx, uid, []Op{op("c", "3")}, 0); err != nil {
			t.Fatal(err)
		}
		if err := s.PutSnapshot(ctx, uid, Snapshot{Upto: r.Cursor, Payload: []byte("STATE")}, true, 0); err != nil {
			t.Fatal(err)
		}
		sn, err := s.GetSnapshot(ctx, uid)
		if err != nil || string(sn.Payload) != "STATE" || sn.Upto != r.Cursor {
			t.Fatalf("%+v %v", sn, err)
		}
		ops, _, _ := s.Pull(ctx, uid, Cursor{}, 10)
		if len(ops) != 1 || ops[0].ID != "c" {
			t.Fatalf("prune should leave only ops after the snapshot, got %+v", ops)
		}
	})
}

func TestSessionsAndAccountDeletion(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		ctx := context.Background()
		uid := newUser(t, s)
		tok, _, err := s.NewSession(ctx, uid, time.Hour)
		if err != nil {
			t.Fatal(err)
		}
		if got, err := s.UserForToken(ctx, tok); err != nil || !bytes.Equal(got, uid) {
			t.Fatalf("token lookup: %v %v", got, err)
		}
		if _, err := s.UserForToken(ctx, "bogus"); err != ErrNotFound {
			t.Fatal("unknown token must not authenticate")
		}
		expired, _, _ := s.NewSession(ctx, uid, -time.Minute)
		if _, err := s.UserForToken(ctx, expired); err != ErrNotFound {
			t.Fatal("expired token must not authenticate")
		}
		if _, err := s.Push(ctx, uid, []Op{op("a", "1")}, 0); err != nil {
			t.Fatal(err)
		}
		_ = s.DeleteSession(ctx, tok)
		if _, err := s.UserForToken(ctx, tok); err != ErrNotFound {
			t.Fatal("logged-out token must not authenticate")
		}
		tok2, _, _ := s.NewSession(ctx, uid, time.Hour)
		if err := s.DeleteUser(ctx, uid); err != nil {
			t.Fatal(err)
		}
		if _, err := s.UserForToken(ctx, tok2); err != ErrNotFound {
			t.Fatal("deleting an account must remove its sessions")
		}
		if ops, _, _ := s.Pull(ctx, uid, Cursor{}, 10); len(ops) != 0 {
			t.Fatal("deleting an account must remove its data")
		}
	})
}

func TestRejectsBadOpIDs(t *testing.T) {
	forEach(t, func(t *testing.T, s Store) {
		uid := newUser(t, s)
		for _, id := range []string{"", "has space", "dot.dot", "ü", string(make([]byte, 65))} {
			if _, err := s.Push(context.Background(), uid, []Op{{ID: id, Device: "d", Payload: []byte("x")}}, 0); err != ErrBadID {
				t.Fatalf("id %q: want ErrBadID, got %v", id, err)
			}
		}
	})
}

func TestCursorRoundTrip(t *testing.T) {
	c := Cursor{TS: 1700000000123456, ID: "01J-abc_9"}
	got, err := ParseCursor(c.String())
	if err != nil || got != c {
		t.Fatalf("%v %v", got, err)
	}
	for _, bad := range []string{"nodot", "x.id", "-1.id", "1.bad id", "1."} {
		if _, err := ParseCursor(bad); err == nil {
			t.Fatalf("%q should be rejected", bad)
		}
	}
	if z, err := ParseCursor(""); err != nil || z != (Cursor{}) {
		t.Fatal("empty cursor means the beginning")
	}
}

func TestClockIsStrictlyMonotonic(t *testing.T) {
	var c clock
	prev := c.Next()
	for i := 0; i < 10000; i++ {
		n := c.Next()
		if n <= prev {
			t.Fatalf("clock went %d -> %d", prev, n)
		}
		prev = n
	}
}

// Several stateless nodes (separate connections/clocks) append to the same account concurrently: nothing may
// be lost or duplicated, and a reader must see one consistent order. Runs on PostgreSQL only.
func TestConcurrentNodesOnPostgres(t *testing.T) {
	url := os.Getenv("DMM_TEST_PG_URL")
	if url == "" {
		t.Skip("DMM_TEST_PG_URL not set")
	}
	ctx := context.Background()
	const nodes, perNode = 4, 50
	var stores []Store
	for i := 0; i < nodes; i++ {
		s, err := OpenPostgres(ctx, url)
		if err != nil {
			t.Fatal(err)
		}
		defer s.Close()
		stores = append(stores, s)
	}
	uid := newUser(t, stores[0])

	errs := make(chan error, nodes)
	for n, s := range stores {
		go func() {
			var err error
			for i := 0; i < perNode && err == nil; i++ {
				// every op is also sent twice (a client retry hitting another node)
				o := []Op{op(fmt.Sprintf("n%d-%03d", n, i), "payload")}
				if _, err = s.Push(ctx, uid, o, 0); err == nil {
					_, err = stores[(n+1)%nodes].Push(ctx, uid, o, 0)
				}
			}
			errs <- err
		}()
	}
	for i := 0; i < nodes; i++ {
		if err := <-errs; err != nil {
			t.Fatal(err)
		}
	}
	ops, more, err := stores[0].Pull(ctx, uid, Cursor{}, 1000)
	if err != nil || more {
		t.Fatalf("pull: %v more=%v", err, more)
	}
	if len(ops) != nodes*perNode {
		t.Fatalf("expected %d ops, got %d (lost or duplicated)", nodes*perNode, len(ops))
	}
	seen := map[string]bool{}
	for i, o := range ops {
		if seen[o.ID] {
			t.Fatalf("duplicate %s", o.ID)
		}
		seen[o.ID] = true
		if i > 0 && !ops[i-1].Cursor().Less(o.Cursor()) {
			t.Fatalf("ops not strictly ordered at %d", i)
		}
	}
}
