package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

// sealer turns short-lived server state (a WebAuthn ceremony) into an authenticated, encrypted token that
// the client carries between "begin" and "finish". Nothing is stored server-side, so ANY node sharing
// DMM_SECRET can finish a ceremony another node began.
type sealer struct{ aead cipher.AEAD }

func newSealer(secret string) (*sealer, error) {
	key := sha256.Sum256([]byte("dmm-ceremony-v1|" + secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &sealer{aead: aead}, nil
}

type sealed struct {
	Purpose string          `json:"p"`
	Expires int64           `json:"e"`
	Data    json.RawMessage `json:"d"`
}

func (s *sealer) Seal(purpose string, ttl time.Duration, v any) (string, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	plain, err := json.Marshal(sealed{Purpose: purpose, Expires: time.Now().Add(ttl).Unix(), Data: data})
	if err != nil {
		return "", err
	}
	nonce := make([]byte, s.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(s.aead.Seal(nonce, nonce, plain, []byte(purpose))), nil
}

var errBadCeremony = errors.New("invalid or expired ceremony")

func (s *sealer) Open(purpose, token string, v any) error {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(raw) < s.aead.NonceSize() {
		return errBadCeremony
	}
	n := s.aead.NonceSize()
	plain, err := s.aead.Open(nil, raw[:n], raw[n:], []byte(purpose))
	if err != nil {
		return errBadCeremony
	}
	var sl sealed
	if err := json.Unmarshal(plain, &sl); err != nil || sl.Purpose != purpose || time.Now().Unix() > sl.Expires {
		return errBadCeremony
	}
	return json.Unmarshal(sl.Data, v)
}
