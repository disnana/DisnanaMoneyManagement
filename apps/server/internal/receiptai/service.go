package receiptai

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

type receiptRepository interface {
	putIfAbsent(context.Context, JobKey, ReceiptJob) (bool, error)
	load(context.Context, JobKey) (ReceiptJob, error)
	replace(context.Context, JobKey, int64, ReceiptJob) (bool, error)
}

type ReceiptCredits interface {
	Reserve(ctx context.Context, subject, id string, amount int64) error
	Settle(ctx context.Context, subject, id string, used int64) error
	AbortReservation(ctx context.Context, subject, id string) error
}

type StandardAnalyzer interface {
	Analyze(context.Context, Group) (LunaResponse, error)
}

// Service coordinates durable intake, Standard analysis and settlement. The
// caller supplies the approved quote and derives the amount from its versioned tariff.
type Service struct {
	store    receiptRepository
	credits  ReceiptCredits
	analyzer StandardAnalyzer
	limits   RequestLimits
	now      func() time.Time
}

func NewService(store *ScyllaJobs, credits ReceiptCredits, analyzer StandardAnalyzer, limits RequestLimits) (*Service, error) {
	if store == nil || credits == nil || analyzer == nil {
		return nil, errors.New("receipt job store, credits and analyzer are required")
	}
	return &Service{store: store, credits: credits, analyzer: analyzer, limits: limits, now: time.Now}, nil
}

// AcceptDurableInput is invoked after the trusted intake layer has stored the
// original request in shared storage and verified consent for the quote. The same
// account, request ID and exact bytes must be used on retry.
func (s *Service) AcceptDurableInput(ctx context.Context, key JobKey, intake ReceiptIntake, raw []byte) (ReceiptJob, error) {
	if !key.valid() || intake.BodySHA256 != digestString(raw) {
		return ReceiptJob{}, ErrJobConflict
	}
	request, err := DecodeRequest(raw, s.limits)
	if err != nil {
		return ReceiptJob{}, err
	}
	candidate, err := newReceiptJob(intake, request.Groups)
	if err != nil {
		return ReceiptJob{}, err
	}
	current, err := s.store.load(ctx, key)
	if errors.Is(err, ErrReceiptNotFound) {
		if !s.now().Before(intake.Deadline) {
			return ReceiptJob{}, ErrJobTransition
		}
		inserted, insertErr := s.store.putIfAbsent(ctx, key, candidate)
		if insertErr != nil {
			return ReceiptJob{}, insertErr
		}
		if inserted {
			current, err = candidate, nil
		} else {
			current, err = s.store.load(ctx, key)
		}
	}
	for i := 0; i < 4; i++ {
		if err != nil {
			return ReceiptJob{}, err
		}
		if current.Intake.BodySHA256 != intake.BodySHA256 || !sameGroupInputs(current.Groups, candidate.Groups) {
			return ReceiptJob{}, ErrJobConflict
		}
		if current.Accepted {
			return current, nil
		}
		if current.Abandoned || !s.now().Before(current.Intake.Deadline) {
			return ReceiptJob{}, ErrJobTransition
		}
		// Both a crash and an uncertain reserve response are recovered under the
		// same wallet ID. Work is eligible only after the accepted row is written.
		if err := s.credits.Reserve(ctx, key.Subject, key.RequestID, current.Intake.MaximumCredit); err != nil {
			return ReceiptJob{}, err
		}
		next := current.accept()
		changed, err := s.store.replace(ctx, key, current.Revision, next)
		if err != nil {
			return ReceiptJob{}, err
		}
		if changed {
			return next, nil
		}
		current, err = s.store.load(ctx, key)
	}
	return ReceiptJob{}, ErrJobConflict
}

func sameGroupInputs(a, b []SavedGroup) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].InputSHA256 != b[i].InputSHA256 {
			return false
		}
	}
	return true
}

type groupUpdate func(Job) (Job, string, error)

func (s *Service) changeGroup(ctx context.Context, key JobKey, groupID, digest string, update groupUpdate) error {
	for i := 0; i < 4; i++ {
		receipt, err := s.store.load(ctx, key)
		if err != nil {
			return err
		}
		index, err := receipt.group(groupID)
		if err != nil {
			return err
		}
		entry := receipt.Groups[index]
		if !receipt.Accepted || (digest != "" && entry.InputSHA256 != digest) {
			return ErrJobConflict
		}
		job, result, err := update(entry.Job)
		if err != nil || job.Revision == entry.Job.Revision {
			return err
		}
		next, err := receipt.updateGroup(index, job, result)
		if err != nil {
			return err
		}
		applied, err := s.store.replace(ctx, key, receipt.Revision, next)
		if err != nil || applied {
			return err
		}
	}
	return ErrJobConflict
}

