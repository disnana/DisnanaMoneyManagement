// dmm-server: optional passkey accounts + end-to-end-encrypted sync for DMM. Stateless apart from the
// database, so run as many nodes as you like behind subdomains.
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/disnana/dmm/server/internal/api"
	"github.com/disnana/dmm/server/internal/config"
	"github.com/disnana/dmm/server/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if len(cfg.Secret) < 32 {
		if !strings.HasPrefix(cfg.DBURL, "sqlite:") {
			return errors.New("DMM_SECRET (>= 32 chars, identical on every node) is required with a shared database")
		}
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		cfg.Secret = hex.EncodeToString(b)
		log.Warn("DMM_SECRET not set: generated a random one (fine for a single node; in-flight passkey ceremonies are lost on restart)")
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	st, err := store.Open(ctx, cfg.DBURL)
	if err != nil {
		return err
	}
	defer st.Close()

	srv, err := api.New(cfg, st, log)
	if err != nil {
		return err
	}
	httpSrv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	go func() { // housekeeping
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := st.PurgeExpiredSessions(ctx); err != nil {
					log.Warn("purge sessions", "err", err)
				}
			}
		}
	}()

	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "rp_id", cfg.RPID, "nodes", cfg.Nodes)
		errc <- httpSrv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
		shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return httpSrv.Shutdown(shutdown)
	}
}
