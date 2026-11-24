package receiptai

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

type DocumentType string

const (
	ItemizedReceipt DocumentType = "itemized_receipt"
	PaymentReceipt  DocumentType = "payment_receipt"
	Invoice         DocumentType = "invoice"
	CardSalesSlip   DocumentType = "card_sales_slip"
	ATMStatement    DocumentType = "atm_statement"
	OtherDocument   DocumentType = "other"
	UnknownDocument DocumentType = "unknown"
)

// DocumentStatus describes extraction only. Transport failures and credit settlement
// belong to the Go job state and cannot be declared by the analyzer.
type DocumentStatus string

const (
	Success    DocumentStatus = "success"
	Partial    DocumentStatus = "partial"
	OutOfScope DocumentStatus = "out_of_scope"
	Unreadable DocumentStatus = "unreadable"
)

type ImageQualityReason string

const (
	QualityBlur  ImageQualityReason = "blur"
	QualityGlare ImageQualityReason = "glare"
)

type Result struct {
	Documents []Document `json:"documents"`
}

type Document struct {
	SourceImageIDs []string            `json:"source_image_ids"`
	Type           DocumentType        `json:"document_type"`
	Status         DocumentStatus      `json:"status"`
	QualityReason  *ImageQualityReason `json:"quality_reason"`
	Merchant       *string             `json:"merchant"`
	Date           *string             `json:"date"`
	Currency       *string             `json:"currency"`
	SubtotalMinor  *int64              `json:"subtotal_minor"`
	DiscountMinor  *int64              `json:"discount_minor"`
	TaxMinor       *int64              `json:"tax_minor"`
	TotalMinor     *int64              `json:"total_minor"`
	Items          []LineItem          `json:"items"`
	Payments       []Payment           `json:"payments"`
}

type LineItem struct {
	Name        *string `json:"name"`
	AmountMinor *int64  `json:"amount_minor"`
}

type Payment struct {
	Method      *string `json:"method"`
	Brand       *string `json:"brand"`
	Issuer      *string `json:"issuer"`
	LastFour    *string `json:"last_four"`
	Label       *string `json:"payment_label"`
	AmountMinor *int64  `json:"amount_minor"`
}

type ResultLimits struct {
	MaxJSONBytes   int
	MaxDocuments   int
	MaxItems       int
	MaxPayments    int
	MaxTextRunes   int
	MaxAmountMinor int64
}

var lastFour = regexp.MustCompile(`^[0-9]{4}$`)

// DecodeResult checks one analyzer response against its original ordered image group.
// A single image can be used by more than one document.
func DecodeResult(raw []byte, group Group, limits ResultLimits) (Result, error) {
	if limits.MaxJSONBytes <= 0 || limits.MaxDocuments <= 0 || limits.MaxItems <= 0 ||
		limits.MaxPayments <= 0 || limits.MaxTextRunes <= 0 || limits.MaxAmountMinor <= 0 {
		return Result{}, errors.New("receipt result limits must be positive")
	}
	imageIDs := make(map[string]bool, len(group.Images))
	for _, image := range group.Images {
		if !identifier.MatchString(image.ID) || imageIDs[image.ID] {
			return Result{}, errors.New("invalid or duplicate analyzer group image ID")
		}
		imageIDs[image.ID] = true
	}
	if len(imageIDs) == 0 {
		return Result{}, errors.New("analyzer group must contain an image")
	}

	var result Result
	if err := decodeStrict(raw, limits.MaxJSONBytes, &result); err != nil {
		return Result{}, fmt.Errorf("receipt result: %w", err)
	}
	if len(result.Documents) == 0 || len(result.Documents) > limits.MaxDocuments {
		return Result{}, errors.New("receipt document count is outside the configured limit")
	}
	for i := range result.Documents {
		document := &result.Documents[i]
		if err := validateDocument(*document, imageIDs, limits); err != nil {
			return Result{}, fmt.Errorf("document %d: %w", i, err)
		}
		if document.Items == nil {
			document.Items = []LineItem{}
		}
		if document.Payments == nil {
			document.Payments = []Payment{}
		}
	}
	return result, nil
}

