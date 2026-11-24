package receiptai

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"regexp"
	"unicode/utf8"
)

// Request is a single intake. Each ordered group is sent to the analyzer separately.
type Request struct {
	Groups []Group `json:"groups"`
}

type Group struct {
	ID     string  `json:"id"`
	Images []Image `json:"images"`
}

type Image struct {
	ID       string `json:"id"`
	MIMEType string `json:"mime_type"`
	Data     []byte `json:"data"`
}

// RequestLimits are supplied by the caller. Byte limits on images apply after base64 decoding.
type RequestLimits struct {
	MaxJSONBytes       int
	MaxGroups          int
	MaxImagesPerGroup  int
	MaxTotalImages     int
	MaxImageBytes      int
	MaxTotalImageBytes int
	MaxImagePixels     int64
}

var (
	identifier = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`)
	jsonField  = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
)

func DecodeRequest(raw []byte, limits RequestLimits) (Request, error) {
	var request Request
	if limits.MaxJSONBytes <= 0 || limits.MaxGroups <= 0 || limits.MaxImagesPerGroup <= 0 ||
		limits.MaxTotalImages <= 0 || limits.MaxImageBytes <= 0 || limits.MaxTotalImageBytes <= 0 ||
		limits.MaxImagePixels <= 0 {
		return Request{}, errors.New("receipt request limits must be positive")
	}
	if err := decodeStrict(raw, limits.MaxJSONBytes, &request); err != nil {
		return Request{}, fmt.Errorf("receipt request: %w", err)
	}
	if len(request.Groups) == 0 || len(request.Groups) > limits.MaxGroups {
		return Request{}, errors.New("receipt group count is outside the configured limit")
	}

	groups := make(map[string]bool, len(request.Groups))
	images := make(map[string]bool)
	remainingImages, remainingBytes := limits.MaxTotalImages, limits.MaxTotalImageBytes
	for groupIndex, group := range request.Groups {
		if !identifier.MatchString(group.ID) || groups[group.ID] {
			return Request{}, fmt.Errorf("invalid or duplicate group ID at index %d", groupIndex)
		}
		groups[group.ID] = true
		if len(group.Images) == 0 || len(group.Images) > limits.MaxImagesPerGroup || len(group.Images) > remainingImages {
			return Request{}, fmt.Errorf("image count is outside the configured limit in group %d", groupIndex)
		}
		remainingImages -= len(group.Images)

		for imageIndex, entry := range group.Images {
			if !identifier.MatchString(entry.ID) || images[entry.ID] {
				return Request{}, fmt.Errorf("invalid or duplicate image ID at group %d image %d", groupIndex, imageIndex)
			}
			images[entry.ID] = true
			if len(entry.Data) == 0 || len(entry.Data) > limits.MaxImageBytes || len(entry.Data) > remainingBytes {
				return Request{}, fmt.Errorf("image byte size is outside the configured limit at group %d image %d", groupIndex, imageIndex)
			}
			if err := validateImage(entry, limits.MaxImagePixels); err != nil {
				return Request{}, fmt.Errorf("group %d image %d: %w", groupIndex, imageIndex, err)
			}
			remainingBytes -= len(entry.Data)
		}
	}
	return request, nil
}

func validateImage(entry Image, maxPixels int64) error {
	if entry.MIMEType != "image/jpeg" && entry.MIMEType != "image/png" {
		return errors.New("unsupported image media type")
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(entry.Data))
	if err != nil || entry.MIMEType != "image/"+format {
		return errors.New("image header does not match its media type")
	}
	if config.Width <= 0 || config.Height <= 0 || int64(config.Width) > maxPixels/int64(config.Height) {
		return errors.New("image dimensions exceed the configured pixel limit")
	}
	decoded, _, err := image.Decode(bytes.NewReader(entry.Data))
	if err != nil {
		return errors.New("image data could not be decoded")
	}
	if bounds := decoded.Bounds(); bounds.Dx() != config.Width || bounds.Dy() != config.Height {
		return errors.New("image dimensions do not match its header")
	}
	return nil
}

func decodeStrict(raw []byte, maxBytes int, output any) error {
	if len(raw) == 0 || len(raw) > maxBytes {
		return errors.New("JSON byte size is outside the configured limit")
	}
	if !utf8.Valid(raw) {
		return errors.New("invalid UTF-8 in JSON")
	}
	tokens := json.NewDecoder(bytes.NewReader(raw))
	tokens.UseNumber()
	if err := checkJSONValue(tokens, 0); err != nil {
		return err
	}
	if _, err := tokens.Token(); err != io.EOF {
		return errors.New("expected exactly one JSON value")
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	// Provider and customer text can appear in a decoder error. Return a generic message.
	if err := decoder.Decode(output); err != nil {
		return errors.New("JSON does not match the receipt schema")
	}
	return nil
}

func checkJSONValue(decoder *json.Decoder, depth int) error {
	// Both receipt schemas have a fixed structure with fewer than ten nested containers.
	if depth > 10 {
		return errors.New("receipt JSON is nested too deeply")
	}
	value, err := decoder.Token()
	if err != nil {
		return errors.New("invalid receipt JSON")
	}
	switch value {
	case json.Delim('{'):
		seen := map[string]bool{}
		for decoder.More() {
			key, err := decoder.Token()
			name, ok := key.(string)
			if err != nil || !ok || !jsonField.MatchString(name) {
				return errors.New("invalid receipt JSON field")
			}
			if seen[name] {
				return errors.New("duplicate receipt JSON field")
			}
			seen[name] = true
			if err := checkJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
	case json.Delim('['):
		for decoder.More() {
			if err := checkJSONValue(decoder, depth+1); err != nil {
				return err
			}
		}
	default:
		return nil
	}
	if _, err := decoder.Token(); err != nil {
		return errors.New("invalid receipt JSON container")
	}
	return nil
}
