package webshop

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gocql/gocql"
)

const DirectPrefix = "/v1/shop-read/"

func (a *API) DirectReader(origin string, verify func(string, time.Time) (string, bool)) (http.Handler, error) {
	site, err := url.Parse(origin)
	if err != nil || site.Scheme != "https" || site.Hostname() == "" || site.User != nil || origin != "https://"+site.Host || verify == nil {
		return nil, errors.New("invalid MANE_WEB_DIRECT_SITE_ORIGIN")
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("Vary", "Origin")
		if r.Header.Get("Origin") != origin || r.URL.EscapedPath() != r.URL.Path {
			http.NotFound(w, r)
			return
		}
		path := strings.TrimPrefix(r.URL.Path, DirectPrefix)
		if path != "summary" && path != "history/orders" && path != "history/activity" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", origin)
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization")
			w.Header().Set("Access-Control-Max-Age", "300")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		q, err := url.ParseQuery(r.URL.RawQuery)
		if err != nil || q.Encode() != "" && (path == "summary" || len(q) != 1 || len(q["cursor"]) != 1 || len(q.Get("cursor")) > 208) {
			shopResponse(w, nil, errBad)
			return
		}
		token, _ := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		sid, valid := verify(token, time.Now())
		if !valid {
			shopResponse(w, nil, errAuth)
			return
		}
		var subject string
		err = a.store.query(r.Context(), "SELECT subject FROM shop_sessions WHERE id = ?", sid).Scan(&subject)
		if errors.Is(err, gocql.ErrNotFound) {
			err = errAuth
		}
		if err != nil || subject == "" {
			if err == nil {
				err = errAuth
			}
			shopResponse(w, nil, err)
			return
		}
		window := strconv.FormatInt(time.Now().Unix()/60+1, 10)
		key := sha256.Sum256([]byte(path + ":" + subject + ":" + window))
		allowed, err := a.store.allow(r.Context(), hex.EncodeToString(key[:]), 30)
		if err != nil {
			shopResponse(w, nil, err)
			return
		}
		if !allowed {
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		var result any
		switch path {
		case "summary":
			var wallet any
			wallet, err = a.wallet.Summary(r.Context(), subject)
			result = map[string]any{"account_id": subject, "wallet": wallet}
		case "history/orders":
			result, err = a.store.orderPage(r.Context(), subject, q.Get("cursor"), 20)
		case "history/activity":
			result, err = a.wallet.History(r.Context(), subject, q.Get("cursor"), 20)
		}
		shopResponse(w, result, err)
	}), nil
}
