package androidauth

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type Config struct {
	NodeID, PublicOrigin, PackageName, SigningKeyID string
	ChallengeKey                                    []byte
	SigningKey                                      ed25519.PrivateKey
	GoogleSubject                                   func(context.Context, string, string) (string, error)
	DecodeIntegrity                                 func(context.Context, string) (IntegrityVerdict, error)
	ScyllaStatus                                    *ScyllaStatus
	CreditBalance                                   func(context.Context, string) (int64, error)
	Now                                             func() time.Time
}

type Node struct {
	cfg      Config
	sessions *MemorySessions
	proofs   *proofs
	now      func() time.Time
	mux      *http.ServeMux
}

var identifier = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func NewNode(cfg Config, sessions *MemorySessions) (*Node, error) {
	origin, err := url.Parse(cfg.PublicOrigin)
	if err != nil || origin.Scheme != "https" || origin.Hostname() == "" || origin.User != nil ||
		origin.Path != "" || origin.RawQuery != "" || origin.ForceQuery || origin.Fragment != "" ||
		!identifier.MatchString(cfg.NodeID) || cfg.PackageName == "" || !identifier.MatchString(cfg.SigningKeyID) ||
		len(cfg.ChallengeKey) < 32 || len(cfg.SigningKey) != ed25519.PrivateKeySize ||
		cfg.GoogleSubject == nil || cfg.DecodeIntegrity == nil || sessions == nil {
		return nil, errAuth
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	cfg.ChallengeKey = append([]byte(nil), cfg.ChallengeKey...)
	cfg.SigningKey = append(ed25519.PrivateKey(nil), cfg.SigningKey...)
	n := &Node{cfg: cfg, sessions: sessions, proofs: &proofs{secret: cfg.ChallengeKey, node: cfg.NodeID, now: cfg.Now, pending: map[string]time.Time{}}, now: cfg.Now, mux: http.NewServeMux()}
	n.mux.HandleFunc("POST /auth/challenge", n.createChallenge)
	n.mux.HandleFunc("POST /auth/google", n.login)
	n.mux.HandleFunc("POST /auth/refresh", n.refresh)
	n.mux.HandleFunc("POST /auth/logout", n.logout)
	n.mux.HandleFunc("GET /v1/me", n.me)
	n.mux.HandleFunc("GET /v1/credits", n.credits)
	if cfg.ScyllaStatus != nil {
		n.mux.Handle("GET /_internal/scylla-status", cfg.ScyllaStatus)
	}
	return n, nil
}

// RunExpiry releases expired node-local challenges even when there is no traffic.
func (n *Node) RunExpiry(ctx context.Context) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			n.proofs.mu.Lock()
			n.proofs.prune(n.now())
			n.proofs.mu.Unlock()
		}
	}
}

func (n *Node) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.URL.RawQuery != "" || r.URL.ForceQuery || r.URL.EscapedPath() != r.URL.Path {
		reject(w, 400)
		return
	}
	n.mux.ServeHTTP(w, r)
}

func jsonReply(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func reject(w http.ResponseWriter, status int) {
	jsonReply(w, status, map[string]string{"error": http.StatusText(status)})
}

func read(w http.ResponseWriter, r *http.Request, max int64) ([]byte, error) {
	return io.ReadAll(http.MaxBytesReader(w, r.Body, max))
}

func bearer(r *http.Request) string {
	v, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || len(v) > 4096 {
		return ""
	}
	return v
}

type issueRequest struct {
	Operation operation `json:"operation"`
	Session   string    `json:"session_id"`
	PublicKey string    `json:"device_public_key"`
}

func (n *Node) createChallenge(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 4096)
	var in issueRequest
	if err != nil || json.Unmarshal(raw, &in) != nil || !validOperation(in.Operation) {
		reject(w, 400)
		return
	}
	var binding string
	switch in.Operation.Path {
	case "/auth/google":
		if in.Session != "" {
			reject(w, 400)
			return
		}
		_, binding, err = publicKey(in.PublicKey)
	case "/auth/refresh":
		_, err = n.sessions.find(in.Session, n.now())
		binding = in.Session
	default:
		var s session
		s, err = n.access(bearer(r))
		binding = s.id
	}
	if err != nil {
		reject(w, 401)
		return
	}
	token, c, err := n.proofs.issue(in.Operation, binding)
	if err != nil {
		reject(w, 503)
		return
	}
	jsonReply(w, 200, map[string]any{"challenge": token, "request_id": c.ID, "issuer_node_id": c.Node,
		"origin": n.cfg.PublicOrigin, "expires_in_ms": proofTTL.Milliseconds()})
}

