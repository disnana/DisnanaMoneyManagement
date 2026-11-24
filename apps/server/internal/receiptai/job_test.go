package receiptai

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

var jobTestTime = time.Date(2026, 11, 24, 13, 0, 0, 0, time.UTC)

func queuedJob(t *testing.T) Job {
	t.Helper()
	job, err := NewJob("receipt-1", jobTestTime.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func submittingJob(t *testing.T) Job {
	t.Helper()
	now := jobTestTime
	job, err := queuedJob(t).ClaimSubmission("attempt-1", now, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	job, err = job.BeginSubmission("attempt-1", now.Add(time.Second), now.Add(2*time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func TestConcurrentSubmissionRequiresOneCommittedRevision(t *testing.T) {
	now := jobTestTime
	queued := queuedJob(t)
	claimed, err := queued.ClaimSubmission("shared-attempt", now, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if replay, err := claimed.ClaimSubmission("shared-attempt", now, now.Add(time.Minute)); err != nil || replay != claimed {
		t.Fatalf("claim replay changed state: %v", err)
	}

	// Model two workers reading the same row before either persists its update.
	// This is a CAS simulation. Only the durable store can arbitrate production callers.
	var revision atomic.Int64
	revision.Store(claimed.Revision)
	start := make(chan struct{})
	var writers sync.WaitGroup
	var senders atomic.Int32
	for range 2 {
		writers.Go(func() {
			next, err := claimed.BeginSubmission("shared-attempt", now, now.Add(2*time.Minute))
			if err != nil {
				t.Error(err)
				return
			}
			<-start
			if revision.CompareAndSwap(claimed.Revision, next.Revision) {
				senders.Add(1)
			}
		})
	}
	close(start)
	writers.Wait()
	if got := senders.Load(); got != 1 {
		t.Fatalf("expected one CAS winner, got %d", got)
	}
	if revision.CompareAndSwap(claimed.Revision, claimed.Revision+1) {
		t.Fatal("stale revision committed after the first sender")
	}
}

func TestExpiredClaimAllowsFreshAttemptOnlyBeforeSubmission(t *testing.T) {
	now := jobTestTime
	leaseEnd := now.Add(time.Minute)
	claimed, err := queuedJob(t).ClaimSubmission("attempt-1", now, leaseEnd)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := claimed.ClaimSubmission("attempt-2", now, leaseEnd); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("active claim could be replaced: %v", err)
	}
	if _, err := claimed.BeginSubmission("attempt-1", leaseEnd, leaseEnd.Add(time.Minute)); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("expired claim could send: %v", err)
	}
	if _, err := claimed.ClaimSubmission("attempt-1", leaseEnd, leaseEnd.Add(time.Minute)); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("expired attempt was reused: %v", err)
	}
	taken, err := claimed.ClaimSubmission("attempt-2", leaseEnd, leaseEnd.Add(time.Minute))
	if err != nil || taken.AttemptID != "attempt-2" {
		t.Fatalf("fresh attempt did not take over: %v", err)
	}
	if _, err := taken.BeginSubmission("attempt-1", leaseEnd, leaseEnd.Add(time.Minute)); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("stale attempt could send after takeover: %v", err)
	}
	sending := submittingJob(t)
	if _, err := sending.ClaimSubmission("attempt-2", sending.AcknowledgeUntil, sending.Deadline); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("in-flight attempt was reclaimed: %v", err)
	}
	if _, err := sending.BeginSubmission("attempt-1", now, now.Add(time.Minute)); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("submission could be started twice: %v", err)
	}
}

func TestLostAcknowledgementDoesNotResendAndCanRecoverSameAttempt(t *testing.T) {
	sending := submittingJob(t)
	if _, err := sending.CheckSubmissionDeadline(jobTestTime); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("pending acknowledgement was timed out early: %v", err)
	}
	unknown, err := sending.CheckSubmissionDeadline(sending.AcknowledgeUntil)
	if err != nil || unknown.State != JobSubmissionUnknown {
		t.Fatalf("lost acknowledgement was not recorded: %v", err)
	}
	if updated, err := unknown.MarkSubmissionUnknown("attempt-1"); err != nil || updated != unknown {
		t.Fatalf("replaying the lost acknowledgement changed state: %v", err)
	}
	if _, err := unknown.RecordOutcome("too-early", Outcome{State: JobExpired}, jobTestTime); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("uncertain submission was expired before its deadline: %v", err)
	}
	if _, err := unknown.ClaimSubmission("attempt-2", sending.AcknowledgeUntil, sending.Deadline); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("uncertain submission became eligible for a second send: %v", err)
	}
	if _, err := unknown.RecordProviderID("attempt-2", "resp_late"); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("foreign attempt recovered an unknown submission: %v", err)
	}
	processing, err := unknown.RecordProviderID("attempt-1", "resp_late")
	if err != nil || processing.State != JobProcessing || processing.ProviderID != "resp_late" {
		t.Fatalf("trusted late acknowledgement did not recover: %v", err)
	}
	if replay, err := processing.RecordProviderID("attempt-1", "resp_late"); err != nil || replay != processing {
		t.Fatalf("replayed provider acknowledgement changed state: %v", err)
	}
	if _, err := processing.RecordProviderID("attempt-1", "resp_different"); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("different provider ID replaced the acknowledgement: %v", err)
	}
}

