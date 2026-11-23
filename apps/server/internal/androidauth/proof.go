// Package androidauth implements the opt-in Android authentication prototype.
package androidauth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"time"
)

const proofTTL = 5 * time.Second

var errAuth = errors.New("authentication rejected")
var errBusy = errors.New("challenge capacity reached")
var wire = base64.RawURLEncoding

type operation struct {
	Method     string `json:"method"`
	Path       string `json:"path"`
	BodySHA256 string `json:"body_sha256"`
}
type challenge struct {
	ID        string    `json:"request_id"`
	Node      string    `json:"issuer_node_id"`
	Issued    int64     `json:"issued_at_ms"`
	Operation operation `json:"operation"`
	Binding   string    `json:"binding"`
}
type proofs struct {
	secret  []byte
	node    string
	now     func() time.Time
	mu      sync.Mutex
	pending map[string]time.Time
}

func digest(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func randomID() string {
	var bytes [32]byte
	_, _ = rand.Read(bytes[:])
	return wire.EncodeToString(bytes[:])
}

func (p *proofs) mac(data string) []byte {
	h := hmac.New(sha256.New, p.secret)
	h.Write([]byte("mane-challenge-v1\n"))
	h.Write([]byte(data))
	return h.Sum(nil)
}

func (p *proofs) issue(op operation, binding string) (string, challenge, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	now := p.now()
	p.prune(now)
	if len(p.pending) >= 4096 {
		return "", challenge{}, errBusy
	}
	c := challenge{randomID(), p.node, now.UnixMilli(), op, binding}
	payload, _ := json.Marshal(c)
	encoded := wire.EncodeToString(payload)
	p.pending[c.ID] = now.Add(proofTTL)
	return encoded + "." + wire.EncodeToString(p.mac(encoded)), c, nil
}

func (p *proofs) prune(now time.Time) {
	for id, expiry := range p.pending {
		if !now.Before(expiry) {
			delete(p.pending, id)
		}
	}
}

func (p *proofs) check(token string, op operation, binding string) (challenge, error) {
	var c challenge
	encoded, sig, ok := strings.Cut(token, ".")
	if !ok || len(token) > 4096 {
		return c, errAuth
	}
	mac, err := wire.DecodeString(sig)
	if err != nil || !hmac.Equal(mac, p.mac(encoded)) {
		return c, errAuth
	}
	data, err := wire.DecodeString(encoded)
	if err != nil || json.Unmarshal(data, &c) != nil || c.Node != p.node || c.Operation != op || c.Binding != binding {
		return c, errAuth
	}
	return c, nil
}

func (p *proofs) available(id string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	expires, ok := p.pending[id]
	return ok && p.now().Before(expires)
}

func (p *proofs) consume(id string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.prune(p.now())
	if _, ok := p.pending[id]; !ok {
		return false
	}
	delete(p.pending, id)
	return true
}

func publicKey(s string) (*ecdsa.PublicKey, string, error) {
	data, err := wire.DecodeString(s)
	if err != nil || len(data) > 160 {
		return nil, "", errAuth
	}
	key, err := x509.ParsePKIXPublicKey(data)
	ec, ok := key.(*ecdsa.PublicKey)
	if err != nil || !ok || ec.Curve != elliptic.P256() {
		return nil, "", errAuth
	}
	return ec, digest(data), nil
}

func verifyDevice(key *ecdsa.PublicKey, challengeToken, signature string) bool {
	sig, err := wire.DecodeString(signature)
	if err != nil || len(sig) > 80 {
		return false
	}
	input := sha256.Sum256([]byte("mane-device-proof-v1\n" + challengeToken))
	return ecdsa.VerifyASN1(key, input[:], sig)
}
