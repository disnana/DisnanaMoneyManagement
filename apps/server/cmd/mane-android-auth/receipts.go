package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/disnana/dmm/server/internal/credits"
	"github.com/disnana/dmm/server/internal/receiptai"
	"github.com/gocql/gocql"
)

func openReceipts(ctx context.Context, wallet *credits.Wallet) (*receiptai.Runtime, error) {
	if wallet == nil {
		return nil, errors.New("AI receipts require Scylla")
	}
	apiKey := strings.TrimSpace(os.Getenv("MANE_RECEIPT_OPENAI_API_KEY"))
	if apiKey == "" {
		return nil, errors.New("MANE_RECEIPT_OPENAI_API_KEY is required")
	}
	unit, err := strconv.ParseInt(os.Getenv("MANE_RECEIPT_CREDITS_PER_IMAGE"), 10, 64)
	if err != nil || unit <= 0 || unit > 1000 {
		return nil, errors.New("MANE_RECEIPT_CREDITS_PER_IMAGE must be a positive staging tariff")
	}
	retention, err := time.ParseDuration(os.Getenv("MANE_RECEIPT_RESULT_RETENTION"))
	if err != nil || retention < time.Second {
		return nil, errors.New("MANE_RECEIPT_RESULT_RETENTION must be at least 1s")
	}
	priceVersion := os.Getenv("MANE_RECEIPT_PRICE_VERSION")
	if priceVersion == "" {
		return nil, errors.New("MANE_RECEIPT_PRICE_VERSION is required")
	}
	// These bounded inputs are the Standard staging profile, not the production
	// tariff or a promise to accept a maximum-size image on every connection.
	limits := receiptai.RequestLimits{
		MaxJSONBytes:       4 << 20,
		MaxGroups:          4,
		MaxImagesPerGroup:  4,
		MaxTotalImages:     4,
		MaxImageBytes:      2 << 20,
		MaxTotalImageBytes: 3 << 20,
		MaxImagePixels:     12_000_000,
	}
	luna, err := receiptai.NewLuna(&http.Client{}, func(context.Context) (string, error) { return apiKey, nil }, receiptai.LunaConfig{
		Model: os.Getenv("MANE_RECEIPT_OPENAI_MODEL"), ReasoningEffort: os.Getenv("MANE_RECEIPT_REASONING_EFFORT"),
		Timeout: 45 * time.Second, MaxOutputTokens: 4096, MaxRequestBytes: 5 << 20, MaxResponseBytes: 512 << 10,
		ResultLimits: receiptai.ResultLimits{MaxJSONBytes: 128 << 10, MaxDocuments: 16, MaxItems: 200,
			MaxPayments: 20, MaxTextRunes: 256, MaxAmountMinor: 1_000_000_000},
	})
	if err != nil {
		return nil, err
	}
	store, err := receiptai.NewScyllaJobs(wallet.Session(), 1<<20)
	if err != nil {
		return nil, err
	}
	service, err := receiptai.NewService(store, wallet, luna, limits)
	if err != nil {
		return nil, err
	}
	modes, err := deferredReceiptModes(luna)
	if err != nil {
		return nil, err
	}
	runtime, err := receiptai.NewRuntime(service, wallet.Session(), receiptai.RuntimeConfig{
		PriceVersion: priceVersion, CreditPerImage: unit, JobTimeout: 20 * time.Minute, ResultRetention: retention,
		ClaimDuration: 10 * time.Second, AcknowledgeTimeout: 55 * time.Second,
		PollInterval: 3 * time.Second, PollBatchSize: 16, Modes: modes,
	})
	if err != nil {
		return nil, err
	}
	// Validate the three tables with the same consistency as the live job runner.
	// These reads also let --check-config catch a missing migration.
	var revision int64
	err = wallet.Session().Query(
		"SELECT revision FROM receipt_ai_jobs WHERE subject = ? AND request_id = ?", "config-check", "config-check",
	).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&revision)
	if err != nil && !errors.Is(err, gocql.ErrNotFound) {
		return nil, errors.New("cannot read receipt_ai_jobs at LOCAL_QUORUM")
	}
	var shard int
	err = wallet.Session().Query(
		"SELECT shard FROM receipt_ai_pending WHERE shard = ? AND subject = ? AND request_id = ?", 0, "config-check", "config-check",
	).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&shard)
	if err != nil && !errors.Is(err, gocql.ErrNotFound) {
		return nil, errors.New("cannot read receipt_ai_pending at LOCAL_QUORUM")
	}
	err = wallet.Session().Query(
		"SELECT shard FROM receipt_ai_result_expiry WHERE shard = ? LIMIT 1", 0,
	).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&shard)
	if err != nil && !errors.Is(err, gocql.ErrNotFound) {
		return nil, errors.New("cannot read receipt_ai_result_expiry at LOCAL_QUORUM")
	}
	return runtime, nil
}

// Deferred modes are offered only when their independently versioned staging
// tariff is configured. Their public mode IDs do not expose the provider tier.
func deferredReceiptModes(luna *receiptai.Luna) ([]receiptai.RuntimeModeConfig, error) {
	var modes []receiptai.RuntimeModeConfig
	for _, option := range []struct {
		mode, profile, envPrefix string
		wait, interval           time.Duration
	}{
		{receiptai.ModeBackground, receiptai.LunaBackground2h, "MANE_RECEIPT_BACKGROUND", 2 * time.Hour, time.Minute},
		{receiptai.ModeBatch, receiptai.LunaBatch24h, "MANE_RECEIPT_BATCH", 24 * time.Hour, 5 * time.Minute},
	} {
		version := os.Getenv(option.envPrefix + "_PRICE_VERSION")
		unitValue := os.Getenv(option.envPrefix + "_MILLICREDITS_PER_IMAGE")
		if version == "" && unitValue == "" {
			continue
		}
		unit, err := strconv.ParseInt(unitValue, 10, 64)
		if version == "" || err != nil || unit <= 0 || unit > 1_000_000 {
			return nil, fmt.Errorf("%s requires a price version and positive millicredits per image", option.envPrefix)
		}
		if option.mode == receiptai.ModeBackground {
			switch os.Getenv("MANE_RECEIPT_BACKGROUND_WINDOW") {
			case "", "2h":
			case "8h":
				option.profile, option.wait = receiptai.LunaBackground8h, 8*time.Hour
			default:
				return nil, errors.New("MANE_RECEIPT_BACKGROUND_WINDOW must be 2h or 8h")
			}
		}
		analyzer, err := receiptai.NewLunaDeferred(luna, option.profile)
		if err != nil {
			return nil, err
		}
		modes = append(modes, receiptai.RuntimeModeConfig{ID: option.mode, ProviderProfile: option.profile,
			PriceVersion: version, MillicreditsPerImage: unit, MaxWait: option.wait, PollInterval: option.interval,
			Analyzer: analyzer,
		})
	}
	return modes, nil
}
