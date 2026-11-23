package androidauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/golang-jwt/jwt/v5"
)

type fixture struct {
	t         *testing.T
	a, b      *httptest.Server
	clock     atomic.Int64
	google    *rsa.PrivateKey
	device    *ecdsa.PrivateKey
	deviceDER string
}

type ticket struct {
	Token  string `json:"challenge"`
	ID     string `json:"request_id"`
	Node   string `json:"issuer_node_id"`
	Origin string `json:"origin"`
	TTL    int64  `json:"expires_in_ms"`
}

func setup(t *testing.T) *fixture {
	sessions := NewMemorySessions()
	return setupWithSessions(t, func() SessionStore { return sessions }, false)
}

func setupWithSessions(t *testing.T, sessions func() SessionStore, direct bool) *fixture {
	t.Helper()
	google, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	device, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKIXPublicKey(&device.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	f := &fixture{t: t, google: google, device: device, deviceDER: wire.EncodeToString(der)}
	f.clock.Store(time.Now().UnixNano())
	_, signing, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := GoogleIDToken{Audience: "fixture-app", Now: f.now, Key: func(_ context.Context, key string) (*rsa.PublicKey, error) {
		if key != "fixture" {
			return nil, errAuth
		}
		return &google.PublicKey, nil
	}}
	for _, label := range []string{"a", "b"} {
		nodeSigning := signing
		if direct {
			_, nodeSigning, err = ed25519.GenerateKey(rand.Reader)
			if err != nil {
				t.Fatal(err)
			}
		}
		config := Config{NodeID: label, PublicOrigin: "https://node-" + label + ".example.test", PackageName: "com.disnana.mane_chan", SigningKeyID: "test",
			ChallengeKey: []byte(strings.Repeat(label, 32)), SigningKey: nodeSigning, Now: f.now, GoogleSubject: verifier.Subject,
			DirectSessions: direct,
			CreditBalance: func(_ context.Context, subject string) (int64, error) {
				if subject != "google-account-sub" {
					return 0, errAuth
				}
				return 125, nil
			},
			DecodeIntegrity: func(_ context.Context, raw string) (IntegrityVerdict, error) {
				var v IntegrityVerdict
				return v, json.Unmarshal([]byte(raw), &v)
			}}
		node, err := NewNode(config, sessions())
		if err != nil {
			t.Fatal(err)
		}
		srv := httptest.NewServer(node)
		t.Cleanup(srv.Close)
		if label == "a" {
			f.a = srv
		} else {
			f.b = srv
		}
	}
	return f
}

func (f *fixture) now() time.Time { return time.Unix(0, f.clock.Load()) }

func encode(t *testing.T, v any) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func (f *fixture) loginBody(issuer, audience string, expires time.Time, change func(*IntegrityVerdict)) string {
	f.t.Helper()
	der, _ := wire.DecodeString(f.deviceDER)
	wrongNonce := issuer == "wrong-nonce"
	if wrongNonce {
		issuer = "accounts.google.com"
	}
	badSignature := issuer == "bad-signature"
	if badSignature {
		issuer = "accounts.google.com"
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{"iss": issuer, "sub": "google-account-sub", "aud": audience,
		"exp": expires.Unix(), "nonce": digest(der) + "." + strings.Repeat("a", 32)})
	if wrongNonce {
		token.Claims.(jwt.MapClaims)["nonce"] = strings.Repeat("b", 97)
	}
	token.Header["kid"] = "fixture"
	key := f.google
	if badSignature {
		var err error
		key, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			f.t.Fatal(err)
		}
	}
	raw, err := token.SignedString(key)
	if err != nil {
		f.t.Fatal(err)
	}
	verdict := IntegrityVerdict{"com.disnana.mane_chan", digest([]byte("mane-login-integrity-v1\n" + digest([]byte(raw)) + "\n" + digest(der))),
		f.now(), "PLAY_RECOGNIZED", []string{"MEETS_DEVICE_INTEGRITY"}}
	if change != nil {
		change(&verdict)
	}
	return encode(f.t, loginRequest{raw, encode(f.t, verdict), f.deviceDER})
}

func (f *fixture) call(host, method, path, body, access string, proof ticket, key *ecdsa.PrivateKey) (int, []byte, error) {
	req, err := http.NewRequest(method, host+path, strings.NewReader(body))
	if err != nil {
		return 0, nil, err
	}
	if access != "" {
		req.Header.Set("Authorization", "Bearer "+access)
	}
	if proof.Token != "" {
		req.Header.Set("X-Mane-Challenge", proof.Token)
		req.Header.Set("X-Mane-Request-Id", proof.ID)
		input := sha256.Sum256([]byte("mane-device-proof-v1\n" + proof.Token))
		sig, err := ecdsa.SignASN1(rand.Reader, key, input[:])
		if err != nil {
			return 0, nil, err
		}
		req.Header.Set("X-Mane-Device-Signature", wire.EncodeToString(sig))
	}
	res, err := f.a.Client().Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	return res.StatusCode, data, err
}

