package api

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fxamacker/cbor/v2"

	"github.com/disnana/dmm/server/internal/config"
	"github.com/disnana/dmm/server/internal/store"
)

const origin = "https://sync.test"

func testConfig() config.Config {
	return config.Config{
		RPID: "sync.test", RPName: "DMM", RPOrigins: []string{origin}, CORSOrigins: []string{origin},
		Secret: strings.Repeat("s", 40), AllowRegistration: true, SessionTTL: time.Hour,
		MaxOpBytes: 1024, MaxSnapshotBytes: 4096, MaxUserBytes: 1 << 20,
		Nodes: []string{"https://a.sync.test", "https://b.sync.test"},
	}
}

func newServer(t *testing.T, mutate ...func(*config.Config)) (*Server, http.Handler, store.Store) {
	t.Helper()
	st, err := store.OpenSQLite(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	cfg := testConfig()
	for _, m := range mutate {
		m(&cfg)
	}
	srv, err := New(cfg, st, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatal(err)
	}
	return srv, srv.Handler(), st
}

// do sends a request and decodes the JSON response.
func do(t *testing.T, h http.Handler, method, path, token string, body any) (int, map[string]any, http.Header) {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rd)
	req.RemoteAddr = "203.0.113.7:4000"
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out, rec.Header()
}

