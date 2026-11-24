package receiptai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const (
	LunaBackground2h = "background_2h"
	LunaBackground8h = "background_8h"
	LunaBatch24h     = "batch_24h"

	lunaFilesPath   = "/v1/files"
	lunaBatchesPath = "/v1/batches"
)

var ErrLunaPollRetry = errors.New("Luna job is not yet ready to retrieve or clean up")

// LunaDeferred submits one group under an explicitly configured deferred mode.
// The application journals the returned ProviderID before polling from any node.
type LunaDeferred struct {
	luna *Luna
	mode string
}

func NewLunaDeferred(luna *Luna, mode string) (*LunaDeferred, error) {
	if luna == nil {
		return nil, errors.New("deferred receipt analysis requires a Luna client")
	}
	switch mode {
	case LunaBackground2h, LunaBackground8h, LunaBatch24h:
		return &LunaDeferred{luna: luna, mode: mode}, nil
	default:
		return nil, errors.New("unsupported deferred receipt mode")
	}
}

func (d *LunaDeferred) Submit(ctx context.Context, group Group) (LunaResponse, error) {
	// A Batch has two POSTs. Both share a budget so the provider cannot accept
	// a new batch after the durable acknowledgement window has closed.
	ctx, cancel := context.WithTimeout(ctx, d.luna.config.Timeout)
	defer cancel()
	if d.mode == LunaBatch24h {
		return d.submitBatch(ctx, group)
	}
	// OpenAI retains store=false background requests temporarily for execution
	// and polling. Keeping store=false avoids requesting extended retention.
	window := strings.TrimPrefix(d.mode, "background_")
	body, err := d.luna.responseBody(group, window)
	if err != nil {
		return LunaResponse{}, err
	}
	startedAt := time.Now()
	raw, err := d.luna.post(ctx, lunaResponsePath, "application/json", body)
	if err != nil {
		return LunaResponse{}, err
	}
	return d.backgroundResult(raw, "", group, time.Since(startedAt))
}

func pendingLuna(id string) LunaResponse {
	return LunaResponse{ProviderID: id, Pending: true}
}

type lunaStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

func (d *LunaDeferred) backgroundResult(raw []byte, expectedID string, group Group, elapsed time.Duration) (LunaResponse, error) {
	var status lunaStatus
	if json.Unmarshal(raw, &status) != nil || !validLunaResponseID(status.ID) {
		if expectedID == "" {
			return LunaResponse{}, ErrLunaSubmissionUnknown
		}
		return pendingLuna(expectedID), ErrLunaPollRetry
	}
	if expectedID != "" && expectedID != status.ID {
		return pendingLuna(expectedID), ErrLunaPollRetry
	}
	switch status.Status {
	case "queued", "in_progress":
		return pendingLuna(status.ID), nil
	case "completed":
		result, err := d.luna.decodeResponse(raw, group, elapsed)
		if result.ProviderID == "" {
			return LunaResponse{ProviderID: status.ID}, ErrLunaResultUnavailable
		}
		return result, err
	case "failed", "cancelled", "incomplete":
		return LunaResponse{ProviderID: status.ID}, ErrLunaResultUnavailable
	default:
		return pendingLuna(status.ID), ErrLunaPollRetry
	}
}

// Poll accepts persisted image IDs and the digest of the original group. The
// original image bytes are only required for Submit.
func (d *LunaDeferred) Poll(ctx context.Context, id string, group Group, inputDigest string) (LunaResponse, error) {
	ctx, cancel := context.WithTimeout(ctx, d.luna.config.Timeout)
	defer cancel()
	if d.mode == LunaBatch24h {
		return d.pollBatch(ctx, id, group, inputDigest)
	}
	if !validLunaResponseID(id) {
		return LunaResponse{}, ErrLunaResultUnavailable
	}
	startedAt := time.Now()
	raw, status, err := d.luna.request(ctx, http.MethodGet, lunaResponsePath+"/"+id, "", nil)
	if err != nil || status != http.StatusOK {
		return pendingLuna(id), ErrLunaPollRetry
	}
	return d.backgroundResult(raw, id, group, time.Since(startedAt))
}

func validLunaResponseID(id string) bool {
	return strings.HasPrefix(id, "resp_") && len(id) > len("resp_") && providerID.MatchString(id)
}

func validLunaBatchID(id string) bool {
	return strings.HasPrefix(id, "batch_") && len(id) > len("batch_") && providerID.MatchString(id)
}

func validLunaFileID(id string) bool {
	return (strings.HasPrefix(id, "file-") || strings.HasPrefix(id, "file_")) && len(id) > len("file-") && providerID.MatchString(id)
}

type lunaBatch struct {
	lunaStatus
	Endpoint         string `json:"endpoint"`
	CompletionWindow string `json:"completion_window"`
	InputFileID      string `json:"input_file_id"`
	OutputFileID     string `json:"output_file_id"`
	ErrorFileID      string `json:"error_file_id"`
}

