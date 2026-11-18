package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"

	"github.com/disnana/dmm/server/internal/store"
)

// waUser adapts an account to the webauthn library.
type waUser struct {
	id    []byte
	name  string
	creds []webauthn.Credential
}

func (u *waUser) WebAuthnID() []byte                         { return u.id }
func (u *waUser) WebAuthnName() string                       { return u.name }
func (u *waUser) WebAuthnDisplayName() string                { return u.name }
func (u *waUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

const ceremonyTTL = 5 * time.Minute

type regCeremony struct {
	Session webauthn.SessionData `json:"s"`
	UserID  []byte               `json:"u"`
	Name    string               `json:"n"`
}

type loginCeremony struct {
	Session webauthn.SessionData `json:"s"`
}

type tokenResponse struct {
	Token   string `json:"token"`
	Expires int64  `json:"expires_at"`
}

// registerBegin starts creating an account. Accounts are optional: a client that never calls this keeps
// working fully offline on its own device.
func (s *Server) registerBegin(w http.ResponseWriter, r *http.Request) {
	if !s.cfg.AllowRegistration {
		writeErr(w, http.StatusForbidden, "registration is closed on this server")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if r.ContentLength != 0 && !decode(w, r, 4<<10, &body) {
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "DMM"
	}
	if utf8.RuneCountInString(name) > 64 {
		writeErr(w, http.StatusBadRequest, "name too long")
		return
	}
	user := &waUser{id: store.NewID(), name: name}
	creation, session, err := s.wa.BeginRegistration(user, webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired))
	if err != nil {
		s.fail(w, err)
		return
	}
	tok, err := s.seal.Seal("reg", ceremonyTTL, regCeremony{Session: *session, UserID: user.id, Name: name})
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ceremony": tok, "options": creation})
}

func (s *Server) registerFinish(w http.ResponseWriter, r *http.Request) {
	var c regCeremony
	if err := s.seal.Open("reg", r.URL.Query().Get("ceremony"), &c); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or expired ceremony")
		return
	}
	user := &waUser{id: c.UserID, name: c.Name}
	cred, err := s.wa.FinishRegistration(user, c.Session, r)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "registration failed")
		return
	}
	data, err := json.Marshal(cred)
	if err != nil {
		s.fail(w, err)
		return
	}
	if err := s.store.CreateUser(r.Context(), store.User{ID: c.UserID, Name: c.Name}, cred.ID, data); err != nil {
		s.fail(w, err)
		return
	}
	s.issueToken(w, r, c.UserID)
}

func (s *Server) loginBegin(w http.ResponseWriter, r *http.Request) {
	assertion, session, err := s.wa.BeginDiscoverableLogin()
	if err != nil {
		s.fail(w, err)
		return
	}
	tok, err := s.seal.Seal("login", ceremonyTTL, loginCeremony{Session: *session})
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"ceremony": tok, "options": assertion})
}

func (s *Server) loginFinish(w http.ResponseWriter, r *http.Request) {
	var c loginCeremony
	if err := s.seal.Open("login", r.URL.Query().Get("ceremony"), &c); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid or expired ceremony")
		return
	}
	var found *waUser
	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		u, err := s.loadUser(r, userHandle)
		found = u
		return u, err
	}
	cred, err := s.wa.FinishDiscoverableLogin(handler, c.Session, r)
	if err != nil || found == nil {
		writeErr(w, http.StatusUnauthorized, "login failed")
		return
	}
	// persist the updated signature counter (clone detection)
	if data, err := json.Marshal(cred); err == nil {
		_ = s.store.UpdateCredential(r.Context(), cred.ID, data)
	}
	s.issueToken(w, r, found.id)
}

func (s *Server) loadUser(r *http.Request, id []byte) (*waUser, error) {
	u, err := s.store.GetUser(r.Context(), id)
	if err != nil {
		return nil, errors.New("unknown user")
	}
	blobs, err := s.store.Credentials(r.Context(), id)
	if err != nil {
		return nil, err
	}
	wu := &waUser{id: u.ID, name: u.Name}
	for _, b := range blobs {
		var c webauthn.Credential
		if json.Unmarshal(b, &c) == nil {
			wu.creds = append(wu.creds, c)
		}
	}
	return wu, nil
}

func (s *Server) issueToken(w http.ResponseWriter, r *http.Request, uid []byte) {
	tok, exp, err := s.store.NewSession(r.Context(), uid, s.cfg.SessionTTL)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, 200, tokenResponse{Token: tok, Expires: exp.Unix()})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	_ = s.store.DeleteSession(r.Context(), bearer(r))
	w.WriteHeader(http.StatusNoContent)
}

// deleteAccount erases the account and every byte stored for it (sessions, credentials, log, snapshot).
func (s *Server) deleteAccount(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteUser(r.Context(), userID(r)); err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)
	u, err := s.store.GetUser(r.Context(), uid)
	if err != nil {
		s.fail(w, err)
		return
	}
	use, err := s.store.Usage(r.Context(), uid)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{
		"name": u.Name, "created_at": u.CreatedAt.Unix(),
		"ops": use.Ops, "bytes": use.Bytes, "quota_bytes": s.cfg.MaxUserBytes,
	})
}