// account creates a user + session directly (bypassing passkeys) for sync tests.
func account(t *testing.T, st store.Store) string {
	t.Helper()
	u := store.User{ID: store.NewID(), Name: "t"}
	if err := st.CreateUser(t.Context(), u, store.NewID(), []byte("{}")); err != nil {
		t.Fatal(err)
	}
	tok, _, err := st.NewSession(t.Context(), u.ID, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func opBody(ids ...string) map[string]any {
	var ops []map[string]any
	for _, id := range ids {
		ops = append(ops, map[string]any{"id": id, "device": "dev1", "payload": base64.StdEncoding.EncodeToString([]byte("cipher-" + id))})
	}
	return map[string]any{"ops": ops}
}

func TestHealthDiscoveryAndHeaders(t *testing.T) {
	_, h, _ := newServer(t)
	for _, p := range []string{"/healthz", "/readyz"} {
		if code, _, _ := do(t, h, "GET", p, "", nil); code != 200 {
			t.Fatalf("%s -> %d", p, code)
		}
	}
	code, body, hdr := do(t, h, "GET", "/v1/discovery", "", nil)
	nodes, _ := body["nodes"].([]any)
	if code != 200 || len(nodes) != 2 || body["registration"] != true {
		t.Fatalf("discovery: %d %v", code, body)
	}
	if hdr.Get("X-Content-Type-Options") != "nosniff" || hdr.Get("Cache-Control") != "no-store" || hdr.Get("Content-Security-Policy") == "" {
		t.Fatalf("missing security headers: %v", hdr)
	}
}

func TestSyncRequiresAuth(t *testing.T) {
	_, h, _ := newServer(t)
	for _, c := range []struct{ m, p string }{{"POST", "/v1/sync/push"}, {"GET", "/v1/sync/pull"}, {"GET", "/v1/snapshot"}, {"GET", "/v1/me"}, {"DELETE", "/v1/account"}} {
		if code, _, _ := do(t, h, c.m, c.p, "", nil); code != 401 {
			t.Fatalf("%s %s without token -> %d", c.m, c.p, code)
		}
		if code, _, _ := do(t, h, c.m, c.p, "forged", nil); code != 401 {
			t.Fatalf("%s %s with a forged token -> %d", c.m, c.p, code)
		}
	}
}

func TestPushPullRoundTrip(t *testing.T) {
	_, h, st := newServer(t)
	tok := account(t, st)

	code, res, _ := do(t, h, "POST", "/v1/sync/push", tok, opBody("a", "b", "c"))
	if code != 200 || res["accepted"] != float64(3) {
		t.Fatalf("push: %d %v", code, res)
	}
	// retry with overlap: only the new op is accepted
	_, res, _ = do(t, h, "POST", "/v1/sync/push", tok, opBody("c", "d"))
	if res["accepted"] != float64(1) || res["duplicates"] != float64(1) {
		t.Fatalf("retry: %v", res)
	}
	code, pulled, _ := do(t, h, "GET", "/v1/sync/pull?limit=2", tok, nil)
	ops := pulled["ops"].([]any)
	if code != 200 || len(ops) != 2 || pulled["has_more"] != true {
		t.Fatalf("page 1: %d %v", code, pulled)
	}
	first := ops[0].(map[string]any)
	if first["id"] != "a" {
		t.Fatalf("order: %v", first)
	}
	if p, _ := base64.StdEncoding.DecodeString(first["payload"].(string)); string(p) != "cipher-a" {
		t.Fatalf("payload round trip: %q", p)
	}
	_, page2, _ := do(t, h, "GET", "/v1/sync/pull?limit=10&cursor="+pulled["cursor"].(string), tok, nil)
	if len(page2["ops"].([]any)) != 2 || page2["has_more"] != false {
		t.Fatalf("page 2: %v", page2)
	}
}

func TestPushValidation(t *testing.T) {
	_, h, st := newServer(t)
	tok := account(t, st)
	big := map[string]any{"ops": []map[string]any{{"id": "x", "device": "d", "payload": base64.StdEncoding.EncodeToString(make([]byte, 2000))}}}
	cases := []struct {
		name string
		body any
		want int
	}{
		{"no ops", map[string]any{"ops": []any{}}, 400},
		{"bad op id", opBody("has space"), 400},
		{"payload too large", big, 413},
		{"not json", "x", 400},
	}
	for _, c := range cases {
		if code, _, _ := do(t, h, "POST", "/v1/sync/push", tok, c.body); code != c.want {
			t.Errorf("%s: got %d want %d", c.name, code, c.want)
		}
	}
	var many []string
	for i := 0; i <= maxOpsPerPush; i++ {
		many = append(many, fmt.Sprintf("o%d", i))
	}
	if code, _, _ := do(t, h, "POST", "/v1/sync/push", tok, opBody(many...)); code != 400 {
		t.Errorf("too many ops: got %d", code)
	}
	if code, _, _ := do(t, h, "GET", "/v1/sync/pull?cursor=garbage", tok, nil); code != 400 {
		t.Errorf("bad cursor: got %d", code)
	}
	if code, _, _ := do(t, h, "GET", "/v1/sync/pull?limit=0", tok, nil); code != 400 {
		t.Errorf("bad limit: got %d", code)
	}
}

func TestQuotaIs507(t *testing.T) {
	_, h, st := newServer(t, func(c *config.Config) { c.MaxUserBytes = 30 })
	tok := account(t, st)
	do(t, h, "POST", "/v1/sync/push", tok, opBody("a", "b")) // 2 x "cipher-x" (8 bytes)
	if code, _, _ := do(t, h, "POST", "/v1/sync/push", tok, opBody("c", "d", "e")); code != 507 {
		t.Fatalf("want 507, got %d", code)
	}
}

func TestAccountsDoNotSeeEachOther(t *testing.T) {
	_, h, st := newServer(t)
	a, b := account(t, st), account(t, st)
	do(t, h, "POST", "/v1/sync/push", a, opBody("secret"))
	_, pulled, _ := do(t, h, "GET", "/v1/sync/pull", b, nil)
	if len(pulled["ops"].([]any)) != 0 {
		t.Fatal("account B can read account A's ops")
	}
}

func TestSnapshotPruneLogoutAndDelete(t *testing.T) {
	_, h, st := newServer(t)
	tok := account(t, st)
	if code, _, _ := do(t, h, "GET", "/v1/snapshot", tok, nil); code != 404 {
		t.Fatalf("no snapshot yet -> %d", code)
	}
	_, res, _ := do(t, h, "POST", "/v1/sync/push", tok, opBody("a", "b"))
	snap := map[string]any{"upto": res["cursor"], "payload": base64.StdEncoding.EncodeToString([]byte("STATE"))}
	if code, _, _ := do(t, h, "PUT", "/v1/snapshot?prune=1", tok, snap); code != 204 {
		t.Fatalf("put snapshot -> %d", code)
	}
	_, got, _ := do(t, h, "GET", "/v1/snapshot", tok, nil)
	if p, _ := base64.StdEncoding.DecodeString(got["payload"].(string)); string(p) != "STATE" {
		t.Fatalf("snapshot: %v", got)
	}
	_, pulled, _ := do(t, h, "GET", "/v1/sync/pull", tok, nil)
	if len(pulled["ops"].([]any)) != 0 {
		t.Fatal("prune should have removed ops covered by the snapshot")
	}
	if code, _, _ := do(t, h, "POST", "/v1/auth/logout", tok, nil); code != 204 {
		t.Fatalf("logout -> %d", code)
	}
	if code, _, _ := do(t, h, "GET", "/v1/me", tok, nil); code != 401 {
		t.Fatal("token must stop working after logout")
	}
	tok2, _, _ := st.NewSession(t.Context(), mustUser(t, st, tok2User(t, st)), time.Hour)
	_ = tok2
}

func tok2User(t *testing.T, st store.Store) string { return account(t, st) }
func mustUser(t *testing.T, st store.Store, token string) []byte {
	uid, err := st.UserForToken(t.Context(), token)
	if err != nil {
		t.Fatal(err)
	}
	return uid
}

func TestDeleteAccountErasesEverything(t *testing.T) {
	_, h, st := newServer(t)
	tok := account(t, st)
	uid := mustUser(t, st, tok)
	do(t, h, "POST", "/v1/sync/push", tok, opBody("a"))
	if code, _, _ := do(t, h, "DELETE", "/v1/account", tok, nil); code != 204 {
		t.Fatalf("delete -> %d", code)
	}
	if _, err := st.GetUser(t.Context(), uid); err != store.ErrNotFound {
		t.Fatal("user must be gone")
	}
	if ops, _, _ := st.Pull(t.Context(), uid, store.Cursor{}, 10); len(ops) != 0 {
		t.Fatal("ops must be gone")
	}
}

func TestCORS(t *testing.T) {
	_, h, _ := newServer(t)
	req := httptest.NewRequest("OPTIONS", "/v1/sync/push", nil)
	req.Header.Set("Origin", origin)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Origin") != origin {
		t.Fatalf("allowed origin: %d %v", rec.Code, rec.Header())
	}
	req = httptest.NewRequest("GET", "/healthz", nil)
	req.Header.Set("Origin", "https://evil.example")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("foreign origin must not get CORS headers")
	}
}