func readLunaBatch(raw []byte) (lunaBatch, bool) {
	var batch lunaBatch
	ok := json.Unmarshal(raw, &batch) == nil && validLunaBatchID(batch.ID) &&
		batch.Endpoint == lunaResponsePath && batch.CompletionWindow == "24h" && validLunaFileID(batch.InputFileID) &&
		(batch.OutputFileID == "" || validLunaFileID(batch.OutputFileID)) &&
		(batch.ErrorFileID == "" || validLunaFileID(batch.ErrorFileID))
	return batch, ok
}

func (d *LunaDeferred) submitBatch(ctx context.Context, group Group) (LunaResponse, error) {
	body, err := d.luna.responseBody(group, "")
	if err != nil {
		return LunaResponse{}, err
	}
	customID, err := groupDigest(group)
	if err != nil {
		return LunaResponse{}, ErrLunaBeforeSend
	}
	// One JSONL row and one batch per group. Unrelated users never share files.
	line, err := json.Marshal(struct {
		CustomID string          `json:"custom_id"`
		Method   string          `json:"method"`
		URL      string          `json:"url"`
		Body     json.RawMessage `json:"body"`
	}{customID, http.MethodPost, lunaResponsePath, body})
	if err != nil || len(line) >= d.luna.config.MaxRequestBytes || len(line) >= 200_000_000 {
		return LunaResponse{}, ErrLunaBeforeSend
	}
	var upload bytes.Buffer
	form := multipart.NewWriter(&upload)
	for _, field := range [][2]string{{"purpose", "batch"}, {"expires_after[anchor]", "created_at"}, {"expires_after[seconds]", "93600"}} {
		if err := form.WriteField(field[0], field[1]); err != nil {
			return LunaResponse{}, ErrLunaBeforeSend
		}
	}
	input, err := form.CreateFormFile("file", "receipt.jsonl")
	if err != nil {
		return LunaResponse{}, ErrLunaBeforeSend
	}
	if _, err := input.Write(append(line, '\n')); err != nil {
		return LunaResponse{}, ErrLunaBeforeSend
	}
	if form.Close() != nil || upload.Len() > d.luna.config.MaxRequestBytes {
		return LunaResponse{}, ErrLunaBeforeSend
	}
	raw, err := d.luna.post(ctx, lunaFilesPath, form.FormDataContentType(), upload.Bytes())
	if err != nil {
		return LunaResponse{}, err
	}
	var file struct {
		ID      string `json:"id"`
		Purpose string `json:"purpose"`
	}
	if json.Unmarshal(raw, &file) != nil || !validLunaFileID(file.ID) || file.Purpose != "batch" {
		return LunaResponse{}, ErrLunaSubmissionUnknown
	}

	// The upload is retained for 26 hours, enough for the 24-hour batch.
	// Output/error files expire one hour after creation if explicit cleanup fails.
	create, _ := json.Marshal(map[string]any{
		"input_file_id": file.ID, "endpoint": lunaResponsePath, "completion_window": "24h",
		"output_expires_after": map[string]any{"anchor": "created_at", "seconds": 3600},
	})
	raw, err = d.luna.post(ctx, lunaBatchesPath, "application/json", create)
	if err != nil {
		if errors.Is(err, ErrLunaBeforeSend) || errors.Is(err, ErrLunaRejected) {
			// No batch was created. Delete its file within the submission budget
			// when time remains. The input TTL also covers an expired context.
			_ = d.deleteArtifact(ctx, lunaFilesPath, file.ID)
		}
		// If the batch might have been created, leave the input accessible until
		// expiry. The runtime must never create another batch for this attempt.
		return LunaResponse{}, err
	}
	batch, ok := readLunaBatch(raw)
	if !ok || batch.InputFileID != file.ID {
		return LunaResponse{}, ErrLunaSubmissionUnknown
	}
	return pendingLuna(batch.ID), nil
}

func (d *LunaDeferred) batchState(ctx context.Context, id string) (lunaBatch, bool, error) {
	if !validLunaBatchID(id) {
		return lunaBatch{}, false, ErrLunaResultUnavailable
	}
	raw, status, err := d.luna.request(ctx, http.MethodGet, lunaBatchesPath+"/"+id, "", nil)
	if status == http.StatusNotFound {
		return lunaBatch{}, false, nil
	}
	if err != nil || status != http.StatusOK {
		return lunaBatch{}, false, ErrLunaPollRetry
	}
	batch, ok := readLunaBatch(raw)
	if !ok || batch.ID != id {
		return lunaBatch{}, false, ErrLunaPollRetry
	}
	return batch, true, nil
}

