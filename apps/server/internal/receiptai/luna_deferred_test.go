package receiptai

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"slices"
	"strings"
	"testing"
)

const lunaDeferredReceipt = `{"documents":[{"source_image_ids":["top","bottom"],"document_type":"payment_receipt","status":"success","currency":"JPY","total_minor":900}]}`

func mockDeferredLuna(t *testing.T, mode string, transport lunaRoundTrip) *LunaDeferred {
	t.Helper()
	luna, err := NewLuna(&http.Client{Transport: transport}, lunaTestToken, lunaTestConfig())
	if err != nil {
		t.Fatal(err)
	}
	deferred, err := NewLunaDeferred(luna, mode)
	if err != nil {
		t.Fatal(err)
	}
	return deferred
}

func TestLunaBackgroundWindowsAndPolling(t *testing.T) {
	for _, window := range []string{"2h", "8h"} {
		t.Run(window, func(t *testing.T) {
			var calls []string
			traceIDs := map[string]bool{}
			d := mockDeferredLuna(t, "background_"+window, func(r *http.Request) (*http.Response, error) {
				trace := r.Header.Get("X-Client-Request-Id")
				if r.Header.Get("Authorization") != "Bearer fixture-token" || len(trace) != 32 || traceIDs[trace] || r.GetBody != nil {
					t.Fatal("expected a fresh trace identifier and no request replay")
				}
				traceIDs[trace] = true
				calls = append(calls, r.Method+" "+r.URL.Path)
				switch len(calls) {
				case 1:
					var body struct {
						Background bool   `json:"background"`
						Store      bool   `json:"store"`
						Tier       string `json:"service_tier"`
						Options    struct {
							Window string `json:"completion_window"`
						} `json:"background_options"`
					}
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Fatal(err)
					}
					if !body.Background || body.Store || body.Tier != "default" || body.Options.Window != window {
						t.Fatalf("invalid discounted request settings: %+v", body)
					}
					return mockLunaResponse(http.StatusOK, `{"id":"resp_fixture","status":"queued"}`), nil
				case 2:
					return mockLunaResponse(http.StatusTooManyRequests, "private error"), nil
				case 3:
					return mockLunaResponse(http.StatusOK, `{"id":"resp_other","status":"completed"}`), nil
				case 4:
					return mockLunaResponse(http.StatusOK, lunaOutput(t, lunaDeferredReceipt)), nil
				case 5:
					return mockLunaResponse(http.StatusOK, `{"id":"resp_fixture","deleted":true}`), nil
				default:
					t.Fatal("unexpected provider request")
					return nil, nil
				}
			})
			ctx := context.Background()
			group := lunaGroup(t)
			submitted, err := d.Submit(ctx, group)
			if err != nil || !submitted.Pending || submitted.ProviderID != "resp_fixture" {
				t.Fatalf("submission did not persist the response ID: %+v, %v", submitted, err)
			}
			for range 2 {
				got, err := d.Poll(ctx, submitted.ProviderID, group)
				if !errors.Is(err, ErrLunaPollRetry) || got.ProviderID != submitted.ProviderID || !got.Pending || strings.Contains(err.Error(), "private") {
					t.Fatalf("recoverable polling returned %+v, %v", got, err)
				}
			}
			got, err := d.Poll(ctx, submitted.ProviderID, group)
			if err != nil || got.Pending || got.ProviderID != submitted.ProviderID || len(got.Result.Documents) != 1 {
				t.Fatalf("unexpected terminal result: %+v, %v", got, err)
			}
			if err := d.Cleanup(ctx, submitted.ProviderID); err != nil {
				t.Fatal(err)
			}
			if want := []string{"POST /v1/responses", "GET /v1/responses/resp_fixture", "GET /v1/responses/resp_fixture",
				"GET /v1/responses/resp_fixture", "DELETE /v1/responses/resp_fixture"}; !slices.Equal(calls, want) {
				t.Fatalf("provider requests = %v; want %v", calls, want)
			}
		})
	}
}

func TestLunaBackgroundUnknownSubmitAndKnownTerminalFailure(t *testing.T) {
	calls := 0
	d := mockDeferredLuna(t, LunaBackground2h, func(*http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			return nil, errors.New("private transport detail")
		}
		return mockLunaResponse(http.StatusOK, `{"id":"resp_fixture","status":"completed","output":"invalid"}`), nil
	})
	group := lunaGroup(t)
	if response, err := d.Submit(context.Background(), group); !errors.Is(err, ErrLunaSubmissionUnknown) || response.ProviderID != "" || calls != 1 {
		t.Fatalf("unknown acceptance was retried or treated as rejected: %+v, %v calls=%d", response, err, calls)
	}
	if response, err := d.Poll(context.Background(), "resp_fixture", group); !errors.Is(err, ErrLunaResultUnavailable) ||
		response.Pending || response.ProviderID != "resp_fixture" || calls != 2 {
		t.Fatalf("known completed but invalid output lost its provider ID: %+v, %v calls=%d", response, err, calls)
	}
}

