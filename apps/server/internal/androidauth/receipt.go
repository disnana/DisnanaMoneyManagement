package androidauth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/disnana/dmm/server/internal/receiptai"
)

const receiptConfigPath = "/v1/ai/receipt-config"
const receiptJobsPrefix = "/v1/ai/receipt-jobs/"
const receiptProofTTL = 60 * time.Second

type ReceiptAPI interface {
	Config() receiptai.ConfigView
	Submit(context.Context, receiptai.JobKey, int64, string, []byte) (receiptai.JobView, error)
	Job(context.Context, receiptai.JobKey) (receiptai.JobView, error)
}

type receiptModeAPI interface {
	SubmitMode(context.Context, receiptai.JobKey, int64, string, string, []byte) (receiptai.JobView, error)
}

func receiptOperation(op operation) bool {
	if op.Method == http.MethodGet && op.BodySHA256 == digest(nil) && op.Path == receiptConfigPath {
		return true
	}
	id, ok := strings.CutPrefix(op.Path, receiptJobsPrefix)
	return ok && identifier.MatchString(id) && (op.Method == http.MethodPost ||
		(op.Method == http.MethodGet && op.BodySHA256 == digest(nil)))
}

func proofLifetime(op operation) time.Duration {
	if op.Method == http.MethodPost && receiptOperation(op) {
		return receiptProofTTL
	}
	return proofTTL
}

func (n *Node) receiptConfig(w http.ResponseWriter, r *http.Request) {
	s, err := n.access(r.Context(), bearer(r))
	if err != nil {
		rejectAuth(w, err)
		return
	}
	if !n.accept(r, nil, s) {
		reject(w, 401)
		return
	}
	jsonReply(w, 200, struct {
		receiptai.ConfigView
		IntakePaused bool `json:"intake_paused,omitempty"`
	}{n.cfg.Receipts.Config(), n.cfg.ReceiptIntakePaused})
}

type receiptSubmission struct {
	MaximumCredit int64           `json:"maximum_credit"`
	PriceVersion  string          `json:"price_version"`
	Mode          string          `json:"mode"`
	Request       json.RawMessage `json:"request"`
}

func (n *Node) receiptJob(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !identifier.MatchString(id) {
		receiptError(w, 400, "invalid_receipt_request")
		return
	}
	s, err := n.access(r.Context(), bearer(r))
	if err != nil {
		rejectAuth(w, err)
		return
	}
	key := receiptai.JobKey{Subject: s.subject, RequestID: id}
	if r.Method == http.MethodGet {
		if !n.accept(r, nil, s) {
			reject(w, 401)
			return
		}
		view, err := n.cfg.Receipts.Job(r.Context(), key)
		replyReceipt(w, 200, view, err)
		return
	}

	// Require the device proof before extending the upload deadline. After reading
	// the body, still verify that its digest matches the signed challenge.
	token := r.Header.Get("X-Mane-Challenge")
	challenge, err := n.proofs.open(token)
	remaining := time.UnixMilli(challenge.Issued).Add(receiptProofTTL).Sub(n.now())
	if err != nil || remaining <= 0 || remaining > receiptProofTTL || challenge.Binding != s.id ||
		challenge.Operation.Method != r.Method || challenge.Operation.Path != r.URL.Path ||
		challenge.ID != r.Header.Get("X-Mane-Request-Id") ||
		!verifyDevice(s.key, token, r.Header.Get("X-Mane-Device-Signature")) || !n.proofs.consume(challenge.ID) {
		reject(w, 401)
		return
	}
	control := http.NewResponseController(w)
	deadline := time.Now().Add(remaining)
	if err := control.SetReadDeadline(deadline); err != nil && !errors.Is(err, http.ErrNotSupported) {
		receiptError(w, 503, "receipt_unavailable")
		return
	}
	if err := control.SetWriteDeadline(deadline.Add(5 * time.Second)); err != nil && !errors.Is(err, http.ErrNotSupported) {
		receiptError(w, 503, "receipt_unavailable")
		return
	}
	raw, err := read(w, r, int64(n.cfg.Receipts.Config().MaxJSONBytes)+2048)
	if err != nil {
		receiptError(w, 400, "invalid_receipt_request")
		return
	}
	if challenge.Operation.BodySHA256 != digest(raw) {
		reject(w, 401)
		return
	}
	var input receiptSubmission
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if d.Decode(&input) != nil || d.Decode(new(any)) != io.EOF ||
		input.MaximumCredit < 1 || input.PriceVersion == "" || len(input.Request) == 0 {
		receiptError(w, 400, "invalid_receipt_request")
		return
	}
	if n.cfg.ReceiptIntakePaused {
		w.Header().Set("Retry-After", "60")
		receiptError(w, http.StatusServiceUnavailable, "receipt_intake_paused")
		return
	}
	switch input.Mode {
	case "", "standard":
		view, err := n.cfg.Receipts.Submit(r.Context(), key, input.MaximumCredit, input.PriceVersion, input.Request)
		replyReceipt(w, 202, view, err)
	case "background", "batch":
		modes, ok := n.cfg.Receipts.(receiptModeAPI)
		if !ok {
			replyReceipt(w, 202, receiptai.JobView{}, receiptai.ErrReceiptQuote)
			return
		}
		view, err := modes.SubmitMode(r.Context(), key, input.MaximumCredit, input.PriceVersion, input.Mode, input.Request)
		replyReceipt(w, 202, view, err)
	default:
		receiptError(w, 400, "invalid_receipt_request")
	}
}

func replyReceipt(w http.ResponseWriter, status int, view receiptai.JobView, err error) {
	switch {
	case err == nil:
		jsonReply(w, status, view)
	case errors.Is(err, credits.ErrInsufficient):
		receiptError(w, 402, "insufficient_credit")
	case errors.Is(err, receiptai.ErrReceiptQuote):
		receiptError(w, 409, "quote_changed")
	case errors.Is(err, receiptai.ErrJobConflict):
		receiptError(w, 409, "request_conflict")
	case errors.Is(err, receiptai.ErrReceiptInput):
		receiptError(w, 400, "invalid_receipt_request")
	case errors.Is(err, receiptai.ErrReceiptNotFound):
		receiptError(w, 404, "receipt_not_found")
	default:
		receiptError(w, 503, "receipt_unavailable")
	}
}

func receiptError(w http.ResponseWriter, status int, code string) {
	jsonReply(w, status, map[string]string{"error": code})
}