func validOperation(op operation) bool {
	b, err := hex.DecodeString(op.BodySHA256)
	if err != nil || len(b) != 32 || strings.ToLower(op.BodySHA256) != op.BodySHA256 {
		return false
	}
	switch op.Path {
	case "/auth/google", "/auth/refresh", "/auth/logout":
		return op.Method == http.MethodPost
	case "/v1/me", "/v1/credits":
		return op.Method == http.MethodGet && op.BodySHA256 == digest(nil)
	default:
		return false
	}
}

type loginRequest struct {
	IDToken        string `json:"id_token"`
	IntegrityToken string `json:"integrity_token"`
	PublicKey      string `json:"device_public_key"`
}

func (n *Node) login(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 32<<10)
	var in loginRequest
	if err != nil || json.Unmarshal(raw, &in) != nil {
		reject(w, 400)
		return
	}
	key, device, err := publicKey(in.PublicKey)
	if err != nil {
		reject(w, 401)
		return
	}
	proof := r.Header.Get("X-Mane-Challenge")
	c, err := n.proofs.check(proof, operation{r.Method, r.URL.Path, digest(raw)}, device)
	if err != nil || c.ID != r.Header.Get("X-Mane-Request-Id") || !verifyDevice(key, proof, r.Header.Get("X-Mane-Device-Signature")) ||
		!n.proofs.available(c.ID) {
		reject(w, 401)
		return
	}
	ctx, cancel := context.WithDeadline(r.Context(), time.UnixMilli(c.Issued).Add(proofTTL))
	defer cancel()
	subject, err := n.cfg.GoogleSubject(ctx, in.IDToken, device)
	if err != nil || subject == "" {
		reject(w, 401)
		return
	}
	verdict, err := n.cfg.DecodeIntegrity(ctx, in.IntegrityToken)
	integrityHash := digest([]byte("mane-login-integrity-v1\n" + digest([]byte(in.IDToken)) + "\n" + device))
	if err != nil || !verdict.accepts(n.cfg.PackageName, integrityHash, n.now()) || !n.proofs.consume(c.ID) {
		reject(w, 401)
		return
	}
	result, err := n.start(subject, device, key)
	if err != nil {
		reject(w, 503)
		return
	}
	jsonReply(w, 200, result)
}

func (n *Node) accept(r *http.Request, raw []byte, s session) bool {
	proof := r.Header.Get("X-Mane-Challenge")
	c, err := n.proofs.check(proof, operation{r.Method, r.URL.Path, digest(raw)}, s.id)
	return err == nil && c.ID == r.Header.Get("X-Mane-Request-Id") && verifyDevice(s.key, proof, r.Header.Get("X-Mane-Device-Signature")) &&
		n.proofs.consume(c.ID)
}

func (n *Node) refresh(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 2048)
	var in struct {
		Session string `json:"session_id"`
		Refresh string `json:"refresh_token"`
	}
	if err != nil || json.Unmarshal(raw, &in) != nil {
		reject(w, 400)
		return
	}
	s, err := n.sessions.find(in.Session, n.now())
	if err != nil || !n.accept(r, raw, s) {
		reject(w, 401)
		return
	}
	result, err := n.renew(s.id, in.Refresh)
	if err != nil {
		reject(w, 401)
		return
	}
	jsonReply(w, 200, result)
}

func (n *Node) logout(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 1)
	s, authErr := n.access(bearer(r))
	if err != nil || authErr != nil || len(raw) != 0 || !n.accept(r, raw, s) {
		reject(w, 401)
		return
	}
	n.sessions.mu.Lock()
	delete(n.sessions.rows, s.id)
	n.sessions.mu.Unlock()
	w.WriteHeader(204)
}

func (n *Node) me(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 1)
	s, authErr := n.access(bearer(r))
	if err != nil || len(raw) != 0 || authErr != nil || !n.accept(r, raw, s) {
		reject(w, 401)
		return
	}
	jsonReply(w, 200, map[string]string{"subject": s.subject})
}

func (n *Node) credits(w http.ResponseWriter, r *http.Request) {
	raw, err := read(w, r, 1)
	s, authErr := n.access(bearer(r))
	if err != nil || len(raw) != 0 || authErr != nil || !n.accept(r, raw, s) {
		reject(w, 401)
		return
	}
	if n.cfg.CreditBalance == nil {
		reject(w, 503)
		return
	}
	balance, err := n.cfg.CreditBalance(r.Context(), s.subject)
	if err != nil || balance < 0 || balance > (1<<53)-1 {
		reject(w, 503)
		return
	}
	jsonReply(w, 200, map[string]int64{"available_credits": balance})
}
