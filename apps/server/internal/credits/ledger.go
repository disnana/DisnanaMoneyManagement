package credits

import (
	"errors"
	"sort"
	"time"
)

const maxBalance = 1<<53 - 1

var (
	ErrInsufficient      = errors.New("insufficient credits")
	ErrOperationConflict = errors.New("credit operation ID already used for different parameters")
	ErrPurchaseReversed  = errors.New("purchase has been reversed")
)

type lot struct {
	Amount  int64  `json:"amount"`
	Expires int64  `json:"expires_at_ms,omitempty"`
	Source  string `json:"source,omitempty"`
}

type operation struct {
	Kind        string `json:"kind"`
	Amount      int64  `json:"amount"`
	Expires     int64  `json:"expires_at_ms,omitempty"`
	Source      string `json:"source,omitempty"`
	ExpiredLots []lot  `json:"expired_lots,omitempty"`
}

func activeBalance(lots []lot, now int64) (int64, error) {
	var balance int64
	for _, lot := range lots {
		if lot.Amount <= 0 || lot.Expires < 0 {
			return 0, errors.New("invalid credit lot")
		}
		if lot.Expires == 0 || lot.Expires > now {
			if lot.Amount > maxBalance-balance {
				return 0, errors.New("credit balance exceeds limit")
			}
			balance += lot.Amount
		}
	}
	return balance, nil
}

func apply(lots []lot, op operation, at time.Time) ([]lot, error) {
	now := at.UnixMilli()
	balance, err := activeBalance(lots, now)
	if err != nil {
		return nil, err
	}
	active := unexpiredLots(lots, now)
	switch op.Kind {
	case "grant":
		if op.Expires != 0 && op.Expires <= now {
			if op.Source != "" {
				// A verified payment can arrive after the credits have already expired.
				return active, nil
			}
			return nil, errors.New("credit expiration must be in the future")
		}
		if op.Amount > maxBalance-balance {
			return nil, errors.New("credit balance exceeds limit")
		}
		return mergeLot(active, lot{Amount: op.Amount, Expires: op.Expires, Source: op.Source}), nil
	case "reverse":
		result := active[:0]
		for _, lot := range active {
			if lot.Source != op.Source {
				result = append(result, lot)
			}
		}
		return result, nil
	case "spend":
		if op.Amount > balance {
			return nil, ErrInsufficient
		}
		next, _ := debitLots(active, op.Amount, false)
		return next, nil
	default:
		return nil, errors.New("unknown credit operation")
	}
}

// debitLots preserves each debited lot's original purchase source and expiration.
func debitLots(active []lot, amount int64, hold bool) ([]lot, []lot) {
	sort.Slice(active, func(i, j int) bool {
		a, b := active[i].Expires, active[j].Expires
		return a != 0 && (b == 0 || a < b)
	})
	remaining := active[:0]
	var debited []lot
	for _, item := range active {
		if debit := min(amount, item.Amount); debit > 0 {
			if hold {
				debited = append(debited, lot{Amount: debit, Expires: item.Expires, Source: item.Source})
			}
			amount -= debit
			item.Amount -= debit
		}
		if item.Amount > 0 {
			remaining = append(remaining, item)
		}
	}
	return remaining, debited
}

func mergeLot(lots []lot, incoming lot) []lot {
	for i := range lots {
		if lots[i].Expires == incoming.Expires && lots[i].Source == incoming.Source {
			lots[i].Amount += incoming.Amount
			return lots
		}
	}
	return append(lots, incoming)
}

func unexpiredLots(lots []lot, now int64) []lot {
	active := make([]lot, 0, len(lots))
	for _, item := range lots {
		if item.Expires == 0 || item.Expires > now {
			active = append(active, item)
		}
	}
	return active
}

// expiredAvailableLots only uses what remained in the spendable wallet before
// expiration. A previously consumed, reserved or reversed lot is not present.
func expiredAvailableLots(lots []lot, now int64) []lot {
	expired := []lot{}
	for _, item := range lots {
		if item.Expires > 0 && item.Expires <= now {
			expired = append(expired, item)
		}
	}
	return expired
}

func expirationOperation(lots []lot, now int64) (operation, error) {
	expired := expiredAvailableLots(lots, now)
	amount, err := activeBalance(expired, 0)
	return operation{Kind: "expire", Amount: amount, ExpiredLots: expired}, err
}
