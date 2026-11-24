package receiptai

import (
	"encoding/json"
	"strings"
	"testing"
)

func resultGroup() Group {
	return Group{ID: "receipt-1", Images: []Image{{ID: "top"}, {ID: "bottom"}}}
}

func resultLimits() ResultLimits {
	return ResultLimits{
		MaxJSONBytes: 4096, MaxDocuments: 4, MaxItems: 10, MaxPayments: 4,
		MaxTextRunes: 64, MaxAmountMinor: 100_000,
	}
}

func TestDecodeResultMultipleDocumentsAndMissingValues(t *testing.T) {
	raw := []byte(`{"documents":[
		{"source_image_ids":["top","bottom"],"document_type":"itemized_receipt","status":"success",
		 "merchant":"売店","date":null,"currency":"JPY","tax_minor":null,"total_minor":790,
		 "items":[{"name":"飲み物","amount_minor":360},{"name":"ポップコーン","amount_minor":null}],
		 "payments":[{"method":"credit_card","last_four":"0007","amount_minor":790}]},
		{"source_image_ids":["bottom"],"document_type":"payment_receipt","status":"success",
		 "date":"2024-02-29","currency":"JPY","total_minor":790,"items":[]},
		{"source_image_ids":["bottom"],"document_type":"atm_statement","status":"out_of_scope"}
	]}`)
	result, err := DecodeResult(raw, resultGroup(), resultLimits())
	if err != nil {
		t.Fatal(err)
	}
	receipt, totalOnly, atm := result.Documents[0], result.Documents[1], result.Documents[2]
	if receipt.Date != nil || receipt.TaxMinor != nil || receipt.Items[1].AmountMinor != nil ||
		receipt.Payments[0].LastFour == nil || *receipt.Payments[0].LastFour != "0007" {
		t.Fatal("nullable fields and leading zero were not preserved")
	}
	if totalOnly.Type != PaymentReceipt || len(totalOnly.Items) != 0 || totalOnly.TotalMinor == nil ||
		*totalOnly.TotalMinor != 790 || atm.Status != OutOfScope || len(atm.Payments) != 0 {
		t.Fatal("total-only receipt or ATM classification changed")
	}
	if strings.Join(receipt.SourceImageIDs, ",") != "top,bottom" || totalOnly.SourceImageIDs[0] != "bottom" {
		t.Fatal("returned source image order changed")
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(encoded), `"date":null`) ||
		!strings.Contains(string(encoded), `"items":[]`) {
		t.Fatal("unknown values and empty item arrays were not serialized distinctly")
	}
}

func TestDecodeResultAllowsPartialAndPrintedTotalsWithUnclearTaxBasis(t *testing.T) {
	raw := []byte(`{"documents":[
		{"source_image_ids":["top"],"document_type":"invoice","status":"partial",
		 "currency":"JPY","subtotal_minor":1000,"tax_minor":100,"discount_minor":50,"total_minor":1120},
		{"source_image_ids":["bottom"],"document_type":"unknown","status":"unreadable"}
	]}`)
	if _, err := DecodeResult(raw, resultGroup(), resultLimits()); err != nil {
		t.Fatal(err)
	}
}