func (d *LunaDeferred) pollBatch(ctx context.Context, id string, group Group, inputDigest string) (LunaResponse, error) {
	if !validLunaBatchID(id) || !resultDigest.MatchString(inputDigest) {
		return LunaResponse{}, ErrLunaResultUnavailable
	}
	startedAt := time.Now()
	batch, found, err := d.batchState(ctx, id)
	if err != nil || !found {
		return pendingLuna(id), ErrLunaPollRetry
	}
	switch batch.Status {
	case "validating", "in_progress", "finalizing", "cancelling":
		return pendingLuna(id), nil
	case "failed", "expired", "cancelled":
		return LunaResponse{ProviderID: id}, ErrLunaResultUnavailable
	case "completed":
	default:
		return pendingLuna(id), ErrLunaPollRetry
	}
	if batch.OutputFileID == "" {
		return LunaResponse{ProviderID: id}, ErrLunaResultUnavailable
	}
	raw, code, err := d.luna.request(ctx, http.MethodGet, lunaFilesPath+"/"+batch.OutputFileID+"/content", "", nil)
	if err != nil || code != http.StatusOK {
		return pendingLuna(id), ErrLunaPollRetry
	}
	var line struct {
		CustomID string `json:"custom_id"`
		Response struct {
			StatusCode int             `json:"status_code"`
			Body       json.RawMessage `json:"body"`
		} `json:"response"`
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(raw, &line) != nil || line.CustomID != inputDigest || line.Response.StatusCode != http.StatusOK ||
		(len(line.Error) > 0 && !bytes.Equal(line.Error, []byte("null"))) {
		return LunaResponse{ProviderID: id}, ErrLunaResultUnavailable
	}
	result, err := d.luna.decodeResponse(line.Response.Body, group, time.Since(startedAt))
	result.ProviderID = id // The Batch ID is the durable recovery identifier.
	if err != nil {
		return result, ErrLunaResultUnavailable
	}
	return result, nil
}

// Cleanup releases provider state only after a durable terminal outcome. A
// running Batch is never cleaned up while it can still require its input file.
func (d *LunaDeferred) Cleanup(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, d.luna.config.Timeout)
	defer cancel()
	if d.mode != LunaBatch24h {
		if !validLunaResponseID(id) {
			return ErrLunaResultUnavailable
		}
		return d.deleteArtifact(ctx, lunaResponsePath, id)
	}
	batch, found, err := d.batchState(ctx, id)
	if err != nil || !found {
		return err
	}
	if !terminalBatch(batch.Status) {
		return ErrLunaPollRetry
	}
	var cleanupErr error
	seen := map[string]bool{"": true}
	for _, file := range []string{batch.InputFileID, batch.OutputFileID, batch.ErrorFileID} {
		if seen[file] {
			continue
		}
		seen[file] = true
		cleanupErr = errors.Join(cleanupErr, d.deleteArtifact(ctx, lunaFilesPath, file))
	}
	return cleanupErr
}

func (d *LunaDeferred) deleteArtifact(ctx context.Context, resourcePath, id string) error {
	raw, code, err := d.luna.request(ctx, http.MethodDelete, resourcePath+"/"+id, "", nil)
	if err == nil {
		switch code {
		case http.StatusNotFound, http.StatusNoContent:
			return nil
		case http.StatusOK:
			var response struct {
				ID      string `json:"id"`
				Deleted bool   `json:"deleted"`
			}
			if json.Unmarshal(raw, &response) == nil && response.ID == id && response.Deleted {
				return nil
			}
		}
	}
	return fmt.Errorf("%w: cleanup did not confirm deletion", ErrLunaPollRetry)
}

func terminalBatch(status string) bool {
	switch status {
	case "completed", "failed", "expired", "cancelled":
		return true
	default:
		return false
	}
}

// Abort stops a known deferred request. Call Cleanup after the request has
// reached a terminal state. Cancellation may need to be polled on a later run.
func (d *LunaDeferred) Abort(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, d.luna.config.Timeout)
	defer cancel()
	if d.mode == LunaBatch24h {
		batch, found, err := d.batchState(ctx, id)
		if err != nil || !found || terminalBatch(batch.Status) {
			return err
		}
		if batch.Status == "cancelling" {
			return ErrLunaPollRetry
		}
		raw, code, err := d.luna.request(ctx, http.MethodPost, lunaBatchesPath+"/"+id+"/cancel", "", nil)
		if err == nil && code == http.StatusNotFound {
			return nil
		}
		canceled, ok := readLunaBatch(raw)
		if err == nil && code == http.StatusOK && ok && canceled.ID == id && terminalBatch(canceled.Status) {
			return nil
		}
		return ErrLunaPollRetry
	}

	if !validLunaResponseID(id) {
		return ErrLunaResultUnavailable
	}
	path := lunaResponsePath + "/" + id
	raw, code, err := d.luna.request(ctx, http.MethodPost, path+"/cancel", "", nil)
	if confirmedResponseEnd(raw, code, err, id) {
		return nil
	}
	// Cancellation can race a response that has already completed. Retrieve
	// its status, without issuing another cancellation or resubmitting input.
	raw, code, err = d.luna.request(ctx, http.MethodGet, path, "", nil)
	if confirmedResponseEnd(raw, code, err, id) {
		return nil
	}
	return ErrLunaPollRetry
}

func confirmedResponseEnd(raw []byte, code int, err error, id string) bool {
	if err != nil {
		return false
	}
	if code == http.StatusNotFound {
		return true
	}
	var status lunaStatus
	if code != http.StatusOK || json.Unmarshal(raw, &status) != nil || status.ID != id {
		return false
	}
	switch status.Status {
	case "completed", "failed", "cancelled", "incomplete":
		return true
	default:
		return false
	}
}