func batchMetadata(status string) string {
	return `{"id":"batch_fixture","status":"` + status + `","endpoint":"/v1/responses","completion_window":"24h",
		"input_file_id":"file-input","output_file_id":"file-output","error_file_id":"file-error"}`
}

func TestLunaBatchSubmitsOneGroupAndCleansOnlyAfterDurableOutcome(t *testing.T) {
	var calls []string
	var customID string
	d := mockDeferredLuna(t, LunaBatch24h, func(r *http.Request) (*http.Response, error) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch len(calls) {
		case 1:
			media, parameters, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
			if err != nil || media != "multipart/form-data" {
				t.Fatalf("unexpected upload type: %q, %v", media, err)
			}
			form := multipart.NewReader(r.Body, parameters["boundary"])
			fields := map[string]string{}
			for {
				part, err := form.NextPart()
				if errors.Is(err, io.EOF) {
					break
				}
				if err != nil {
					t.Fatal(err)
				}
				raw, err := io.ReadAll(part)
				if err != nil {
					t.Fatal(err)
				}
				fields[part.FormName()] = string(raw)
				if part.FormName() == "file" && part.FileName() != "receipt.jsonl" {
					t.Fatal("unexpected input filename")
				}
			}
			if fields["purpose"] != "batch" || fields["expires_after[anchor]"] != "created_at" ||
				fields["expires_after[seconds]"] != "93600" || len(fields) != 4 {
				t.Fatal("missing bounded Batch input expiry")
			}
			var line struct {
				ID     string `json:"custom_id"`
				Method string `json:"method"`
				URL    string `json:"url"`
				Body   struct {
					Model      string `json:"model"`
					Store      bool   `json:"store"`
					Background bool   `json:"background"`
					Input      []struct {
						Content []lunaInput `json:"content"`
					} `json:"input"`
				} `json:"body"`
			}
			if err := json.Unmarshal([]byte(fields["file"]), &line); err != nil {
				t.Fatal(err)
			}
			if len(line.ID) != 64 || line.Method != http.MethodPost || line.URL != lunaResponsePath ||
				line.Body.Model != "gpt-6-luna" || line.Body.Store || line.Body.Background ||
				len(line.Body.Input) != 1 || len(line.Body.Input[0].Content) != 4 {
				t.Fatal("Batch file is not an isolated one-group response")
			}
			customID = line.ID
			return mockLunaResponse(http.StatusOK, `{"id":"file-input","purpose":"batch"}`), nil
		case 2:
			var create struct {
				Input    string `json:"input_file_id"`
				Endpoint string `json:"endpoint"`
				Window   string `json:"completion_window"`
				Expiry   struct {
					Anchor  string `json:"anchor"`
					Seconds int    `json:"seconds"`
				} `json:"output_expires_after"`
			}
			if err := json.NewDecoder(r.Body).Decode(&create); err != nil {
				t.Fatal(err)
			}
			if create.Input != "file-input" || create.Endpoint != lunaResponsePath || create.Window != "24h" ||
				create.Expiry.Anchor != "created_at" || create.Expiry.Seconds != 3600 {
				t.Fatal("unexpected Batch creation or missing output expiry")
			}
			return mockLunaResponse(http.StatusOK, batchMetadata("validating")), nil
		case 3, 4:
			return mockLunaResponse(http.StatusOK, batchMetadata("in_progress")), nil
		case 5, 7:
			return mockLunaResponse(http.StatusOK, batchMetadata("completed")), nil
		case 6:
			line := `{"custom_id":"` + customID + `","response":{"status_code":200,"body":` + lunaOutput(t, lunaDeferredReceipt) + `},"error":null}`
			return mockLunaResponse(http.StatusOK, line+"\n"), nil
		case 8, 9, 10:
			return mockLunaResponse(http.StatusOK, `{"deleted":true}`), nil
		default:
			t.Fatal("unexpected Batch request")
			return nil, nil
		}
	})
	ctx, group := context.Background(), lunaGroup(t)
	submitted, err := d.Submit(ctx, group)
	if err != nil || !submitted.Pending || submitted.ProviderID != "batch_fixture" {
		t.Fatalf("invalid Batch acknowledgement: %+v, %v", submitted, err)
	}
	if err := d.Cleanup(ctx, submitted.ProviderID); !errors.Is(err, ErrLunaPollRetry) {
		t.Fatalf("cleanup while active = %v", err)
	}
	if response, err := d.Poll(ctx, submitted.ProviderID, group); err != nil || !response.Pending || response.ProviderID != submitted.ProviderID {
		t.Fatalf("pending Batch = %+v, %v", response, err)
	}
	result, err := d.Poll(ctx, submitted.ProviderID, group)
	if err != nil || result.Pending || result.ProviderID != submitted.ProviderID || len(result.Result.Documents) != 1 {
		t.Fatalf("completed Batch = %+v, %v", result, err)
	}
	if err := d.Cleanup(ctx, submitted.ProviderID); err != nil {
		t.Fatal(err)
	}
	want := []string{"POST /v1/files", "POST /v1/batches", "GET /v1/batches/batch_fixture", "GET /v1/batches/batch_fixture",
		"GET /v1/batches/batch_fixture", "GET /v1/files/file-output/content", "GET /v1/batches/batch_fixture",
		"DELETE /v1/files/file-input", "DELETE /v1/files/file-output", "DELETE /v1/files/file-error"}
	if !slices.Equal(calls, want) {
		t.Fatalf("provider requests = %v; want %v", calls, want)
	}
}