func TestDecodeResultRejectsBadDocuments(t *testing.T) {
	tests := []struct {
		name string
		json string
		want string
	}{
		{"outside group", `{"source_image_ids":["group-2-image"],"document_type":"unknown","status":"unreadable"}`, "source image"},
		{"repeated source", `{"source_image_ids":["top","top"],"document_type":"unknown","status":"unreadable"}`, "source image"},
		{"missing source", `{"document_type":"unknown","status":"unreadable"}`, "reference"},
		{"undefined type", `{"source_image_ids":["top"],"document_type":"transcript","status":"unreadable"}`, "document type"},
		{"job state", `{"source_image_ids":["top"],"document_type":"unknown","status":"timeout"}`, "extraction status"},
		{"classified nonexpense", `{"source_image_ids":["top"],"document_type":"atm_statement","status":"success"}`, "out-of-scope"},
		{"nonexpense amounts", `{"source_image_ids":["top"],"document_type":"atm_statement","status":"out_of_scope","currency":"JPY","total_minor":1000}`, "extracted details"},
		{"unreadable payment", `{"source_image_ids":["top"],"document_type":"unknown","status":"unreadable","payments":[{"method":"cash"}]}`, "extracted details"},
		{"successful no total", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"success"}`, "known document type and total"},
		{"unsupported currency", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","currency":"JPY ","total_minor":100}`, "currency"},
		{"currency missing", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","items":[{"amount_minor":500}]}`, "require a currency"},
		{"fractional money", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","currency":"JPY","total_minor":1.5}`, "does not match"},
		{"amount limit", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","currency":"JPY","total_minor":100001}`, "minor-unit range"},
		{"negative discount", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","currency":"JPY","discount_minor":-1}`, "discount"},
		{"invalid day", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","date":"2025-02-29"}`, "purchase date"},
		{"year zero", `{"source_image_ids":["top"],"document_type":"itemized_receipt","status":"partial","date":"0000-01-01"}`, "purchase date"},
		{"unknown payment", `{"source_image_ids":["top"],"document_type":"card_sales_slip","status":"partial","payments":[{"method":"card"}]}`, "payment method"},
		{"numeric last four", `{"source_image_ids":["top"],"document_type":"card_sales_slip","status":"partial","payments":[{"method":"credit_card","last_four":7777}]}`, "does not match"},
		{"full-width last four", `{"source_image_ids":["top"],"document_type":"card_sales_slip","status":"partial","payments":[{"method":"credit_card","last_four":"１２３４"}]}`, "ASCII digits"},
		{"full PAN", `{"source_image_ids":["top"],"document_type":"card_sales_slip","status":"partial","payments":[{"method":"credit_card","last_four":"4111111111111111"}]}`, "ASCII digits"},
		{"full number field", `{"source_image_ids":["top"],"document_type":"card_sales_slip","status":"partial","payments":[{"method":"credit_card","card_number":"masked"}]}`, "does not match"},
		{"noncard digits", `{"source_image_ids":["top"],"document_type":"payment_receipt","status":"partial","payments":[{"method":"cash","last_four":"1234"}]}`, "from a card payment"},
		{"duplicate field", `{"source_image_ids":["top"],"document_type":"other","status":"unreadable","status":"out_of_scope"}`, "duplicate"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			raw := []byte(`{"documents":[` + test.json + `]}`)
			_, err := DecodeResult(raw, resultGroup(), resultLimits())
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
}

func TestDecodeResultRejectsInvalidGroupAndLimits(t *testing.T) {
	raw := []byte(`{"documents":[{"source_image_ids":["top"],"document_type":"payment_receipt","status":"partial",
		"merchant":"領収書店","items":[{"name":"商品1"},{"name":"商品2"}],"payments":[{"method":"points"},{"method":"cash"}]},
		{"source_image_ids":["bottom"],"document_type":"other","status":"out_of_scope"}]}`)
	tests := []struct {
		name string
		set  func(*ResultLimits)
		want string
	}{
		{"document count", func(l *ResultLimits) { l.MaxDocuments = 1 }, "document count"},
		{"item count", func(l *ResultLimits) { l.MaxItems = 1 }, "item or payment count"},
		{"payment count", func(l *ResultLimits) { l.MaxPayments = 1 }, "item or payment count"},
		{"text runes", func(l *ResultLimits) { l.MaxTextRunes = 3 }, "merchant text"},
		{"JSON bytes", func(l *ResultLimits) { l.MaxJSONBytes = 1 }, "JSON byte size"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			limits := resultLimits()
			test.set(&limits)
			_, err := DecodeResult(raw, resultGroup(), limits)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("expected %q, got %v", test.want, err)
			}
		})
	}
	if _, err := DecodeResult(raw, Group{Images: []Image{{ID: "top"}, {ID: "top"}}}, resultLimits()); err == nil {
		t.Fatal("duplicate input group image ID was accepted")
	}
}

func TestDecodeResultAcceptsOnlyKnownUnreadableQualityReasons(t *testing.T) {
	for _, quality := range []string{"blur", "glare"} {
		raw := []byte(`{"documents":[{"source_image_ids":["top"],"document_type":"unknown","status":"unreadable","quality_reason":"` +
			quality + `"}]}`)
		result, err := DecodeResult(raw, resultGroup(), resultLimits())
		if err != nil || result.Documents[0].QualityReason == nil || string(*result.Documents[0].QualityReason) != quality {
			t.Fatalf("known unreadable image reason not retained: %v", err)
		}
	}
	for _, raw := range []string{
		`{"documents":[{"source_image_ids":["top"],"document_type":"unknown","status":"unreadable","quality_reason":"maybe"}]}`,
		`{"documents":[{"source_image_ids":["top"],"document_type":"other","status":"out_of_scope","quality_reason":"blur"}]}`,
	} {
		if _, err := DecodeResult([]byte(raw), resultGroup(), resultLimits()); err == nil {
			t.Fatal("unknown or misapplied image quality reason was accepted")
		}
	}
}
