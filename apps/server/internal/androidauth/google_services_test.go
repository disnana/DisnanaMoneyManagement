package androidauth

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return f(request) }

func TestPlayDecoderChecksBothPackageNames(t *testing.T) {
	const pkg = "com.disnana.mane_chan"
	const payload = `{"tokenPayloadExternal":{"requestDetails":{"requestPackageName":"com.disnana.mane_chan","requestHash":"fixture","timestampMillis":"1800000000000"},"appIntegrity":{"packageName":"APP_PACKAGE","appRecognitionVerdict":"PLAY_RECOGNIZED"},"deviceIntegrity":{"deviceRecognitionVerdict":["MEETS_DEVICE_INTEGRITY"]}}}`
	for _, appPackage := range []string{pkg, "com.example.other"} {
		t.Run(appPackage, func(t *testing.T) {
			client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.Method != "POST" || r.URL.String() != "https://playintegrity.googleapis.com/v1/"+pkg+":decodeIntegrityToken" ||
					r.Header.Get("Authorization") != "Bearer fixture" {
					t.Fatal("invalid Google request")
				}
				return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(strings.Replace(payload, "APP_PACKAGE", appPackage, 1)))}, nil
			})}
			v, err := PlayIntegrityDecoder(client, oauth2.StaticTokenSource(&oauth2.Token{AccessToken: "fixture"}), pkg)(context.Background(), "fixture")
			if appPackage != pkg {
				if err == nil {
					t.Fatal("accepted different package")
				}
				return
			}
			if err != nil || !v.accepts(pkg, "fixture", time.UnixMilli(1800000000000)) {
				t.Fatalf("failed valid decode: %v", err)
			}
		})
	}
}
