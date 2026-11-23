package androidauth

import (
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"
)

const googleCerts = "https://www.googleapis.com/oauth2/v1/certs"
const IntegrityScope = "https://www.googleapis.com/auth/playintegrity"

func GoogleKeyResolver(client *http.Client) func(context.Context, string) (*rsa.PublicKey, error) {
	var mu sync.Mutex
	keys := map[string]*rsa.PublicKey{}
	var expires time.Time
	return func(ctx context.Context, id string) (*rsa.PublicKey, error) {
		mu.Lock()
		defer mu.Unlock()
		if time.Now().Before(expires) {
			if key := keys[id]; key != nil {
				return key, nil
			}
			return nil, errAuth
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCerts, nil)
		if err != nil {
			return nil, err
		}
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			return nil, fmt.Errorf("Google certificates: HTTP %d", res.StatusCode)
		}
		var certs map[string]string
		if err = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&certs); err != nil {
			return nil, err
		}
		fresh := make(map[string]*rsa.PublicKey, len(certs))
		for kid, certificate := range certs {
			block, _ := pem.Decode([]byte(certificate))
			if block == nil {
				continue
			}
			cert, err := x509.ParseCertificate(block.Bytes)
			if err != nil {
				continue
			}
			if key, ok := cert.PublicKey.(*rsa.PublicKey); ok {
				fresh[kid] = key
			}
		}
		if len(fresh) == 0 {
			return nil, errAuth
		}
		var ttl time.Duration
		for _, directive := range strings.Split(res.Header.Get("Cache-Control"), ",") {
			value, ok := strings.CutPrefix(strings.TrimSpace(directive), "max-age=")
			if !ok {
				continue
			}
			seconds, err := strconv.Atoi(value)
			if err == nil && seconds > 0 {
				ttl = time.Duration(min(seconds, 3600)) * time.Second
			}
		}
		if age, err := strconv.Atoi(res.Header.Get("Age")); err == nil && age > 0 {
			ttl = max(0, ttl-time.Duration(min(age, 3600))*time.Second)
		}
		keys, expires = fresh, time.Now().Add(ttl)
		if key := keys[id]; key != nil {
			return key, nil
		}
		return nil, errAuth
	}
}

func PlayIntegrityDecoder(client *http.Client, source oauth2.TokenSource, pkg string) func(context.Context, string) (IntegrityVerdict, error) {
	return func(ctx context.Context, token string) (IntegrityVerdict, error) {
		var verdict IntegrityVerdict
		if token == "" || len(token) > 24<<10 {
			return verdict, errAuth
		}
		body, _ := json.Marshal(map[string]string{"integrity_token": token})
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://playintegrity.googleapis.com/v1/"+pkg+":decodeIntegrityToken", strings.NewReader(string(body)))
		if err != nil {
			return verdict, err
		}
		access, err := source.Token()
		if err != nil {
			return verdict, err
		}
		access.SetAuthHeader(req)
		req.Header.Set("Content-Type", "application/json")
		res, err := client.Do(req)
		if err != nil {
			return verdict, err
		}
		defer res.Body.Close()
		if res.StatusCode != 200 {
			return verdict, fmt.Errorf("Play Integrity: HTTP %d", res.StatusCode)
		}
		var response struct {
			Payload struct {
				Request struct {
					Package   string `json:"requestPackageName"`
					Hash      string `json:"requestHash"`
					Timestamp string `json:"timestampMillis"`
				} `json:"requestDetails"`
				App struct {
					Package     string `json:"packageName"`
					Recognition string `json:"appRecognitionVerdict"`
				} `json:"appIntegrity"`
				Device struct {
					Verdicts []string `json:"deviceRecognitionVerdict"`
				} `json:"deviceIntegrity"`
			} `json:"tokenPayloadExternal"`
		}
		if err := json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&response); err != nil {
			return verdict, err
		}
		p := response.Payload
		ms, err := strconv.ParseInt(p.Request.Timestamp, 10, 64)
		if err != nil || p.Request.Package != pkg || p.App.Package != pkg {
			return verdict, errAuth
		}
		return IntegrityVerdict{Package: p.Request.Package, RequestHash: p.Request.Hash, Timestamp: time.UnixMilli(ms),
			AppRecognition: p.App.Recognition, DeviceRecognition: p.Device.Verdicts}, nil
	}
}
