package receiptai

import (
	"bytes"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"strings"
	"testing"
)

func receiptImages(t *testing.T) (Image, Image) {
	t.Helper()
	source := image.NewRGBA(image.Rect(0, 0, 2, 3))
	source.SetRGBA(0, 0, color.RGBA{R: 255, A: 255})
	var photograph, scan bytes.Buffer
	if err := jpeg.Encode(&photograph, source, nil); err != nil {
		t.Fatal(err)
	}
	if err := png.Encode(&scan, source); err != nil {
		t.Fatal(err)
	}
	return Image{ID: "top", MIMEType: "image/jpeg", Data: photograph.Bytes()},
		Image{ID: "bottom", MIMEType: "image/png", Data: scan.Bytes()}
}

func requestJSON(t *testing.T, request Request) []byte {
	t.Helper()
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func fixtureLimits() RequestLimits {
	return RequestLimits{
		MaxJSONBytes: 4096, MaxGroups: 3, MaxImagesPerGroup: 3, MaxTotalImages: 5,
		MaxImageBytes: 1024, MaxTotalImageBytes: 2048, MaxImagePixels: 6,
	}
}

func TestDecodeRequestPreservesGroupsAndImages(t *testing.T) {
	top, bottom := receiptImages(t)
	extra := Image{ID: "other-image", MIMEType: bottom.MIMEType, Data: bottom.Data}
	request := Request{Groups: []Group{
		{ID: "second", Images: []Image{bottom, top}},
		{ID: "first", Images: []Image{extra}},
	}}
	raw := requestJSON(t, request)
	limits := fixtureLimits()
	limits.MaxJSONBytes = len(raw)
	limits.MaxTotalImageBytes = len(bottom.Data) + len(top.Data) + len(extra.Data)
	decoded, err := DecodeRequest(raw, limits)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(requestJSON(t, decoded), raw) {
		t.Fatalf("groups, images, or image bytes did not round-trip")
	}
}

func TestDecodeRequestRejectsInvalidIDOrLimits(t *testing.T) {
	top, bottom := receiptImages(t)
	other := bottom
	other.ID = "extra"

	tests := []struct {
		name   string
		groups []Group
		limit  func(*RequestLimits)
		error  string
	}{
		{name: "missing group", error: "group count"},
		{name: "invalid group id", groups: []Group{{"a/b", []Image{top}}}, error: "group ID"},
		{name: "duplicate group id", groups: []Group{{"a", []Image{top}}, {"a", []Image{bottom}}}, error: "group ID"},
		{name: "empty group", groups: []Group{{ID: "a"}}, error: "image count"},
		{name: "repeated image id in group", groups: []Group{{"a", []Image{top, top}}}, error: "image ID"},
		{name: "repeated image id across groups", groups: []Group{{"a", []Image{top}}, {"b", []Image{top}}}, error: "image ID"},
		{name: "group limit", groups: []Group{{"a", []Image{top}}, {"b", []Image{bottom}}},
			limit: func(l *RequestLimits) { l.MaxGroups = 1 }, error: "group count"},
		{name: "group image limit", groups: []Group{{"a", []Image{top, bottom}}},
			limit: func(l *RequestLimits) { l.MaxImagesPerGroup = 1 }, error: "image count"},
		{name: "total image limit", groups: []Group{{"a", []Image{top, bottom}}, {"b", []Image{other}}},
			limit: func(l *RequestLimits) { l.MaxTotalImages = 2 }, error: "image count"},
		{name: "image byte limit", groups: []Group{{"a", []Image{top}}},
			limit: func(l *RequestLimits) { l.MaxImageBytes = len(top.Data) - 1 }, error: "image byte size"},
		{name: "total byte limit", groups: []Group{{"a", []Image{top}}, {"b", []Image{bottom}}},
			limit: func(l *RequestLimits) { l.MaxTotalImageBytes = len(top.Data) + len(bottom.Data) - 1 }, error: "image byte size"},
		{name: "pixel limit", groups: []Group{{"a", []Image{top}}},
			limit: func(l *RequestLimits) { l.MaxImagePixels = 5 }, error: "pixel limit"},
		{name: "unconfigured limit", groups: []Group{{"a", []Image{top}}},
			limit: func(l *RequestLimits) { l.MaxImagePixels = 0 }, error: "limits must be positive"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			limits := fixtureLimits()
			if test.limit != nil {
				test.limit(&limits)
			}
			raw := requestJSON(t, Request{Groups: test.groups})
			_, err := DecodeRequest(raw, limits)
			if err == nil || !strings.Contains(err.Error(), test.error) {
				t.Fatalf("expected %q, got %v", test.error, err)
			}
		})
	}
}

func TestDecodeRequestValidatesImageTypeAndHeader(t *testing.T) {
	top, bottom := receiptImages(t)
	tests := []struct {
		name string
		data Image
		want string
	}{
		{"unsupported MIME", Image{ID: "body", MIMEType: "image/webp", Data: bottom.Data}, "unsupported"},
		{"wrong MIME", Image{ID: "body", MIMEType: "image/jpeg", Data: bottom.Data}, "header does not match"},
		{"malformed header", Image{ID: "body", MIMEType: "image/jpeg", Data: top.Data[:4]}, "header does not match"},
		{"truncated JPEG", Image{ID: "body", MIMEType: "image/jpeg", Data: top.Data[:len(top.Data)-4]}, "could not be decoded"},
		{"truncated PNG", Image{ID: "body", MIMEType: "image/png", Data: bottom.Data[:len(bottom.Data)-12]}, "could not be decoded"},
		{"missing data", Image{ID: "body", MIMEType: "image/png"}, "image byte size"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			raw := requestJSON(t, Request{Groups: []Group{{ID: "a", Images: []Image{test.data}}}})
			_, err := DecodeRequest(raw, fixtureLimits())
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
}

func TestDecodeRequestRequiresStrictJSON(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`{"groups":[],"groups":[]}`, "duplicate"},
		{`{"Groups":[]}`, "invalid receipt JSON field"},
		{`{"groupſ":[]}`, "invalid receipt JSON field"},
		{`{"groups":[],"unused":true}`, "does not match"},
		{`{"groups":[{"id":"a","images":[{"id":"x","mime_type":"image/png","data":"bad!"}]}]}`, "does not match"},
		{`{"groups":`, "invalid receipt JSON"},
		{`{"groups":[]} []`, "exactly one JSON value"},
		{`{"groups":[],"padding":` + strings.Repeat("[", 11) + "0" + strings.Repeat("]", 11) + "}", "nested too deeply"},
		{"{\"groups\":\"\xff\"}", "invalid UTF-8"},
	}

	for _, test := range tests {
		t.Run(test.want, func(t *testing.T) {
			_, err := DecodeRequest([]byte(test.input), fixtureLimits())
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}

	limits := fixtureLimits()
	limits.MaxJSONBytes = 1
	if _, err := DecodeRequest([]byte(`{"groups":[]}`), limits); err == nil || !strings.Contains(err.Error(), "JSON byte size") {
		t.Fatalf("expected raw request size error, got %v", err)
	}
}