func (f *fixture) want(host, method, path, body, access string, proof ticket, key *ecdsa.PrivateKey, want int) []byte {
	f.t.Helper()
	status, res, err := f.call(host, method, path, body, access, proof, key)
	if err != nil || status != want {
		f.t.Fatalf("%s %s status %d, want %d (%v)", method, path, status, want, err)
	}
	return res
}

func (f *fixture) challenge(host, method, path, body, access, sid string) ticket {
	f.t.Helper()
	input := issueRequest{Operation: operation{method, path, digest([]byte(body))}, Session: sid}
	if path == "/auth/google" {
		input.PublicKey = f.deviceDER
	}
	data := f.want(host, "POST", "/auth/challenge", encode(f.t, input), access, ticket{}, nil, 200)
	var proof ticket
	if err := json.Unmarshal(data, &proof); err != nil || proof.TTL != 5000 || proof.Origin != "https://node-"+proof.Node+".example.test" {
		f.t.Fatalf("invalid challenge response: %v", err)
	}
	return proof
}

func (f *fixture) login() tokens {
	f.t.Helper()
	body := f.loginBody("accounts.google.com", "fixture-app", f.now().Add(time.Minute), nil)
	path := "/auth/google"
	p := f.challenge(f.a.URL, "POST", path, body, "", "")
	data := f.want(f.a.URL, "POST", path, body, "", p, f.device, 200)
	var result tokens
	if err := json.Unmarshal(data, &result); err != nil || result.Access == "" || result.Refresh == "" || result.Session == "" {
		f.t.Fatal("missing session tokens")
	}
	return result
}

func TestRejectInvalidLogin(t *testing.T) {
	f := setup(t)
	path := "/auth/google"
	for _, tc := range []struct {
		name, iss, aud string
		ttl            time.Duration
		alter          func(*IntegrityVerdict)
	}{
		{"issuer", "issuer.example.test", "fixture-app", time.Minute, nil},
		{"audience", "accounts.google.com", "wrong-app", time.Minute, nil},
		{"expiry", "accounts.google.com", "fixture-app", -time.Second, nil},
		{"wrong Google nonce", "wrong-nonce", "fixture-app", time.Minute, nil},
		{"RSA signature", "bad-signature", "fixture-app", time.Minute, nil},
		{"integrity request hash", "accounts.google.com", "fixture-app", time.Minute, func(v *IntegrityVerdict) { v.RequestHash = "different" }},
		{"integrity package", "accounts.google.com", "fixture-app", time.Minute, func(v *IntegrityVerdict) { v.Package = "other" }},
		{"integrity app", "accounts.google.com", "fixture-app", time.Minute, func(v *IntegrityVerdict) { v.AppRecognition = "UNRECOGNIZED_VERSION" }},
		{"integrity device", "accounts.google.com", "fixture-app", time.Minute, func(v *IntegrityVerdict) { v.DeviceRecognition = nil }},
		{"integrity stale", "accounts.google.com", "fixture-app", time.Minute, func(v *IntegrityVerdict) { v.Timestamp = v.Timestamp.Add(-3 * time.Minute) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := f.loginBody(tc.iss, tc.aud, f.now().Add(tc.ttl), tc.alter)
			f.want(f.a.URL, "POST", path, body, "", f.challenge(f.a.URL, "POST", path, body, "", ""), f.device, 401)
		})
	}
}

func TestChallengeIsNodeLocalAndAcceptsOnlyOnce(t *testing.T) {
	f := setup(t)
	s := f.login()
	path := "/v1/me"
	p := f.challenge(f.a.URL, "GET", path, "", s.Access, "")
	f.want(f.b.URL, "GET", path, "", s.Access, p, f.device, 401)
	f.want(f.a.URL, "GET", path, "", s.Access, ticket{}, nil, 401)
	forged := p
	forged.Token += "A"
	f.want(f.a.URL, "GET", path, "", s.Access, forged, f.device, 401)
	wrong, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	f.want(f.a.URL, "GET", path, "", s.Access, p, wrong, 401)
	wrongID := p
	wrongID.ID += "A"
	f.want(f.a.URL, "GET", path, "", s.Access, wrongID, f.device, 401)
	f.want(f.a.URL, "POST", "/auth/logout", "", s.Access, p, f.device, 401)

	var successes atomic.Int32
	var wg sync.WaitGroup
	for range 32 {
		wg.Go(func() {
			status, _, err := f.call(f.a.URL, "GET", path, "", s.Access, p, f.device)
			if err != nil || (status != 200 && status != 401) {
				t.Errorf("unexpected status %d: %v", status, err)
			}
			if status == 200 {
				successes.Add(1)
			}
		})
	}
	wg.Wait()
	if successes.Load() != 1 {
		t.Fatalf("accepted %d copies", successes.Load())
	}
	f.want(f.a.URL, "GET", path, "", s.Access, p, f.device, 401)
}

func TestFailoverAndSessionLifecycle(t *testing.T) {
	checkFailover(t, setup(t), false)
}

