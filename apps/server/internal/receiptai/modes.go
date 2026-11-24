package receiptai

import (
	"context"
	"errors"
	"math"
	"time"
)

const (
	ModeStandard   = "standard"
	ModeBackground = "background"
	ModeBatch      = "batch"
)

type AsyncAnalyzer interface {
	Submit(context.Context, Group) (LunaResponse, error)
	Poll(context.Context, string, Group, string) (LunaResponse, error)
}

type RuntimeModeConfig struct {
	ID                   string
	PriceVersion         string
	ProviderProfile      string
	MillicreditsPerImage int64
	MaxWait              time.Duration
	PollInterval         time.Duration
	Analyzer             AsyncAnalyzer
}

type ModeView struct {
	ID                   string `json:"id"`
	PriceVersion         string `json:"price_version"`
	MillicreditsPerImage int64  `json:"millicredits_per_image"`
	MaxWaitSeconds       int64  `json:"max_wait_seconds"`
}

func receiptMode(mode string) string {
	if mode == "" {
		return ModeStandard
	}
	return mode
}

func validMode(mode string) bool {
	switch receiptMode(mode) {
	case ModeStandard, ModeBackground, ModeBatch:
		return true
	default:
		return false
	}
}

func (r *Runtime) mode(id string) (RuntimeModeConfig, bool) {
	if receiptMode(id) == ModeStandard {
		return RuntimeModeConfig{
			ID: ModeStandard, PriceVersion: r.config.PriceVersion, MillicreditsPerImage: r.config.CreditPerImage * 1_000,
			MaxWait: r.config.JobTimeout,
		}, true
	}
	for _, mode := range r.config.Modes {
		if mode.ID == id {
			return mode, true
		}
	}
	return RuntimeModeConfig{}, false
}

func priceImages(count int, unit int64) (int64, error) {
	if count < 0 || unit <= 0 || int64(count) > math.MaxInt64/unit {
		return 0, ErrReceiptQuote
	}
	sum := int64(count) * unit
	whole := sum / 1_000
	if sum%1_000 != 0 {
		whole++
	}
	return whole, nil
}

type providerAborter interface {
	Abort(context.Context, string) error
}

type providerCleaner interface {
	Cleanup(context.Context, string) error
}

func needsProviderCleanup(job ReceiptJob) bool {
	if receiptMode(job.Intake.Mode) == ModeStandard {
		return false
	}
	for _, group := range job.Groups {
		if group.Job.ProviderID != "" && !group.Job.ProviderCleanupDone {
			return true
		}
	}
	return false
}

func (r *Runtime) cleanupProvider(ctx context.Context, key JobKey, job ReceiptJob) (bool, error) {
	mode, enabled := r.mode(job.Intake.Mode)
	if !enabled || mode.Analyzer == nil {
		// Retain only the recovery key until the mode's adapter is available again.
		return false, nil
	}
	done := true
	for _, group := range job.Groups {
		part := group.Job
		if part.ProviderID == "" || part.ProviderCleanupDone {
			continue
		}
		claimed, err := r.updateProviderCleanup(ctx, key, part.GroupID, false, mode.PollInterval)
		if err != nil {
			return false, err
		}
		if !claimed {
			done = false
			continue
		}
		if aborter, ok := mode.Analyzer.(providerAborter); ok && (part.State == JobExpired || part.State == JobCancelled) {
			if err := aborter.Abort(ctx, part.ProviderID); err != nil {
				if errors.Is(err, ErrLunaPollRetry) {
					return false, nil
				}
				return false, err
			}
		}
		if cleaner, ok := mode.Analyzer.(providerCleaner); ok {
			if err := cleaner.Cleanup(ctx, part.ProviderID); err != nil {
				if errors.Is(err, ErrLunaPollRetry) {
					return false, nil
				}
				return false, err
			}
		}
		if _, err := r.updateProviderCleanup(ctx, key, part.GroupID, true, 0); err != nil {
			return false, err
		}
	}
	return done, nil
}

func (r *Runtime) updateProviderCleanup(ctx context.Context, key JobKey, groupID string, done bool, interval time.Duration) (bool, error) {
	for range 4 {
		job, err := r.service.store.load(ctx, key)
		if err != nil {
			return false, err
		}
		index, err := job.group(groupID)
		if err != nil || !job.Settled {
			return false, ErrJobTransition
		}
		group := job.Groups[index]
		now := r.service.now()
		if group.Job.ProviderID == "" || group.Job.ProviderCleanupDone || (!done && now.Before(group.Job.NextPollAt)) {
			return false, nil
		}
		group.Job.ProviderCleanupDone = done
		if !done {
			group.Job.NextPollAt = now.Add(interval).UTC()
		}
		group.Job.Revision++
		previous := job.Revision
		job.Revision++
		job.Groups = append([]SavedGroup(nil), job.Groups...)
		job.Groups[index] = group
		applied, err := r.service.store.replace(ctx, key, previous, job)
		if err != nil || applied {
			return applied, err
		}
	}
	return false, ErrJobConflict
}

func (r *Runtime) markDeferredCleanupPrepared(ctx context.Context, key JobKey) error {
	for range 4 {
		job, err := r.service.store.load(ctx, key)
		if err != nil || job.DeferredCleanupPrepared {
			return err
		}
		if !job.Settled {
			return ErrJobTransition
		}
		previous := job.Revision
		job.DeferredCleanupPrepared = true
		job.Revision++
		applied, err := r.service.store.replace(ctx, key, previous, job)
		if err != nil || applied {
			return err
		}
	}
	return ErrJobConflict
}