func TestSettlingKeepsEffectIDAndRejectsConflictingOutcome(t *testing.T) {
	processing, err := submittingJob(t).RecordProviderID("attempt-1", "resp_result")
	if err != nil {
		t.Fatal(err)
	}
	outcome := Outcome{State: JobPartial, ResultSHA256: strings.Repeat("a", 64)}
	settling, err := processing.RecordOutcome("settle-1", outcome, jobTestTime)
	if err != nil || settling.State != JobSettling || settling.Outcome != outcome {
		t.Fatalf("outcome was not recorded for settlement: %v", err)
	}
	restarted, err := settling.RecordOutcome("settle-1", outcome, jobTestTime.Add(time.Second))
	if err != nil || restarted != settling || restarted.SettlementID != "settle-1" {
		t.Fatalf("same outcome was not resumable with the existing effect ID: %v", err)
	}
	if _, err := settling.RecordOutcome("settle-2", outcome, jobTestTime); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("settlement ID could be replaced: %v", err)
	}
	conflicting := Outcome{State: JobPartial, ResultSHA256: strings.Repeat("b", 64)}
	if _, err := settling.RecordOutcome("settle-1", conflicting, jobTestTime); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("stored result could be replaced: %v", err)
	}
	if _, err := settling.CompleteSettlement("settle-2"); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("different effect ID finalized settlement: %v", err)
	}
	terminal, err := settling.CompleteSettlement("settle-1")
	if err != nil || terminal.State != JobPartial {
		t.Fatalf("settlement did not become terminal: %v", err)
	}
	if replay, err := terminal.CompleteSettlement("settle-1"); err != nil || replay != terminal {
		t.Fatalf("duplicate completion was not idempotent: %v", err)
	}
	if replay, err := terminal.RecordOutcome("settle-1", outcome, jobTestTime); err != nil || replay != terminal {
		t.Fatalf("duplicate provider outcome changed the terminal state: %v", err)
	}
}

func TestLateAcknowledgementCannotReopenExpiredSettlement(t *testing.T) {
	sending := submittingJob(t)
	unknown, err := sending.MarkSubmissionUnknown("attempt-1")
	if err != nil {
		t.Fatal(err)
	}
	settling, err := unknown.RecordOutcome("expired-1", Outcome{State: JobExpired}, unknown.Deadline)
	if err != nil {
		t.Fatal(err)
	}
	expired, err := settling.CompleteSettlement("expired-1")
	if err != nil || expired.State != JobExpired {
		t.Fatalf("expiration did not finalize: %v", err)
	}
	if _, err := expired.RecordProviderID("attempt-1", "resp_after_expiry"); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("late acknowledgement reopened a settled job: %v", err)
	}
	if _, err := expired.RecordOutcome("after-expiry", Outcome{
		State: JobCompleted, ResultSHA256: strings.Repeat("a", 64),
	}, expired.Deadline); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("late result replaced an expired outcome: %v", err)
	}
}

func TestRecordOutcomeDeadlineCutoff(t *testing.T) {
	processing, err := submittingJob(t).RecordProviderID("attempt-1", "resp_deadline")
	if err != nil {
		t.Fatal(err)
	}
	before := processing.Deadline.Add(-time.Nanosecond)
	after := processing.Deadline.Add(time.Nanosecond)
	expiration := Outcome{State: JobExpired}

	if _, err := processing.RecordOutcome("expiry-1", expiration, before); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("processing job expired before the deadline: %v", err)
	}
	if expired, err := processing.RecordOutcome("expiry-1", expiration, processing.Deadline); err != nil ||
		expired.State != JobSettling || expired.Outcome != expiration {
		t.Fatalf("processing job did not expire at the deadline: %v", err)
	}
	for _, state := range []JobState{JobCompleted, JobPartial} {
		t.Run(string(state), func(t *testing.T) {
			outcome := Outcome{State: state, ResultSHA256: strings.Repeat("a", 64)}
			for _, late := range []time.Time{processing.Deadline, after} {
				if _, err := processing.RecordOutcome("result-1", outcome, late); !errors.Is(err, ErrJobTransition) {
					t.Fatalf("new result was accepted at or after the deadline: %v", err)
				}
			}
			settling, err := processing.RecordOutcome("result-1", outcome, before)
			if err != nil || settling.State != JobSettling {
				t.Fatalf("result was rejected before the deadline: %v", err)
			}
			replayed, err := settling.RecordOutcome("result-1", outcome, after)
			if err != nil || replayed != settling {
				t.Fatalf("journaled result was not replayable after the deadline: %v", err)
			}
			terminal, err := replayed.CompleteSettlement("result-1")
			if err != nil || terminal.State != state {
				t.Fatalf("journaled result could not complete after replay: %v", err)
			}
			if replayed, err := terminal.RecordOutcome("result-1", outcome, after); err != nil || replayed != terminal {
				t.Fatalf("already settled result was not replayable after the deadline: %v", err)
			}
		})
	}
}

func TestStuckSubmissionMustRecoverBeforeExpiry(t *testing.T) {
	sending := submittingJob(t)
	expiration := Outcome{State: JobExpired}
	if _, err := sending.RecordOutcome("expiry-1", expiration, sending.Deadline); !errors.Is(err, ErrJobTransition) {
		t.Fatalf("unacknowledged submission skipped recovery: %v", err)
	}
	unknown, err := sending.CheckSubmissionDeadline(sending.Deadline)
	if err != nil || unknown.State != JobSubmissionUnknown {
		t.Fatalf("stuck submission could not enter unknown state at the deadline: %v", err)
	}
	settling, err := unknown.RecordOutcome("expiry-1", expiration, unknown.Deadline)
	if err != nil || settling.State != JobSettling || settling.Outcome != expiration {
		t.Fatalf("unknown submission could not settle as expired: %v", err)
	}
}
