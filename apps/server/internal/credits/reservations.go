package credits

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/gocql/gocql"
)

var (
	ErrReservationNotFound = errors.New("credit reservation not found")
	ErrReservationCanceled = errors.New("credit reservation canceled")
)

type reservation struct {
	Amount   int64  `json:"amount"`
	Lots     []lot  `json:"lots"`
	Used     *int64 `json:"used,omitempty"`
	Canceled bool   `json:"canceled,omitempty"`
}

func (r reservation) valid() bool {
	if r.Canceled && r.Amount == 0 {
		return len(r.Lots) == 0 && r.Used == nil
	}
	if r.Canceled && (r.Used == nil || *r.Used != 0) {
		return false
	}
	sum, err := activeBalance(r.Lots, 0)
	return err == nil && r.Amount > 0 && r.Amount == sum &&
		(r.Used == nil || (*r.Used >= 0 && *r.Used <= r.Amount))
}

func validReservation(subject, id string) bool {
	return subject != "" && len(subject) <= 256 && id != "" && len(id) <= 128
}

func (w *Wallet) readReservation(ctx context.Context, subject, key string) (reservation, string, error) {
	var record reservation
	var data string
	if err := w.session.Query("SELECT operation FROM credit_wallet_entries WHERE subject = ? AND entry = ?", subject, key).WithContext(ctx).Scan(&data); err != nil {
		return record, "", err
	}
	if err := json.Unmarshal([]byte(data), &record); err != nil || !record.valid() {
		return record, "", errors.New("invalid stored credit reservation")
	}
	return record, data, nil
}

func insertReservation(batch *gocql.Batch, subject, key string, record reservation) {
	data, _ := json.Marshal(record)
	batch.Query("INSERT INTO credit_wallet_entries (subject, entry, operation) VALUES (?, ?, ?) IF NOT EXISTS",
		subject, key, string(data))
}

// Reserve holds credits in their original spending order under a durable operation ID.
func (w *Wallet) Reserve(ctx context.Context, subject, id string, amount int64) error {
	if !validReservation(subject, id) || amount <= 0 || amount > maxBalance {
		return errors.New("invalid credit reservation")
	}
	key := "reservation:" + id
	for range 8 {
		prior, _, err := w.readReservation(ctx, subject, key)
		switch {
		case err == nil:
			if prior.Canceled {
				return ErrReservationCanceled
			}
			if prior.Amount != amount {
				return ErrOperationConflict
			}
			return nil
		case !errors.Is(err, gocql.ErrNotFound):
			return err
		}
		revision, lots, err := w.read(ctx, subject)
		if errors.Is(err, gocql.ErrNotFound) {
			return ErrInsufficient
		}
		if err != nil {
			return err
		}
		now := time.Now().UnixMilli()
		balance, err := activeBalance(lots, now)
		if err != nil {
			return err
		}
		if amount > balance {
			return ErrInsufficient
		}
		next, held := debitLots(unexpiredLots(lots, now), amount, true)
		batch, err := w.walletBatch(ctx, subject, revision, false, lots, next, now)
		if err != nil {
			return err
		}
		insertReservation(batch, subject, key, reservation{Amount: amount, Lots: held})
		applied, err := w.commitBatch(batch)
		if err != nil || applied {
			return err
		}
	}
	return errors.New("credit write contention; reuse the same operation ID")
}

// Settle consumes used credits and restores the remaining eligible held credits once.
func (w *Wallet) Settle(ctx context.Context, subject, id string, used int64) error {
	return w.settleReservation(ctx, subject, id, used, false)
}

// AbortReservation releases an unsettled hold and permanently cancels its ID.
// An ID that has never held credits is canceled without creating a wallet.
func (w *Wallet) AbortReservation(ctx context.Context, subject, id string) error {
	return w.settleReservation(ctx, subject, id, 0, true)
}

func (w *Wallet) settleReservation(ctx context.Context, subject, id string, used int64, abort bool) error {
	if !validReservation(subject, id) || used < 0 || used > maxBalance {
		return errors.New("invalid credit settlement")
	}
	key := "reservation:" + id
	for range 8 {
		record, prior, err := w.readReservation(ctx, subject, key)
		if errors.Is(err, gocql.ErrNotFound) {
			if !abort {
				return ErrReservationNotFound
			}
			// Reserve conditionally inserts the same row, so at most one wins. If it
			// wins, read its hold in the next iteration and release it atomically.
			batch := w.session.NewBatch(gocql.LoggedBatch).WithContext(ctx).SerialConsistency(gocql.LocalSerial)
			insertReservation(batch, subject, key, reservation{Canceled: true})
			applied, err := w.commitBatch(batch)
			if err != nil || applied {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}
		if used > record.Amount || (record.Used != nil && *record.Used != used) {
			return ErrOperationConflict
		}
		if record.Canceled || (record.Used != nil && !abort) {
			return nil
		}

		revision, lots, err := w.read(ctx, subject)
		if err != nil {
			return err
		}
		at := time.Now().UnixMilli()
		var next []lot
		if record.Used == nil {
			next, err = restoreReservedLots(lots, record.Lots, used, at, func(source string) (bool, error) {
				var operation string
				err := w.session.Query("SELECT operation FROM credit_wallet_entries WHERE subject = ? AND entry = ?", subject,
					"op:stripe-reverse:"+source).WithContext(ctx).Scan(&operation)
				if errors.Is(err, gocql.ErrNotFound) {
					return false, nil
				}
				return err == nil, err
			})
			if err != nil {
				return err
			}
			record.Used = &used
		} else {
			next = unexpiredLots(lots, at)
		}
		record.Canceled = abort
		data, _ := json.Marshal(record)
		batch, err := w.walletBatch(ctx, subject, revision, false, lots, next, at)
		if err != nil {
			return err
		}
		// Reversals also advance the wallet revision in the same atomic batch as their journal.
		// A concurrent reversal either invalidates this read or removes a lot we just restored.
		batch.Query("UPDATE credit_wallet_entries SET operation = ? WHERE subject = ? AND entry = ? IF operation = ?",
			string(data), subject, key, prior)
		if used > 0 {
			digest := sha256.Sum256([]byte(id))
			historyID := "receipt:" + hex.EncodeToString(digest[:])
			addHistory(batch, subject, historyID, historyEntry{ID: id, At: at, Operation: operation{Kind: "spend", Amount: used}})
		}
		applied, err := w.commitBatch(batch)
		if err != nil || applied {
			return err
		}
	}
	return errors.New("credit write contention; reuse the same operation ID")
}

func restoreReservedLots(lots, held []lot, used, now int64, reversed func(string) (bool, error)) ([]lot, error) {
	if _, err := activeBalance(lots, now); err != nil {
		return nil, err
	}
	next := unexpiredLots(lots, now)
	refunds := make(map[string]bool)
	for _, item := range held {
		spent := min(used, item.Amount)
		used -= spent
		item.Amount -= spent
		if item.Amount == 0 || (item.Expires != 0 && item.Expires <= now) {
			continue
		}
		if item.Source != "" {
			refunded, checked := refunds[item.Source]
			if !checked {
				var err error
				refunded, err = reversed(item.Source)
				if err != nil {
					return nil, err
				}
				refunds[item.Source] = refunded
			}
			if refunded {
				continue
			}
		}
		next = mergeLot(next, item)
	}
	if _, err := activeBalance(next, now); err != nil {
		return nil, err
	}
	return next, nil
}
