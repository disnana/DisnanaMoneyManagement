package credits

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gocql/gocql"
)

type Wallet struct{ session *gocql.Session }

func OpenFromEnv() (*Wallet, error) {
	hosts := strings.FieldsFunc(os.Getenv("MANE_SCYLLA_HOSTS"), func(r rune) bool { return r == ',' })
	if len(hosts) == 0 {
		return nil, errors.New("MANE_SCYLLA_HOSTS is required")
	}
	for i, host := range hosts {
		hosts[i] = strings.TrimSpace(host)
		if hosts[i] == "" {
			return nil, errors.New("invalid Scylla host")
		}
	}
	keyspace, dc := os.Getenv("MANE_SCYLLA_KEYSPACE"), os.Getenv("MANE_SCYLLA_DATACENTER")
	if keyspace == "" || dc == "" {
		return nil, errors.New("MANE_SCYLLA_KEYSPACE and MANE_SCYLLA_DATACENTER are required")
	}
	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = keyspace
	cluster.Consistency = gocql.LocalQuorum
	cluster.SerialConsistency = gocql.LocalSerial
	cluster.Timeout = 3 * time.Second
	cluster.ConnectTimeout = 3 * time.Second
	cluster.PoolConfig.HostSelectionPolicy = gocql.TokenAwareHostPolicy(gocql.DCAwareRoundRobinPolicy(dc))
	user, password := os.Getenv("MANE_SCYLLA_USER"), os.Getenv("MANE_SCYLLA_PASSWORD")
	if (user == "") != (password == "") {
		return nil, errors.New("MANE_SCYLLA_USER and MANE_SCYLLA_PASSWORD must be configured together")
	}
	if user != "" {
		cluster.Authenticator = gocql.PasswordAuthenticator{Username: user, Password: password}
	}
	if ca := os.Getenv("MANE_SCYLLA_CA_FILE"); ca != "" {
		cluster.SslOpts = &gocql.SslOptions{CaPath: ca, EnableHostVerification: true}
	}
	session, err := cluster.CreateSession()
	if err != nil {
		return nil, fmt.Errorf("connect to Scylla: %w", err)
	}
	if err := session.Query("SELECT revision FROM credit_wallet_entries WHERE subject = ? AND entry = 'wallet'", "schema-check").Iter().Close(); err != nil {
		session.Close()
		return nil, fmt.Errorf("check credit_wallet_entries schema: %w", err)
	}
	return &Wallet{session}, nil
}

func (w *Wallet) Close() { w.session.Close() }

func (w *Wallet) read(ctx context.Context, subject string) (int64, []lot, error) {
	var revision int64
	var data string
	err := w.session.Query("SELECT revision, lots FROM credit_wallet_entries WHERE subject = ? AND entry = 'wallet'", subject).WithContext(ctx).Scan(&revision, &data)
	if err != nil {
		return 0, nil, err
	}
	var lots []lot
	if err := json.Unmarshal([]byte(data), &lots); err != nil || lots == nil {
		return 0, nil, errors.New("invalid stored credit wallet")
	}
	return revision, lots, nil
}

