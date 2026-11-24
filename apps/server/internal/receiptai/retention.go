package receiptai

import (
	"context"
	"errors"
	"time"

	"github.com/gocql/gocql"
)

type resultExpiryEntry struct {
	Key       JobKey
	ExpiresAt time.Time
}

type resultExpiryIndex interface {
	schedule(context.Context, resultExpiryEntry) error
	due(context.Context, int, time.Time, int) ([]resultExpiryEntry, error)
	remove(context.Context, resultExpiryEntry) error
}

// CQL timestamps have millisecond precision. Round up to keep the full
// configured window and use the same value in the job and expiry index.
func resultExpiry(now time.Time, retention time.Duration) time.Time {
	target := now.Add(retention).UTC()
	rounded := target.Truncate(time.Millisecond)
	if rounded.Before(target) {
		rounded = rounded.Add(time.Millisecond)
	}
	return rounded
}

func (r *Runtime) cleanSettledInput(ctx context.Context, key JobKey, job ReceiptJob, allowProvider bool) error {
	if job.hasResults() && !job.ResultExpired && !job.DeferredCleanupPrepared {
		var err error
		if job.ResultExpiresAt.IsZero() {
			_, err = r.adoptLegacyResults(ctx, key, job)
		} else {
			err = r.results.schedule(ctx, resultExpiryEntry{Key: key, ExpiresAt: job.ResultExpiresAt})
		}
		if err != nil {
			return err
		}
	}
	if needsProviderCleanup(job) {
		// Keep the recovery key after discarding uploaded images. Batch cleanup
		// needs only the acknowledged provider ID recorded in the settled job.
		if !job.DeferredCleanupPrepared {
			if err := r.queue.clearBody(ctx, key); err != nil {
				return err
			}
			if err := r.markDeferredCleanupPrepared(ctx, key); err != nil {
				return err
			}
		}
		if !allowProvider {
			return nil
		}
		done, err := r.cleanupProvider(ctx, key, job)
		if err != nil || !done {
			return err
		}
	}
	// The pending row is the recovery index until the result expiry index is durable.
	return r.queue.remove(ctx, key)
}

// Old settled jobs may have no retention metadata or pending entry. Give them
// a complete configured window on the first authenticated read or pending scan.
// Index first so a lost CAS response does not strand a successful expiry assignment.
func (r *Runtime) adoptLegacyResults(ctx context.Context, key JobKey, job ReceiptJob) (ReceiptJob, error) {
	for range 4 {
		if !job.Settled || !job.hasResults() || !job.ResultExpiresAt.IsZero() {
			return job, nil
		}
		next := job
		next.ResultExpiresAt = resultExpiry(r.service.now(), r.config.ResultRetention)
		next.Revision++
		if err := r.results.schedule(ctx, resultExpiryEntry{Key: key, ExpiresAt: next.ResultExpiresAt}); err != nil {
			return ReceiptJob{}, err
		}
		applied, err := r.service.store.replace(ctx, key, job.Revision, next)
		if err != nil {
			return ReceiptJob{}, err
		}
		if applied {
			return next, nil
		}
		job, err = r.service.store.load(ctx, key)
		if err != nil {
			return ReceiptJob{}, err
		}
	}
	return ReceiptJob{}, ErrJobConflict
}

func (r *Runtime) pollResultExpiry(ctx context.Context) error {
	var operationErr error
	for shard := range receiptQueueShards {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		entries, err := r.results.due(ctx, shard, r.service.now(), r.config.PollBatchSize)
		if err != nil {
			operationErr = err
			continue
		}
		for _, entry := range entries {
			if err := r.expireResult(ctx, entry); err != nil {
				operationErr = err
			}
		}
	}
	return operationErr
}

func (r *Runtime) expireResult(ctx context.Context, entry resultExpiryEntry) error {
	for range 4 {
		job, err := r.service.store.load(ctx, entry.Key)
		if errors.Is(err, ErrReceiptNotFound) {
			return r.results.remove(ctx, entry)
		}
		if err != nil {
			return err
		}
		if !job.Settled {
			// An unsettled result is never removed even if an inconsistent
			// expiry record exists. A later settlement sets its own expiry.
			return r.results.remove(ctx, entry)
		}
		if job.ResultExpiresAt.IsZero() && job.hasResults() {
			job, err = r.adoptLegacyResults(ctx, entry.Key, job)
			if err != nil {
				return err
			}
		}
		if !job.ResultExpiresAt.Equal(entry.ExpiresAt) || job.ResultExpired {
			// Concurrent legacy adoption can stage more than one candidate.
			return r.results.remove(ctx, entry)
		}
		next, err := job.clearExpiredResults(r.service.now())
		if err != nil {
			return err
		}
		applied, err := r.service.store.replace(ctx, entry.Key, job.Revision, next)
		if err != nil {
			return err
		}
		if applied {
			return r.results.remove(ctx, entry)
		}
	}
	return ErrJobConflict
}

type scyllaResultExpiry struct{ db *gocql.Session }

func (s scyllaResultExpiry) schedule(ctx context.Context, entry resultExpiryEntry) error {
	return s.db.Query("INSERT INTO receipt_ai_result_expiry (shard, expires_at, subject, request_id) VALUES (?, ?, ?, ?)",
		shardFor(entry.Key), entry.ExpiresAt, entry.Key.Subject, entry.Key.RequestID).
		WithContext(ctx).Consistency(gocql.LocalQuorum).Idempotent(true).Exec()
}

func (s scyllaResultExpiry) due(ctx context.Context, shard int, now time.Time, limit int) ([]resultExpiryEntry, error) {
	rows := s.db.Query("SELECT expires_at, subject, request_id FROM receipt_ai_result_expiry WHERE shard = ? AND expires_at <= ? LIMIT ?",
		shard, now, limit).WithContext(ctx).Consistency(gocql.LocalQuorum).PageSize(limit).Iter()
	var entry resultExpiryEntry
	due := make([]resultExpiryEntry, 0, limit)
	for rows.Scan(&entry.ExpiresAt, &entry.Key.Subject, &entry.Key.RequestID) {
		due = append(due, entry)
	}
	return due, rows.Close()
}

func (s scyllaResultExpiry) remove(ctx context.Context, entry resultExpiryEntry) error {
	return s.db.Query("DELETE FROM receipt_ai_result_expiry WHERE shard = ? AND expires_at = ? AND subject = ? AND request_id = ?",
		shardFor(entry.Key), entry.ExpiresAt, entry.Key.Subject, entry.Key.RequestID).
		WithContext(ctx).Consistency(gocql.LocalQuorum).Idempotent(true).Exec()
}
