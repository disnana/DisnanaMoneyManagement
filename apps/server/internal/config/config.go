// Package config reads the server configuration from environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr              string        // DMM_ADDR            listen address (default :8080)
	DBURL             string        // DMM_DB_URL          sqlite:./dmm.db | postgres://user:pass@host/db | scylla://hosts/keyspace
	Secret            string        // DMM_SECRET          shared by ALL nodes: seals WebAuthn ceremonies (>= 32 chars)
	Nodes             []string      // DMM_NODES           public base URLs of every node (subdomains), advertised for client fail-over
	RPID              string        // DMM_RP_ID           WebAuthn relying party id, e.g. money.example.com
	RPName            string        // DMM_RP_NAME         shown by the authenticator
	RPOrigins         []string      // DMM_RP_ORIGINS      allowed web origins, comma separated (https://...)
	RPOpaqueOrigins   []string      // DMM_RP_ANDROID_ORIGINS  android:apk-key-hash:... for the native Android app
	CORSOrigins       []string      // DMM_CORS_ORIGINS    browsers allowed to call the API (defaults to RPOrigins)
	AllowRegistration bool          // DMM_ALLOW_REGISTRATION  create new accounts (default true)
	TrustProxy        bool          // DMM_TRUST_PROXY     use X-Forwarded-For for rate limiting (behind Caddy/nginx)
	SessionTTL        time.Duration // DMM_SESSION_TTL     default 720h (30 days)
	MaxOpBytes        int           // DMM_MAX_OP_BYTES    one encrypted operation (default 64 KiB)
	MaxSnapshotBytes  int           // DMM_MAX_SNAPSHOT_BYTES (default 8 MiB)
	MaxUserBytes      int64         // DMM_MAX_USER_BYTES  total stored per account (default 256 MiB)
}

func Load() (Config, error) {
	c := Config{
		Addr:              env("DMM_ADDR", ":8080"),
		DBURL:             env("DMM_DB_URL", "sqlite:./dmm.db"),
		Secret:            env("DMM_SECRET", ""),
		Nodes:             list(env("DMM_NODES", "")),
		RPID:              env("DMM_RP_ID", "localhost"),
		RPName:            env("DMM_RP_NAME", "DMM"),
		RPOrigins:         list(env("DMM_RP_ORIGINS", "http://localhost:3000")),
		RPOpaqueOrigins:   list(env("DMM_RP_ANDROID_ORIGINS", "")),
		AllowRegistration: boolean(env("DMM_ALLOW_REGISTRATION", "true")),
		TrustProxy:        boolean(env("DMM_TRUST_PROXY", "false")),
		MaxOpBytes:        atoi(env("DMM_MAX_OP_BYTES", "65536")),
		MaxSnapshotBytes:  atoi(env("DMM_MAX_SNAPSHOT_BYTES", "8388608")),
		MaxUserBytes:      int64(atoi(env("DMM_MAX_USER_BYTES", "268435456"))),
	}
	c.CORSOrigins = list(env("DMM_CORS_ORIGINS", strings.Join(c.RPOrigins, ",")))
	ttl, err := time.ParseDuration(env("DMM_SESSION_TTL", "720h"))
	if err != nil {
		return c, fmt.Errorf("DMM_SESSION_TTL: %w", err)
	}
	c.SessionTTL = ttl
	if c.RPID == "" || len(c.RPOrigins) == 0 {
		return c, fmt.Errorf("DMM_RP_ID and DMM_RP_ORIGINS are required")
	}
	return c, nil
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func list(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func boolean(s string) bool {
	b, _ := strconv.ParseBool(s)
	return b
}

func atoi(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
