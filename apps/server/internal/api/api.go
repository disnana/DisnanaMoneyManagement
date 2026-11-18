// Package api is the HTTP surface: optional passkey accounts and an end-to-end-encrypted sync log.
package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/disnana/dmm/server/internal/config"
	"github.com/disnana/dmm/server/internal/store"
)

type Server struct {
	cfg    config.Config
	store  store.Store
	wa     *webauthn.WebAuthn
	seal   *sealer
	log    *slog.Logger
	global *limiter // every request, per client
	auth   *limiter // account endpoints, much stricter
}

func New(cfg config.Config, st store.Store, log *slog.Logger) (*Server, error) {
	wa, err := webauthn.New(&webauthn.Config{
		RPID:            cfg.RPID,
		RPDisplayName:   cfg.RPName,
		RPOrigins:       cfg.RPOrigins,
		RPOpaqueOrigins: cfg.RPOpaqueOrigins,
	})
	if err != nil {
		return nil, err
	}
	sl, err := newSealer(cfg.Secret)
	if err != nil {
		return nil, err
	}
	return &Server{
		cfg: cfg, store: st, wa: wa, seal: sl, log: log,
		global: newLimiter(30, 120),
		auth:   newLimiter(0.2, 10), // ~12/min sustained, bursts of 10
	}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	g := func(h http.HandlerFunc) http.HandlerFunc { return s.limit(s.global, h) }
	a := func(h http.HandlerFunc) http.HandlerFunc { return s.limit(s.global, s.limit(s.auth, h)) }

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", s.ready)
	mux.HandleFunc("GET /v1/discovery", g(s.discovery))

	mux.HandleFunc("POST /v1/auth/register/begin", a(s.registerBegin))
	mux.HandleFunc("POST /v1/auth/register/finish", a(s.registerFinish))
	mux.HandleFunc("POST /v1/auth/login/begin", a(s.loginBegin))
	mux.HandleFunc("POST /v1/auth/login/finish", a(s.loginFinish))
	mux.HandleFunc("POST /v1/auth/logout", g(s.authed(s.logout)))
	mux.HandleFunc("DELETE /v1/account", g(s.authed(s.deleteAccount)))
	mux.HandleFunc("GET /v1/me", g(s.authed(s.me)))

	mux.HandleFunc("POST /v1/sync/push", g(s.authed(s.push)))
	mux.HandleFunc("GET /v1/sync/pull", g(s.authed(s.pull)))
	mux.HandleFunc("PUT /v1/snapshot", g(s.authed(s.putSnapshot)))
	mux.HandleFunc("GET /v1/snapshot", g(s.authed(s.getSnapshot)))
	return s.wrap(mux)
}

// ---- small helpers ---------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// decode reads a size-limited JSON body.
func decode(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeErr(w, http.StatusRequestEntityTooLarge, "request too large")
		} else if errors.Is(err, io.EOF) {
			writeErr(w, http.StatusBadRequest, "empty body")
		} else {
			writeErr(w, http.StatusBadRequest, "invalid JSON")
		}
		return false
	}
	return true
}

func (s *Server) fail(w http.ResponseWriter, err error) {
	s.log.Error("store error", "err", err)
	writeErr(w, http.StatusInternalServerError, "internal error")
}

func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeErr(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, 200, map[string]string{"status": "ready"})
}

// discovery lists every node (e.g. a.sync.example.com, b.sync.example.com) so clients can fail over.
func (s *Server) discovery(w http.ResponseWriter, r *http.Request) {
	nodes := s.cfg.Nodes
	if nodes == nil {
		nodes = []string{}
	}
	writeJSON(w, 200, map[string]any{"nodes": nodes, "registration": s.cfg.AllowRegistration, "rp_id": s.cfg.RPID})
}

var b64 = base64.StdEncoding

var now = time.Now