func TestScyllaAndroidFailover(t *testing.T) {
	if os.Getenv("MANE_TEST_SCYLLA") != "1" {
		t.Skip("requires an isolated Scylla keyspace with the Android session schema")
	}
	f := setupWithSessions(t, func() SessionStore {
		wallet, err := credits.OpenFromEnv()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(wallet.Close)
		sessions, err := NewScyllaSessions(wallet.Session())
		if err != nil {
			t.Fatal(err)
		}
		return sessions
	}, true)
	checkFailover(t, f, true)
}

func checkFailover(t *testing.T, f *fixture, direct bool) {
	t.Helper()
	s := f.login()
	p := f.challenge(f.a.URL, "GET", "/v1/me", "", s.Access, "")
	f.clock.Add(int64(5 * time.Second))
	f.want(f.a.URL, "GET", "/v1/me", "", s.Access, p, f.device, 401)
	p = f.challenge(f.a.URL, "GET", "/v1/me", "", s.Access, "")
	f.a.Close()
	if _, _, err := f.call(f.a.URL, "GET", "/v1/me", "", s.Access, p, f.device); err == nil {
		t.Fatal("stopped node still reachable")
	}
	f.clock.Add(int64(5 * time.Second))
	f.want(f.b.URL, "GET", "/v1/me", "", s.Access, p, f.device, 401)
	if direct {
		f.want(f.b.URL, "POST", "/auth/challenge", encode(t, issueRequest{Operation: operation{"GET", "/v1/me", digest(nil)}}), s.Access, ticket{}, nil, 401)
		body := fmt.Sprintf(`{"session_id":%q,"refresh_token":%q}`, s.Session, s.Refresh)
		proof := f.challenge(f.b.URL, "POST", "/auth/refresh", body, "", s.Session)
		data := f.want(f.b.URL, "POST", "/auth/refresh", body, "", proof, f.device, 200)
		var assigned tokens
		if json.Unmarshal(data, &assigned) != nil || assigned.Session != s.Session || assigned.Access == s.Access ||
			assigned.IssuerNodeID != "b" || assigned.Origin != "https://node-b.example.test" {
			t.Fatal("new node did not reissue authorization for the same session")
		}
		s = assigned
	}
	p = f.challenge(f.b.URL, "GET", "/v1/me", "", s.Access, "")
	f.want(f.b.URL, "GET", "/v1/me", "", s.Access, p, f.device, 200)
	f.clock.Add(int64(10 * time.Minute))
	f.want(f.b.URL, "POST", "/auth/challenge", encode(t, issueRequest{Operation: operation{"GET", "/v1/me", digest(nil)}}), s.Access, ticket{}, nil, 401)
	body := fmt.Sprintf(`{"session_id":%q,"refresh_token":%q}`, s.Session, s.Refresh)
	proof := f.challenge(f.b.URL, "POST", "/auth/refresh", body, "", s.Session)
	f.want(f.b.URL, "POST", "/auth/refresh", body+" ", "", proof, f.device, 401)
	data := f.want(f.b.URL, "POST", "/auth/refresh", body, "", proof, f.device, 200)
	var next tokens
	if json.Unmarshal(data, &next) != nil || next.Refresh == s.Refresh || next.Session != s.Session {
		t.Fatal("refresh was not rotated")
	}
	f.want(f.b.URL, "POST", "/auth/refresh", body, "", f.challenge(f.b.URL, "POST", "/auth/refresh", body, "", s.Session), f.device, 401)
	p = f.challenge(f.b.URL, "GET", "/v1/me", "", next.Access, "")
	f.want(f.b.URL, "POST", "/auth/logout", "", next.Access, f.challenge(f.b.URL, "POST", "/auth/logout", "", next.Access, ""), f.device, 204)
	f.want(f.b.URL, "GET", "/v1/me", "", next.Access, p, f.device, 401)
}

func TestRefreshExpiresAfterFourteenDays(t *testing.T) {
	f := setup(t)
	s := f.login()
	f.clock.Add(int64(14*24*time.Hour - time.Second))
	body := fmt.Sprintf(`{"session_id":%q,"refresh_token":%q}`, s.Session, s.Refresh)
	p := f.challenge(f.a.URL, "POST", "/auth/refresh", body, "", s.Session)
	f.clock.Add(int64(time.Second))
	f.want(f.a.URL, "POST", "/auth/refresh", body, "", p, f.device, 401)
}

func TestCreditsRequiresSignedSessionAndReturnsItsBalance(t *testing.T) {
	f := setup(t)
	s := f.login()
	p := f.challenge(f.a.URL, "GET", "/v1/credits", "", s.Access, "")
	f.want(f.a.URL, "GET", "/v1/credits", "", "", p, f.device, 401)
	result := f.want(f.a.URL, "GET", "/v1/credits", "", s.Access, p, f.device, 200)
	var got struct {
		Available int64 `json:"available_credits"`
	}
	if err := json.Unmarshal(result, &got); err != nil || got.Available != 125 {
		t.Fatalf("unexpected balance: %s", result)
	}
	f.want(f.a.URL, "GET", "/v1/credits", "", s.Access, p, f.device, 401)
}
