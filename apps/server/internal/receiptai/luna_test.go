package receiptai

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

type lunaRoundTrip func(*http.Request) (*http.Response, error)

func (fn lunaRoundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func lunaTestConfig() LunaConfig {
	return LunaConfig{
		Timeout: time.Second, MaxOutputTokens: 512, MaxRequestBytes: 8 << 10,
		MaxResponseBytes: 8 << 10, ResultLimits: resultLimits(),
	}
}

func lunaTestToken(context.Context) (string, error) { return "fixture-token", nil }

func mockLunaResponse(status int, raw string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(raw))}
}

func lunaGroup(t *testing.T) Group {
	t.Helper()
	top, bottom := receiptImages(t)
	return Group{ID: "receipt-1", Images: []Image{top, bottom}}
}

func lunaOutput(t *testing.T, text string) string {
	t.Helper()
	result, err := json.Marshal(map[string]any{
		"id": "resp_fixture", "status": "completed",
		"output": []map[string]any{
			{"type": "reasoning"},
			{"type": "message", "role": "assistant", "content": []map[string]string{
				{"type": "output_text", "text": text},
			}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return string(result)
}

func TestLunaSendsOneOrderedStandardRequest(t *testing.T) {
	group := lunaGroup(t)
	resultJSON := `{"documents":[{"source_image_ids":["top","bottom"],"document_type":"payment_receipt","status":"success","currency":"JPY","total_minor":900}]}`
	rawResponse := lunaOutput(t, resultJSON)
	calls := 0
	client := &http.Client{Transport: lunaRoundTrip(func(request *http.Request) (*http.Response, error) {
		calls++
		if request.Method != http.MethodPost || request.URL.String() != lunaEndpoint ||
			request.Header.Get("Authorization") != "Bearer fixture-token" ||
			request.Header.Get("Content-Type") != "application/json" || request.GetBody != nil {
			t.Fatal("unexpected response request")
		}
		var body struct {
			Model           string `json:"model"`
			ServiceTier     string `json:"service_tier"`
			MaxOutputTokens int    `json:"max_output_tokens"`
			Store           *bool  `json:"store"`
			Background      *bool  `json:"background"`
			Reasoning       struct {
				Effort string `json:"effort"`
			} `json:"reasoning"`
			Input []struct {
				Role    string      `json:"role"`
				Content []lunaInput `json:"content"`
			} `json:"input"`
			Text struct {
				Format struct {
					Type   string         `json:"type"`
					Name   string         `json:"name"`
					Strict bool           `json:"strict"`
					Schema map[string]any `json:"schema"`
				} `json:"format"`
			} `json:"text"`
		}
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != "gpt-6-luna" || body.Reasoning.Effort != "low" || body.ServiceTier != "default" ||
			body.MaxOutputTokens != 512 || body.Store == nil || *body.Store || body.Background == nil || *body.Background ||
			body.Text.Format.Type != "json_schema" || body.Text.Format.Name != "receipt_result" ||
			!body.Text.Format.Strict || body.Text.Format.Schema["additionalProperties"] != false {
			t.Fatalf("unexpected response configuration")
		}
		if len(body.Input) != 1 || body.Input[0].Role != "user" || len(body.Input[0].Content) != 4 {
			t.Fatalf("expected one user input containing two labeled images")
		}
		for i, image := range group.Images {
			label, input := body.Input[0].Content[2*i], body.Input[0].Content[2*i+1]
			if label.Type != "input_text" || label.Text != "Source image ID: "+image.ID ||
				input.Type != "input_image" || input.Detail != "high" ||
				input.ImageURL != "data:"+image.MIMEType+";base64,"+base64.StdEncoding.EncodeToString(image.Data) {
				t.Fatalf("unexpected image input at position %d", i)
			}
		}
		return mockLunaResponse(http.StatusOK, rawResponse), nil
	})}
	luna, err := NewLuna(client, lunaTestToken, lunaTestConfig())
	if err != nil {
		t.Fatal(err)
	}
	result, err := luna.Analyze(context.Background(), group)
	if err != nil || result.ProviderID != "resp_fixture" || calls != 1 ||
		len(result.Result.Documents) != 1 || result.Result.Documents[0].TotalMinor == nil || *result.Result.Documents[0].TotalMinor != 900 {
		t.Fatalf("unexpected translated result: %v", err)
	}
}

func TestLunaDistinguishesDefinitiveRejectionsAndUnknownSubmissions(t *testing.T) {
	tests := []struct {
		name   string
		status int
		raw    string
		err    error
		want   error
	}{
		{"invalid request", http.StatusBadRequest, "sensitive response", nil, ErrLunaRejected},
		{"rate limited", http.StatusTooManyRequests, "sensitive response", nil, ErrLunaRejected},
		{"gateway error", http.StatusBadGateway, "sensitive response", nil, ErrLunaSubmissionUnknown},
		{"request timed out", http.StatusRequestTimeout, "sensitive response", nil, ErrLunaSubmissionUnknown},
		{"transport failure", 0, "", errors.New("sensitive response"), ErrLunaSubmissionUnknown},
		{"unparseable response", http.StatusOK, "sensitive response", nil, ErrLunaSubmissionUnknown},
		{"oversized response", http.StatusOK, strings.Repeat("x", 9<<10), nil, ErrLunaSubmissionUnknown},
	}
	group := lunaGroup(t)
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			luna, err := NewLuna(&http.Client{Transport: lunaRoundTrip(func(*http.Request) (*http.Response, error) {
				calls++
				if test.err != nil {
					return nil, test.err
				}
				return mockLunaResponse(test.status, test.raw), nil
			})}, lunaTestToken, lunaTestConfig())
			if err != nil {
				t.Fatal(err)
			}
			response, err := luna.Analyze(context.Background(), group)
			if !errors.Is(err, test.want) || response.ProviderID != "" || calls != 1 ||
				strings.Contains(err.Error(), "sensitive response") {
				t.Fatalf("expected one attempt and sanitized %v, got %v", test.want, err)
			}
		})
	}
}

func TestLunaDoesNotFollowRedirects(t *testing.T) {
	calls := 0
	client := &http.Client{Transport: lunaRoundTrip(func(_ *http.Request) (*http.Response, error) {
		calls++
		response := mockLunaResponse(http.StatusFound, "")
		response.Header.Set("Location", "https://redirect.example/collect")
		return response, nil
	})}
	luna, err := NewLuna(client, lunaTestToken, lunaTestConfig())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := luna.Analyze(context.Background(), lunaGroup(t)); !errors.Is(err, ErrLunaSubmissionUnknown) || calls != 1 {
		t.Fatalf("redirect made another request or returned an unexpected error: %v", err)
	}
}

func TestLunaKeepsAcknowledgedIDWhenResultIsUnavailable(t *testing.T) {
	group := lunaGroup(t)
	rawResponses := []string{
		`{"id":"resp_fixture","status":"incomplete"}`,
		`{"id":"resp_fixture","status":"completed","output":"sensitive text"}`,
		lunaOutput(t, `{"documents":[],"sensitive text":"must not appear"}`),
		`{"id":"resp_fixture","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"refusal","refusal":"sensitive text"}]}]}`,
		lunaOutput(t, `{"documents":[{"source_image_ids":["another-group"],"document_type":"unknown","status":"unreadable"}]}`),
	}
	for _, raw := range rawResponses {
		luna, err := NewLuna(&http.Client{Transport: lunaRoundTrip(func(*http.Request) (*http.Response, error) {
			return mockLunaResponse(http.StatusOK, raw), nil
		})}, lunaTestToken, lunaTestConfig())
		if err != nil {
			t.Fatal(err)
		}
		result, err := luna.Analyze(context.Background(), group)
		if !errors.Is(err, ErrLunaResultUnavailable) || result.ProviderID != "resp_fixture" ||
			len(result.Result.Documents) != 0 || strings.Contains(err.Error(), "sensitive text") {
			t.Fatalf("acknowledgement was lost or unusable result was accepted: %v", err)
		}
	}
}

func TestLunaAppliesLocalRequestCapsAndContextDeadline(t *testing.T) {
	group := lunaGroup(t)
	config := lunaTestConfig()
	config.MaxRequestBytes = 32
	client := &http.Client{Transport: lunaRoundTrip(func(*http.Request) (*http.Response, error) {
		t.Fatal("invalid request reached the transport")
		return nil, nil
	})}
	luna, err := NewLuna(client, func(context.Context) (string, error) {
		t.Fatal("invalid request fetched authorization")
		return "", nil
	}, config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := luna.Analyze(context.Background(), group); !errors.Is(err, ErrLunaBeforeSend) {
		t.Fatalf("request limit not enforced: %v", err)
	}

	config = lunaTestConfig()
	config.Timeout = 20 * time.Millisecond
	client = &http.Client{Transport: lunaRoundTrip(func(request *http.Request) (*http.Response, error) {
		<-request.Context().Done()
		return nil, request.Context().Err()
	})}
	luna, err = NewLuna(client, lunaTestToken, config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := luna.Analyze(context.Background(), group); !errors.Is(err, ErrLunaSubmissionUnknown) {
		t.Fatalf("deadline after transport entered must be treated as unknown: %v", err)
	}
}

func TestLunaSchemaMatchesResultContract(t *testing.T) {
	checkLunaSchema(t, lunaResultSchema(), reflect.TypeFor[Result]())
}

func checkLunaSchema(t *testing.T, schema lunaSchema, target reflect.Type) {
	t.Helper()
	schemaType := schema["type"]
	switch target.Kind() {
	case reflect.Struct:
		fields := schema["properties"].(lunaSchema)
		required := schema["required"].([]string)
		if schemaType != "object" || schema["additionalProperties"] != false ||
			len(fields) != target.NumField() || len(required) != target.NumField() {
			t.Fatalf("object contract differs for %s", target)
		}
		for i := range target.NumField() {
			field := target.Field(i)
			name := field.Tag.Get("json")
			if !slices.Contains(required, name) {
				t.Fatalf("missing required field %s.%s", target, name)
			}
			checkLunaSchema(t, fields[name].(lunaSchema), field.Type)
		}
	case reflect.Slice:
		if schemaType != "array" {
			t.Fatalf("%s is not an array in the schema", target)
		}
		checkLunaSchema(t, schema["items"].(lunaSchema), target.Elem())
	case reflect.Pointer:
		kind := "string"
		if target.Elem().Kind() == reflect.Int64 {
			kind = "integer"
		}
		if types, ok := schemaType.([]string); !ok || !slices.Equal(types, []string{kind, "null"}) {
			t.Fatalf("%s does not preserve the nullable scalar type", target)
		}
	case reflect.String:
		if schemaType != "string" {
			t.Fatalf("%s is not a string in the schema", target)
		}
	default:
		t.Fatalf("unexpected schema field type %s", target)
	}
}