// RunStandardGroup allows the provider request only after an acknowledged CAS
// into SUBMITTING. If the CAS status is uncertain it stops without sending.
func (s *Service) RunStandardGroup(ctx context.Context, key JobKey, input Group, attemptID string, claimUntil, acknowledgeUntil time.Time) error {
	if !key.valid() {
		return ErrJobTransition
	}
	digest, err := groupDigest(input)
	if err != nil {
		return err
	}
	if err := s.changeGroup(ctx, key, input.ID, digest, func(job Job) (Job, string, error) {
		next, err := job.ClaimSubmission(attemptID, s.now(), claimUntil)
		return next, "", err
	}); err != nil {
		return err
	}
	if err := s.changeGroup(ctx, key, input.ID, digest, func(job Job) (Job, string, error) {
		next, err := job.BeginSubmission(attemptID, s.now(), acknowledgeUntil)
		return next, "", err
	}); err != nil {
		return err
	}

	response, err := s.analyzer.Analyze(ctx, input)
	if err == nil && response.ProviderID == "" {
		err = ErrLunaSubmissionUnknown
	}
	if response.ProviderID != "" {
		if ackErr := s.changeGroup(ctx, key, input.ID, digest, func(job Job) (Job, string, error) {
			next, err := job.RecordProviderID(attemptID, response.ProviderID)
			return next, "", err
		}); ackErr != nil {
			return ackErr
		}
	}
	if err != nil && response.ProviderID == "" && !errors.Is(err, ErrLunaBeforeSend) && !errors.Is(err, ErrLunaRejected) {
		return s.changeGroup(ctx, key, input.ID, digest, func(job Job) (Job, string, error) {
			next, err := job.MarkSubmissionUnknown(attemptID)
			return next, "", err
		})
	}
	outcome := Outcome{State: JobFailed, ErrorCode: "provider_failed"}
	var payload []byte
	if err == nil {
		payload, err = json.Marshal(response.Result)
		if err != nil {
			return err
		}
		outcome = Outcome{State: resultState(input, response.Result), ResultSHA256: digestString(payload)}
	}
	return s.changeGroup(ctx, key, input.ID, digest, func(job Job) (Job, string, error) {
		next, err := job.RecordOutcome(attemptID, outcome, s.now())
		return next, string(payload), err
	})
}

func resultState(group Group, result Result) JobState {
	covered := make(map[string]bool, len(group.Images))
	for _, document := range result.Documents {
		if document.Status == Partial {
			return JobPartial
		}
		for _, id := range document.SourceImageIDs {
			covered[id] = true
		}
	}
	if len(covered) < len(group.Images) {
		return JobPartial
	}
	return JobCompleted
}

// RecoverExpiredIntake frees a possibly committed hold for a request whose
// acceptance never completed. The job CAS prevents acceptance, and the wallet's
// tombstone prevents a concurrent or delayed Reserve from leaving a new hold.
func (s *Service) RecoverExpiredIntake(ctx context.Context, key JobKey) error {
	if !key.valid() {
		return ErrJobTransition
	}
	for i := 0; i < 4; i++ {
		current, err := s.store.load(ctx, key)
		if err != nil {
			return err
		}
		if current.Accepted {
			return ErrJobTransition
		}
		if current.Settled {
			return nil
		}
		now := s.now()
		if now.Before(current.Intake.Deadline) {
			return ErrJobTransition
		}
		staged := current
		if !staged.Abandoned {
			staged.Abandoned = true
			staged.Revision++
			applied, err := s.store.replace(ctx, key, current.Revision, staged)
			if err != nil {
				return err
			}
			if !applied {
				continue
			}
		}
		if err := s.credits.AbortReservation(ctx, key.Subject, key.RequestID); err != nil {
			return err
		}
		next := staged
		next.Groups = append([]SavedGroup(nil), staged.Groups...)
		for i := range next.Groups {
			job, err := next.Groups[i].Job.RecordOutcome("expired", Outcome{State: JobExpired}, now)
			if err != nil {
				return err
			}
			next.Groups[i].Job, err = job.CompleteSettlement(job.SettlementID)
			if err != nil {
				return err
			}
		}
		var released int64
		next.FinalCredit = &released
		next.Settled = true
		next.Revision++
		applied, err := s.store.replace(ctx, key, staged.Revision, next)
		if err != nil || applied {
			return err
		}
	}
	return ErrJobConflict
}

// SettleReceipt journals the final amount before invoking the wallet. On a lost
// acknowledgement, retry with the same key and amount. An amount from another
// tariff or worker cannot overwrite the journal.
func (s *Service) SettleReceipt(ctx context.Context, key JobKey, used int64) (ReceiptJob, error) {
	if !key.valid() {
		return ReceiptJob{}, ErrJobTransition
	}
	for i := 0; i < 4; i++ {
		current, err := s.store.load(ctx, key)
		if err != nil {
			return ReceiptJob{}, err
		}
		staged, err := current.stageSettlement(used)
		if err != nil || staged.Settled {
			return staged, err
		}
		if staged.Revision != current.Revision {
			applied, err := s.store.replace(ctx, key, current.Revision, staged)
			if err != nil {
				return ReceiptJob{}, err
			}
			if !applied {
				continue
			}
		}
		if err := s.credits.Settle(ctx, key.Subject, key.RequestID, *staged.FinalCredit); err != nil {
			return ReceiptJob{}, err
		}
		final, err := staged.finishSettlement(s.now())
		if err != nil {
			return ReceiptJob{}, err
		}
		applied, err := s.store.replace(ctx, key, staged.Revision, final)
		if err != nil {
			return ReceiptJob{}, err
		}
		if applied {
			return final, nil
		}
	}
	return ReceiptJob{}, ErrJobConflict
}

// RecoverGroup moves an unacknowledged send to UNKNOWN. It never submits a
// provider request. At the request deadline it journals an expiry for settlement.
func (s *Service) RecoverGroup(ctx context.Context, key JobKey, groupID string) error {
	if !key.valid() || !identifier.MatchString(groupID) {
		return ErrJobTransition
	}
	if err := s.changeGroup(ctx, key, groupID, "", func(job Job) (Job, string, error) {
		now := s.now()
		if job.State != JobSubmitting || now.Before(job.AcknowledgeUntil) {
			return job, "", nil
		}
		next, err := job.CheckSubmissionDeadline(now)
		return next, "", err
	}); err != nil {
		return err
	}
	return s.changeGroup(ctx, key, groupID, "", func(job Job) (Job, string, error) {
		now := s.now()
		if now.Before(job.Deadline) || job.SettlementID != "" || job.State == JobSubmitting {
			return job, "", nil
		}
		next, err := job.RecordOutcome("expired", Outcome{State: JobExpired}, now)
		return next, "", err
	})
}
