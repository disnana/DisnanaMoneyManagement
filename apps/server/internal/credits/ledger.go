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
	Kind    string `json:"kind"`
	Amount  int64  `json:"amount"`
	Expires int64  `json:"expires_at_ms,omitempty"`
	Source  string `json:"source,omitempty"`
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
	active := make([]lot, 0, len(lots)+1)
	for _, lot := range lots {
		if lot.Expires == 0 || lot.Expires > now {
			active = append(active, lot)
		}
	}
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
		for i := range active {
			if active[i].Expires == op.Expires && active[i].Source == op.Source {
				active[i].Amount += op.Amount
				return active, nil
			}
		}
		return append(active, lot{Amount: op.Amount, Expires: op.Expires, Source: op.Source}), nil
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
		sort.Slice(active, func(i, j int) bool {
			a, b := active[i].Expires, active[j].Expires
			return a != 0 && (b == 0 || a < b)
		})
		remaining := op.Amount
		result := active[:0]
		for _, lot := range active {
			debit := min(remaining, lot.Amount)
			remaining -= debit
			lot.Amount -= debit
			if lot.Amount > 0 {
				result = append(result, lot)
			}
		}
		return result, nil
	default:
		return nil, errors.New("unknown credit operation")
	}
}