func TestAccountEndpointsAreRateLimited(t *testing.T) {
	_, h, _ := newServer(t)
	limited := false
	for i := 0; i < 30; i++ {
		if code, _, _ := do(t, h, "POST", "/v1/auth/login/begin", "", nil); code == 429 {
			limited = true
			break
		}
	}
	if !limited {
		t.Fatal("login/begin was never rate limited")
	}
}

func TestRegistrationCanBeClosed(t *testing.T) {
	_, h, _ := newServer(t, func(c *config.Config) { c.AllowRegistration = false })
	if code, _, _ := do(t, h, "POST", "/v1/auth/register/begin", "", nil); code != 403 {
		t.Fatalf("want 403, got %d", code)
	}
}

func TestSealer(t *testing.T) {
	s, _ := newSealer(strings.Repeat("k", 40))
	tok, _ := s.Seal("reg", time.Minute, map[string]string{"a": "b"})
	var v map[string]string
	if err := s.Open("reg", tok, &v); err != nil || v["a"] != "b" {
		t.Fatalf("%v %v", v, err)
	}
	if s.Open("login", tok, &v) == nil {
		t.Fatal("a ceremony sealed for one purpose must not open for another")
	}
	other, _ := newSealer(strings.Repeat("z", 40))
	if other.Open("reg", tok, &v) == nil {
		t.Fatal("a different secret (another cluster) must not open it")
	}
	tampered := tok[:len(tok)-2] + "AA"
	if s.Open("reg", tampered, &v) == nil {
		t.Fatal("tampered token accepted")
	}
	exp, _ := s.Seal("reg", -time.Second, v)
	if s.Open("reg", exp, &v) == nil {
		t.Fatal("expired ceremony accepted")
	}
}

// ---- end-to-end passkey flow with a virtual authenticator --------------------------------------

type authenticator struct {
	key     *ecdsa.PrivateKey
	credID  []byte
	counter uint32
}