func (w *Wallet) Balance(ctx context.Context, subject string) (int64, error) {
	_, lots, err := w.read(ctx, subject)
	if errors.Is(err, gocql.ErrNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return activeBalance(lots, time.Now().UnixMilli())
}

func (w *Wallet) Grant(ctx context.Context, subject, id string, amount int64, expires time.Time) error {
	return w.grant(ctx, subject, id, amount, expires, "")
}

func (w *Wallet) GrantPurchase(ctx context.Context, subject, order string, amount int64, expires time.Time) error {
	return w.grant(ctx, subject, "stripe-grant:"+order, amount, expires, order)
}

func (w *Wallet) ReversePurchase(ctx context.Context, subject, order string) error {
	if order == "" {
		return errors.New("missing credit order")
	}
	return w.mutate(ctx, subject, "stripe-reverse:"+order, operation{Kind: "reverse", Source: order})
}

func (w *Wallet) grant(ctx context.Context, subject, id string, amount int64, expires time.Time, source string) error {
	op := operation{Kind: "grant", Amount: amount, Source: source}
	if !expires.IsZero() {
		op.Expires = expires.UnixMilli()
		if op.Expires <= 0 {
			return errors.New("invalid credit expiration")
		}
	}
	return w.mutate(ctx, subject, id, op)
}

func (w *Wallet) Spend(ctx context.Context, subject, id string, amount int64) error {
	return w.mutate(ctx, subject, id, operation{Kind: "spend", Amount: amount})
}

func (w *Wallet) mutate(ctx context.Context, subject, id string, op operation) error {
	if subject == "" || len(subject) > 256 || id == "" || len(id) > 128 ||
		(op.Kind != "reverse" && (op.Amount <= 0 || op.Amount > maxBalance)) {
		return errors.New("invalid credit operation")
	}
	journalKey := "op:" + id
	encoded, _ := json.Marshal(op)
	for range 8 {
		revision, lots, err := w.read(ctx, subject)
		missing := errors.Is(err, gocql.ErrNotFound)
		if err != nil && !missing {
			return err
		}
		var prior string
		err = w.session.Query("SELECT operation FROM credit_wallet_entries WHERE subject = ? AND entry = ?", subject, journalKey).WithContext(ctx).Scan(&prior)
		switch {
		case err == nil:
			if prior != string(encoded) {
				return ErrOperationConflict
			}
			return nil
		case !errors.Is(err, gocql.ErrNotFound):
			return err
		}
		if op.Kind == "grant" && op.Source != "" {
			err := w.session.Query("SELECT operation FROM credit_wallet_entries WHERE subject = ? AND entry = ?", subject, "op:stripe-reverse:"+op.Source).WithContext(ctx).Scan(&prior)
			if err == nil {
				return ErrPurchaseReversed
			}
			if !errors.Is(err, gocql.ErrNotFound) {
				return err
			}
		}
		if missing && op.Kind == "spend" {
			return ErrInsufficient
		}
		at := time.Now()
		next, err := apply(lots, op, at)
		if err != nil {
			return err
		}
		value, _ := json.Marshal(next)
		batch := w.session.NewBatch(gocql.LoggedBatch).WithContext(ctx).SerialConsistency(gocql.LocalSerial)
		if missing {
			batch.Query("INSERT INTO credit_wallet_entries (subject, entry, revision, lots) VALUES (?, 'wallet', 1, ?) IF NOT EXISTS", subject, string(value))
		} else {
			batch.Query("UPDATE credit_wallet_entries SET revision = ?, lots = ? WHERE subject = ? AND entry = 'wallet' IF revision = ?", revision+1, string(value), subject, revision)
		}
		batch.Query("INSERT INTO credit_wallet_entries (subject, entry, operation) VALUES (?, ?, ?) IF NOT EXISTS", subject, journalKey, string(encoded))
		record := historyEntry{Operation: op, ID: id, At: at.UnixMilli()}
		if op.Kind == "reverse" {
			before, _ := activeBalance(lots, record.At)
			after, _ := activeBalance(next, record.At)
			record.Operation.Amount = before - after
		}
		history, _ := json.Marshal(record)
		batch.Query("INSERT INTO credit_wallet_entries (subject, entry, operation) VALUES (?, ?, ?)",
			subject, fmt.Sprintf("history:%019d:%s", record.At, id), string(history))
		applied, rows, err := w.session.MapExecuteBatchCAS(batch, make(map[string]interface{}))
		if rows != nil {
			err = errors.Join(err, rows.Close())
		}
		if err != nil {
			return fmt.Errorf("credit write result uncertain; reuse the same operation ID: %w", err)
		}
		if applied {
			return nil
		}
	}
	return errors.New("credit write contention; reuse the same operation ID")
}

type historyEntry struct {
	ID        string    `json:"id"`
	At        int64     `json:"at_ms"`
	Operation operation `json:"operation"`
}

type Snapshot struct {
	Balance int64          `json:"available_credits"`
	Lots    []lot          `json:"lots"`
	History []historyEntry `json:"history"`
}

func (w *Wallet) Snapshot(ctx context.Context, subject string) (Snapshot, error) {
	snapshot := Snapshot{Lots: []lot{}, History: []historyEntry{}}
	_, lots, err := w.read(ctx, subject)
	if errors.Is(err, gocql.ErrNotFound) {
		return snapshot, nil
	}
	if err != nil {
		return Snapshot{}, err
	}
	now := time.Now().UnixMilli()
	snapshot.Balance, err = activeBalance(lots, now)
	if err != nil {
		return Snapshot{}, err
	}
	for _, item := range lots {
		if item.Expires == 0 || item.Expires > now {
			snapshot.Lots = append(snapshot.Lots, item)
		}
	}
	rows := w.session.Query("SELECT operation FROM credit_wallet_entries WHERE subject = ? AND entry >= 'history:' AND entry < 'history;' ORDER BY entry DESC LIMIT 50", subject).WithContext(ctx).Iter()
	var data string
	for rows.Scan(&data) {
		var entry historyEntry
		if err := json.Unmarshal([]byte(data), &entry); err != nil {
			_ = rows.Close()
			return Snapshot{}, err
		}
		snapshot.History = append(snapshot.History, entry)
	}
	return snapshot, rows.Close()
}
