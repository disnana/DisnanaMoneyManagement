package webshop

import (
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/gocql/gocql"
)

var (
	errConflict   = errors.New("conflicting shop operation")
	errContention = errors.New("shop write contention")
)

type order struct {
	ID          string `json:"id"`
	Subject     string `json:"subject"`
	Pack        string `json:"pack"`
	Title       string `json:"title"`
	Amount      int64  `json:"amount"`
	Credits     int64  `json:"credits"`
	Validity    *int64 `json:"validity_seconds"`
	Created     int64  `json:"created_at"`
	Status      string `json:"status"`
	Session     string `json:"stripe_session,omitempty"`
	CheckoutURL string `json:"checkout_url,omitempty"`
	Intent      string `json:"payment_intent,omitempty"`
	Receipt     string `json:"receipt_url,omitempty"`
	Refunded    int64  `json:"amount_refunded"`
	Expires     int64  `json:"expires_at_ms"`
}

type store struct{ db *gocql.Session }

func (s store) query(ctx context.Context, cql string, arguments ...any) *gocql.Query {
	return s.db.Query(cql, arguments...).WithContext(ctx)
}

func cas(q *gocql.Query) (bool, error) {
	return q.SerialConsistency(gocql.LocalSerial).MapScanCAS(map[string]any{})
}

func (s store) owner(ctx context.Context, id string) (subject string, created int64, err error) {
	err = s.query(ctx, "SELECT subject, created_at FROM shop_order_owners WHERE id = ?", id).Scan(&subject, &created)
	return
}

func (s store) create(ctx context.Context, o order) (order, error) {
	if _, err := cas(s.query(ctx, "INSERT INTO shop_order_owners (id, subject, created_at) VALUES (?, ?, ?) IF NOT EXISTS", o.ID, o.Subject, o.Created)); err != nil {
		return order{}, err
	}
	owner, created, err := s.owner(ctx, o.ID)
	if err != nil {
		return order{}, err
	}
	if owner != o.Subject {
		return order{}, errConflict
	}
	o.Created, o.Status = created, "pending"
	payload, _ := json.Marshal(o)
	if _, err := cas(s.query(ctx, "INSERT INTO shop_orders (subject, created_at, id, revision, payload) VALUES (?, ?, ?, 1, ?) IF NOT EXISTS",
		owner, created, o.ID, string(payload))); err != nil {
		return order{}, err
	}
	existing, _, err := s.read(ctx, o.ID)
	if err == nil && existing.Pack != o.Pack {
		return order{}, errConflict
	}
	return existing, err
}

func (s store) read(ctx context.Context, id string) (order, int64, error) {
	subject, created, err := s.owner(ctx, id)
	if err != nil {
		return order{}, 0, err
	}
	var o order
	var revision int64
	var payload string
	err = s.query(ctx, "SELECT revision, payload FROM shop_orders WHERE subject = ? AND created_at = ? AND id = ?", subject, created, id).Scan(&revision, &payload)
	if err != nil {
		return order{}, 0, err
	}
	err = json.Unmarshal([]byte(payload), &o)
	return o, revision, err
}

func (s store) list(ctx context.Context, subject string) ([]order, error) {
	page, err := s.orderPage(ctx, subject, "", 50)
	return page.Items, err
}

type orderPage struct {
	Items      []order `json:"items"`
	NextCursor string  `json:"next_cursor,omitempty"`
}

func (s store) orderPage(ctx context.Context, subject, cursor string, limit int) (orderPage, error) {
	const query = "SELECT created_at, id, payload FROM shop_orders WHERE subject = ?"
	stmt := query + " LIMIT ?"
	args := []any{subject, limit + 1}
	if cursor != "" {
		stamp, id, _ := strings.Cut(cursor, ":")
		created, err := strconv.ParseInt(stamp, 10, 64)
		if err != nil || created < 0 || !orderID.MatchString(id) {
			return orderPage{}, errBad
		}
		stmt = query + " AND (created_at, id) < (?, ?) LIMIT ?"
		args = []any{subject, created, id, limit + 1}
	}
	iter := s.query(ctx, stmt, args...).Iter()
	page := orderPage{Items: []order{}}
	var created int64
	var id, payload, lastCursor string
	for iter.Scan(&created, &id, &payload) {
		if len(page.Items) == limit {
			page.NextCursor = lastCursor
			break
		}
		var o order
		if err := json.Unmarshal([]byte(payload), &o); err != nil {
			_ = iter.Close()
			return orderPage{}, err
		}
		o.Subject, o.Session, o.CheckoutURL, o.Intent = "", "", "", ""
		page.Items = append(page.Items, o)
		lastCursor = strconv.FormatInt(created, 10) + ":" + id
	}
	return page, iter.Close()
}

func (s store) update(ctx context.Context, id string, change func(*order) (bool, error)) (order, error) {
	for range 6 {
		o, revision, err := s.read(ctx, id)
		if err != nil {
			return order{}, err
		}
		changed, err := change(&o)
		if err != nil || !changed {
			return o, err
		}
		payload, _ := json.Marshal(o)
		ok, err := cas(s.query(ctx, "UPDATE shop_orders SET revision = ?, payload = ? WHERE subject = ? AND created_at = ? AND id = ? IF revision = ?",
			revision+1, string(payload), o.Subject, o.Created, id, revision))
		if err != nil {
			return order{}, err
		}
		if ok {
			return o, nil
		}
	}
	return order{}, errContention
}

func (s store) allow(ctx context.Context, id string, limit int) (bool, error) {
	for range 6 {
		var hits int
		err := s.query(ctx, "SELECT hits FROM shop_rate_windows WHERE id = ?", id).Scan(&hits)
		if errors.Is(err, gocql.ErrNotFound) {
			ok, err := cas(s.query(ctx, "INSERT INTO shop_rate_windows (id, hits) VALUES (?, 1) IF NOT EXISTS", id))
			if err != nil || ok {
				return ok, err
			}
			continue
		}
		if err != nil || hits >= limit {
			return false, err
		}
		ok, err := cas(s.query(ctx, "UPDATE shop_rate_windows SET hits = ? WHERE id = ? IF hits = ?", hits+1, id, hits))
		if err != nil || ok {
			return ok, err
		}
	}
	return false, errContention
}