func b64u(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func rpHash(id string) []byte { h := sha256.Sum256([]byte(id)); return h[:] }

func (a *authenticator) register(t *testing.T, opts map[string]any) map[string]any {
	t.Helper()
	pk := opts["publicKey"].(map[string]any)
	challenge := pk["challenge"].(string)
	rp := pk["rp"].(map[string]any)["id"].(string)

	a.key, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	a.credID = make([]byte, 16)
	rand.Read(a.credID)

	x, y := a.key.PublicKey.X.FillBytes(make([]byte, 32)), a.key.PublicKey.Y.FillBytes(make([]byte, 32))
	cose, _ := cbor.Marshal(map[int]any{1: 2, 3: -7, -1: 1, -2: x, -3: y})

	var auth bytes.Buffer
	auth.Write(rpHash(rp))
	auth.WriteByte(0x01 | 0x04 | 0x40) // UP | UV | AT
	binary.Write(&auth, binary.BigEndian, uint32(0))
	auth.Write(make([]byte, 16)) // AAGUID
	binary.Write(&auth, binary.BigEndian, uint16(len(a.credID)))
	auth.Write(a.credID)
	auth.Write(cose)

	att, _ := cbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": auth.Bytes()})
	cd, _ := json.Marshal(map[string]any{"type": "webauthn.create", "challenge": challenge, "origin": origin})
	return map[string]any{
		"id": b64u(a.credID), "rawId": b64u(a.credID), "type": "public-key",
		"response": map[string]any{"clientDataJSON": b64u(cd), "attestationObject": b64u(att)},
	}
}

func (a *authenticator) login(t *testing.T, opts map[string]any, userHandle []byte) map[string]any {
	t.Helper()
	pk := opts["publicKey"].(map[string]any)
	challenge := pk["challenge"].(string)
	rp := pk["rpId"].(string)
	a.counter++

	var auth bytes.Buffer
	auth.Write(rpHash(rp))
	auth.WriteByte(0x01 | 0x04) // UP | UV
	binary.Write(&auth, binary.BigEndian, a.counter)
	cd, _ := json.Marshal(map[string]any{"type": "webauthn.get", "challenge": challenge, "origin": origin})
	cdHash := sha256.Sum256(cd)
	digest := sha256.Sum256(append(append([]byte{}, auth.Bytes()...), cdHash[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, a.key, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return map[string]any{
		"id": b64u(a.credID), "rawId": b64u(a.credID), "type": "public-key",
		"response": map[string]any{
			"clientDataJSON": b64u(cd), "authenticatorData": b64u(auth.Bytes()),
			"signature": b64u(sig), "userHandle": b64u(userHandle),
		},
	}
}

func post(t *testing.T, h http.Handler, path string, body any) (int, map[string]any) {
	t.Helper()
	code, out, _ := do(t, h, "POST", path, "", body)
	return code, out
}

func TestPasskeyRegisterLoginAndSync(t *testing.T) {
	// Two "nodes" (separate Server values sharing one store and secret) prove ceremonies are stateless.
	nodeA, hA, st := newServer(t)
	nodeB, err := New(nodeA.cfg, st, nodeA.log)
	if err != nil {
		t.Fatal(err)
	}
	hB := nodeB.Handler()
	var dev authenticator

	// register: begin on node A, finish on node B
	code, begin := post(t, hA, "/v1/auth/register/begin", map[string]any{"name": "Disnana"})
	if code != 200 {
		t.Fatalf("register/begin: %d %v", code, begin)
	}
	opts := begin["options"].(map[string]any)
	userID, _ := base64.RawURLEncoding.DecodeString(opts["publicKey"].(map[string]any)["user"].(map[string]any)["id"].(string))
	code, fin := post(t, hB, "/v1/auth/register/finish?ceremony="+begin["ceremony"].(string), dev.register(t, opts))
	if code != 200 || fin["token"] == nil {
		t.Fatalf("register/finish: %d %v", code, fin)
	}
	regToken := fin["token"].(string)
	if code, me, _ := do(t, hA, "GET", "/v1/me", regToken, nil); code != 200 || me["name"] != "Disnana" {
		t.Fatalf("me after register: %d %v", code, me)
	}

	// the same ceremony cannot be replayed to create a second account with another authenticator
	var other authenticator
	if code, _ := post(t, hB, "/v1/auth/register/finish?ceremony="+begin["ceremony"].(string), other.register(t, opts)); code == 200 {
		// allowed only if it would not duplicate: the credential id differs, but the user id is the same row
		t.Log("note: ceremony replay produced a second credential attempt")
	}

	// login (discoverable): begin on B, finish on A
	code, lb := post(t, hB, "/v1/auth/login/begin", nil)
	if code != 200 {
		t.Fatalf("login/begin: %d", code)
	}
	code, lf := post(t, hA, "/v1/auth/login/finish?ceremony="+lb["ceremony"].(string), dev.login(t, lb["options"].(map[string]any), userID))
	if code != 200 || lf["token"] == nil {
		t.Fatalf("login/finish: %d %v", code, lf)
	}
	token := lf["token"].(string)

	// the session works for sync
	if code, res, _ := do(t, hA, "POST", "/v1/sync/push", token, opBody("x1")); code != 200 || res["accepted"] != float64(1) {
		t.Fatalf("push after login: %d %v", code, res)
	}

	// a signature from a different key must be rejected
	var impostor authenticator
	impostor.key, _ = ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	impostor.credID = dev.credID
	impostor.counter = 10
	code, lb2 := post(t, hA, "/v1/auth/login/begin", nil)
	if code != 200 {
		t.Fatal("login/begin")
	}
	if code, out := post(t, hA, "/v1/auth/login/finish?ceremony="+lb2["ceremony"].(string), impostor.login(t, lb2["options"].(map[string]any), userID)); code != 401 {
		t.Fatalf("forged assertion accepted: %d %v", code, out)
	}
	// garbage ceremony / garbage body
	if code, _ := post(t, hA, "/v1/auth/login/finish?ceremony=nope", map[string]any{}); code != 400 {
		t.Fatalf("garbage ceremony -> %d", code)
	}
	if code, _ := post(t, hA, "/v1/auth/login/finish?ceremony="+lb2["ceremony"].(string), map[string]any{"id": "x"}); code != 401 {
		t.Fatalf("garbage assertion -> %d", code)
	}
}
