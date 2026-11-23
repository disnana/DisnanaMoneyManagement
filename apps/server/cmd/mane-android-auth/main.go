// The Android account service is a separate staging entry point.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/disnana/dmm/server/internal/androidauth"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

func main() {
	check := flag.Bool("check-config", false, "validate configuration without listening")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Fatal("unexpected positional arguments")
	}
	if err := run(*check); err != nil {
		log.Fatal(err)
	}
}

func run(checkConfig bool) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if os.Getenv("MANE_AUTH_STAGING") != "1" {
		return errors.New("set MANE_AUTH_STAGING=1 to use the single-node staging server")
	}
	audience := os.Getenv("MANE_GOOGLE_WEB_CLIENT_ID")
	if audience == "" {
		return errors.New("MANE_GOOGLE_WEB_CLIENT_ID is required")
	}
	challenge, err := base64.RawURLEncoding.DecodeString(os.Getenv("MANE_CHALLENGE_KEY"))
	if err != nil || len(challenge) < 32 {
		return errors.New("MANE_CHALLENGE_KEY requires 32 or more bytes in unpadded base64url")
	}
	seed, err := base64.RawURLEncoding.DecodeString(os.Getenv("MANE_JWT_SEED"))
	if err != nil || len(seed) != ed25519.SeedSize {
		return errors.New("MANE_JWT_SEED requires a 32-byte seed in unpadded base64url")
	}
	addresses := os.Getenv("MANE_AUTH_LISTEN")
	if addresses == "" {
		addresses = "127.0.0.1:8081"
	}
	host, _, err := net.SplitHostPort(addresses)
	if ip := net.ParseIP(host); err != nil || ip == nil || !ip.IsLoopback() {
		return errors.New("MANE_AUTH_LISTEN must use a loopback IP")
	}
	client := &http.Client{Timeout: 4 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	source, err := google.DefaultTokenSource(context.WithValue(ctx, oauth2.HTTPClient, client), androidauth.IntegrityScope)
	if err != nil {
		return errors.New("Google Application Default Credentials are required")
	}
	const pkg = "com.disnana.mane_chan"
	googleID := androidauth.GoogleIDToken{Audience: audience, Key: androidauth.GoogleKeyResolver(client)}
	config := androidauth.Config{NodeID: os.Getenv("MANE_NODE_ID"), PublicOrigin: os.Getenv("MANE_NODE_ORIGIN"),
		PackageName: pkg, SigningKeyID: os.Getenv("MANE_JWT_KID"), ChallengeKey: challenge, SigningKey: ed25519.NewKeyFromSeed(seed),
		GoogleSubject: googleID.Subject, DecodeIntegrity: androidauth.PlayIntegrityDecoder(client, source, pkg)}
	if path := os.Getenv("MANE_STAGING_CREDITS_FILE"); path != "" {
		data, err := os.ReadFile(path)
		entries := map[string]int64{}
		if err != nil || json.Unmarshal(data, &entries) != nil {
			return errors.New("could not load MANE_STAGING_CREDITS_FILE")
		}
		config.CreditBalance = func(_ context.Context, sub string) (int64, error) {
			amount, ok := entries[sub]
			if !ok {
				return 0, errors.New("balance has not been provisioned")
			}
			return amount, nil
		}
	}
	if token := os.Getenv("MANE_WORKER_HEALTH_TOKEN"); token != "" {
		status, valid := androidauth.NewScyllaStatus(token)
		if !valid {
			return errors.New("MANE_WORKER_HEALTH_TOKEN must be at least 32 characters without whitespace")
		}
		config.ScyllaStatus = status
	}
	node, err := androidauth.NewNode(config, androidauth.NewMemorySessions())
	if err != nil {
		return errors.New("invalid Android auth environment settings")
	}
	if checkConfig {
		return nil
	}
	server := &http.Server{Addr: addresses, Handler: node, ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 6 * time.Second, WriteTimeout: 8 * time.Second, IdleTimeout: 30 * time.Second}
	go node.RunExpiry(ctx)
	if config.ScyllaStatus != nil {
		nodetool := os.Getenv("MANE_NODETOOL_PATH")
		if nodetool == "" {
			nodetool = "nodetool"
		}
		go config.ScyllaStatus.Poll(ctx, nodetool)
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	log.Printf("Android auth staging listening on %s", addresses)
	if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