func validateDocument(document Document, imageIDs map[string]bool, limits ResultLimits) error {
	if len(document.SourceImageIDs) == 0 || len(document.SourceImageIDs) > len(imageIDs) {
		return errors.New("each document must reference at least one image from the group")
	}
	seen := make(map[string]bool, len(document.SourceImageIDs))
	for _, id := range document.SourceImageIDs {
		if !imageIDs[id] || seen[id] {
			return errors.New("document refers to an unknown or repeated source image")
		}
		seen[id] = true
	}

	switch document.Type {
	case ItemizedReceipt, PaymentReceipt, Invoice, CardSalesSlip, ATMStatement, OtherDocument, UnknownDocument:
	default:
		return errors.New("unknown document type")
	}
	switch document.Status {
	case Success, Partial, OutOfScope, Unreadable:
	default:
		return errors.New("unknown document extraction status")
	}
	if document.QualityReason != nil && (document.Status != Unreadable ||
		(*document.QualityReason != QualityBlur && *document.QualityReason != QualityGlare)) {
		return errors.New("quality reason must be known blur or glare on an unreadable document")
	}
	if (document.Type == ATMStatement || document.Type == OtherDocument) &&
		(document.Status == Success || document.Status == Partial) {
		return errors.New("out-of-scope document type cannot contain a receipt extraction")
	}
	if document.Status == Success && (document.Type == UnknownDocument || document.TotalMinor == nil) {
		return errors.New("successful extraction requires a known document type and total")
	}
	if document.Status == OutOfScope || document.Status == Unreadable {
		if document.Merchant != nil || document.Date != nil || document.Currency != nil ||
			document.SubtotalMinor != nil || document.DiscountMinor != nil || document.TaxMinor != nil ||
			document.TotalMinor != nil || len(document.Items) != 0 || len(document.Payments) != 0 {
			return errors.New("out-of-scope or unreadable documents cannot contain extracted details")
		}
		return nil
	}

	if !validText(document.Merchant, limits.MaxTextRunes) {
		return errors.New("invalid merchant text")
	}
	if document.Date != nil {
		date, err := time.Parse(time.DateOnly, *document.Date)
		if err != nil || date.Year() == 0 {
			return errors.New("invalid purchase date")
		}
	}
	if document.Currency != nil && *document.Currency != "JPY" {
		return errors.New("unsupported currency in receipt result")
	}
	for _, amount := range []*int64{document.SubtotalMinor, document.DiscountMinor, document.TaxMinor, document.TotalMinor} {
		if err := validateAmount(amount, document.Currency, limits.MaxAmountMinor); err != nil {
			return err
		}
	}
	if document.DiscountMinor != nil && *document.DiscountMinor < 0 {
		return errors.New("discount must be expressed as a non-negative amount")
	}
	// Printed tax, discounts and subtotal can use different bases. Reconciliation
	// needs explicit evidence about those bases, beyond this extraction contract.

	if len(document.Items) > limits.MaxItems || len(document.Payments) > limits.MaxPayments {
		return errors.New("item or payment count exceeds the configured limit")
	}
	for _, item := range document.Items {
		if !validText(item.Name, limits.MaxTextRunes) {
			return errors.New("invalid item name")
		}
		if err := validateAmount(item.AmountMinor, document.Currency, limits.MaxAmountMinor); err != nil {
			return err
		}
	}
	for _, payment := range document.Payments {
		if err := validatePayment(payment, document.Currency, limits); err != nil {
			return err
		}
	}
	return nil
}

func validatePayment(payment Payment, currency *string, limits ResultLimits) error {
	var card bool
	if payment.Method != nil {
		switch *payment.Method {
		case "credit_card", "debit_card":
			card = true
		case "cash", "e_money", "qr", "points", "other":
		default:
			return errors.New("unknown payment method")
		}
	}
	if payment.LastFour != nil && (!card || !lastFour.MatchString(*payment.LastFour)) {
		return errors.New("last_four must be four ASCII digits from a card payment")
	}
	for _, text := range []*string{payment.Brand, payment.Issuer, payment.Label} {
		if !validText(text, limits.MaxTextRunes) {
			return errors.New("invalid payment text")
		}
	}
	return validateAmount(payment.AmountMinor, currency, limits.MaxAmountMinor)
}

func validateAmount(amount *int64, currency *string, max int64) error {
	if amount == nil {
		return nil
	}
	if currency == nil {
		return errors.New("extracted amounts require a currency")
	}
	if *amount < -max || *amount > max {
		return errors.New("amount exceeds the configured minor-unit range")
	}
	return nil
}

func validText(text *string, maxRunes int) bool {
	return text == nil || (strings.TrimSpace(*text) != "" && utf8.RuneCountInString(*text) <= maxRunes &&
		strings.IndexFunc(*text, unicode.IsControl) == -1)
}