func TestLunaBatchRejectionCleansInputButUnknownAcceptanceDoesNot(t *testing.T) {
	for _, known := range []bool{false, true} {
		var calls []string
		d := mockDeferredLuna(t, LunaBatch24h, func(r *http.Request) (*http.Response, error) {
			calls = append(calls, r.Method+" "+r.URL.Path)
			switch len(calls) {
			case 1:
				return mockLunaResponse(http.StatusOK, `{"id":"file-input","purpose":"batch"}`), nil
			case 2:
				if known {
					return mockLunaResponse(http.StatusBadRequest, "private response"), nil
				}
				return nil, errors.New("private transport detail")
			case 3:
				return mockLunaResponse(http.StatusNotFound, ""), nil
			default:
				t.Fatal("unexpected resubmission")
				return nil, nil
			}
		})
		_, err := d.Submit(context.Background(), lunaGroup(t))
		want, wantError := []string{"POST /v1/files", "POST /v1/batches"}, ErrLunaSubmissionUnknown
		if known {
			want, wantError = append(want, "DELETE /v1/files/file-input"), ErrLunaRejected
		}
		if !errors.Is(err, wantError) || !slices.Equal(calls, want) {
			t.Fatalf("known=%t: provider requests=%v error=%v", known, calls, err)
		}
	}
}

func TestLunaBatchAbortWaitsForTerminalBeforeCleaning(t *testing.T) {
	var calls []string
	d := mockDeferredLuna(t, LunaBatch24h, func(r *http.Request) (*http.Response, error) {
		calls = append(calls, r.Method+" "+r.URL.Path)
		switch len(calls) {
		case 1:
			return mockLunaResponse(http.StatusOK, batchMetadata("in_progress")), nil
		case 2, 3:
			return mockLunaResponse(http.StatusOK, batchMetadata("cancelling")), nil
		case 4, 5:
			return mockLunaResponse(http.StatusOK, batchMetadata("cancelled")), nil
		case 6, 7, 8:
			return mockLunaResponse(http.StatusNotFound, ""), nil
		default:
			t.Fatal("unexpected Batch request")
			return nil, nil
		}
	})
	ctx := context.Background()
	if err := d.Abort(ctx, "batch_fixture"); !errors.Is(err, ErrLunaPollRetry) {
		t.Fatalf("cancel in progress = %v", err)
	}
	if err := d.Cleanup(ctx, "batch_fixture"); !errors.Is(err, ErrLunaPollRetry) {
		t.Fatalf("cleanup during cancellation = %v", err)
	}
	if err := d.Abort(ctx, "batch_fixture"); err != nil {
		t.Fatalf("aborting a previously cancelled batch = %v", err)
	}
	if err := d.Cleanup(ctx, "batch_fixture"); err != nil {
		t.Fatalf("cleanup of already deleted files = %v", err)
	}
	want := []string{"GET /v1/batches/batch_fixture", "POST /v1/batches/batch_fixture/cancel",
		"GET /v1/batches/batch_fixture", "GET /v1/batches/batch_fixture", "GET /v1/batches/batch_fixture",
		"DELETE /v1/files/file-input", "DELETE /v1/files/file-output", "DELETE /v1/files/file-error"}
	if !slices.Equal(calls, want) {
		t.Fatalf("provider requests = %v; want %v", calls, want)
	}
}

func TestLunaBatchRejectsMismatchedOutputGrouping(t *testing.T) {
	d := mockDeferredLuna(t, LunaBatch24h, func(r *http.Request) (*http.Response, error) {
		switch r.URL.Path {
		case "/v1/batches/batch_fixture":
			return mockLunaResponse(http.StatusOK, batchMetadata("completed")), nil
		case "/v1/files/file-output/content":
			line := `{"custom_id":"different-group","response":{"status_code":200,"body":` + lunaOutput(t, lunaDeferredReceipt) + `},"error":null}`
			return mockLunaResponse(http.StatusOK, line), nil
		default:
			t.Fatal("unexpected reupload or cleanup")
			return nil, nil
		}
	})
	result, err := d.Poll(context.Background(), "batch_fixture", lunaGroup(t))
	if !errors.Is(err, ErrLunaResultUnavailable) || result.ProviderID != "batch_fixture" || result.Pending || len(result.Result.Documents) != 0 {
		t.Fatalf("misbound output = %+v, %v", result, err)
	}
}
