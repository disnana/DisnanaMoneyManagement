package receiptai

import (
	"errors"
	"regexp"
	"time"
)

type JobState string

const (
	JobQueued            JobState = "QUEUED"
	JobClaimed           JobState = "CLAIMED"
	JobSubmitting        JobState = "SUBMITTING"
	JobSubmissionUnknown JobState = "SUBMISSION_UNKNOWN"
	JobProcessing        JobState = "PROCESSING"
	JobSettling          JobState = "SETTLING"
	JobCompleted         JobState = "COMPLETED"
	JobPartial           JobState = "PARTIAL"
	JobFailed            JobState = "FAILED"
	JobCancelled         JobState = "CANCELLED"
	JobExpired           JobState = "EXPIRED"
)

var (
	ErrJobTransition = errors.New("invalid receipt job transition")
	ErrJobConflict   = errors.New("conflicting receipt job operation")
	providerID       = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$`)
	resultDigest     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// Outcome records the intended terminal state and the digest of any validated result.
// The caller persists result bytes before starting settlement. Error codes contain no provider text.
type Outcome struct {
	State        JobState
	ResultSHA256 string
	ErrorCode    string
}

func (o Outcome) valid() bool {
	switch o.State {
	case JobCompleted, JobPartial:
		return resultDigest.MatchString(o.ResultSHA256) && o.ErrorCode == ""
	case JobFailed:
		return o.ResultSHA256 == "" && identifier.MatchString(o.ErrorCode)
	case JobCancelled, JobExpired:
		return o.ResultSHA256 == "" && (o.ErrorCode == "" || identifier.MatchString(o.ErrorCode))
	default:
		return false
	}
}

// Job is the durable lifecycle of one image group's provider request.
// All transitions are pure. A revision change must be persisted with compare-and-set
// against the original revision. In particular, only a caller whose BeginSubmission
// update commits may send the request. A lost write response may not authorize a send.
type Job struct {
	GroupID          string
	Revision         int64
	State            JobState
	Deadline         time.Time
	AttemptID        string
	ClaimUntil       time.Time
	AcknowledgeUntil time.Time
	ProviderID       string
	SettlementID     string
	Outcome          Outcome
}

func NewJob(groupID string, deadline time.Time) (Job, error) {
	if !identifier.MatchString(groupID) || deadline.IsZero() {
		return Job{}, ErrJobTransition
	}
	return Job{GroupID: groupID, Revision: 1, State: JobQueued, Deadline: deadline.UTC()}, nil
}

// ClaimSubmission reserves the pre-send work. An expired pre-send claim is safe to
// replace with a fresh attempt ID because no sender has entered SUBMITTING.
func (j Job) ClaimSubmission(attemptID string, now, until time.Time) (Job, error) {
	if !identifier.MatchString(attemptID) || now.IsZero() || !now.Before(until) || until.After(j.Deadline) {
		return j, ErrJobTransition
	}
	if j.State == JobClaimed && now.Before(j.ClaimUntil) && attemptID == j.AttemptID && until.Equal(j.ClaimUntil) {
		return j, nil
	}
	if j.State != JobQueued && (j.State != JobClaimed || now.Before(j.ClaimUntil)) {
		return j, ErrJobTransition
	}
	if j.AttemptID == attemptID {
		return j, ErrJobConflict
	}
	j.AttemptID = attemptID
	j.ClaimUntil = until.UTC()
	return j.transition(JobClaimed), nil
}

// BeginSubmission records the point after which the provider may accept the request.
// Repeating this call never grants a second permission to send.
func (j Job) BeginSubmission(attemptID string, now, acknowledgeUntil time.Time) (Job, error) {
	if j.State != JobClaimed || attemptID == "" || attemptID != j.AttemptID ||
		now.IsZero() || !now.Before(j.ClaimUntil) || !now.Before(acknowledgeUntil) ||
		acknowledgeUntil.After(j.Deadline) {
		return j, ErrJobTransition
	}
	j.AcknowledgeUntil = acknowledgeUntil.UTC()
	return j.transition(JobSubmitting), nil
}

// MarkSubmissionUnknown is used when a transport outcome cannot prove acceptance or rejection.
func (j Job) MarkSubmissionUnknown(attemptID string) (Job, error) {
	if attemptID == "" || attemptID != j.AttemptID {
		return j, ErrJobConflict
	}
	if j.State == JobSubmissionUnknown {
		return j, nil
	}
	if j.State != JobSubmitting {
		return j, ErrJobTransition
	}
	return j.transition(JobSubmissionUnknown), nil
}

// CheckSubmissionDeadline is the recovery path if the submitting worker disappeared.
func (j Job) CheckSubmissionDeadline(now time.Time) (Job, error) {
	if j.State == JobSubmissionUnknown {
		return j, nil
	}
	if j.State != JobSubmitting || now.Before(j.AcknowledgeUntil) {
		return j, ErrJobTransition
	}
	return j.MarkSubmissionUnknown(j.AttemptID)
}

// RecordProviderID accepts a trusted acknowledgement for this attempt, including
// a late acknowledgement while the job is still unresolved.
func (j Job) RecordProviderID(attemptID, id string) (Job, error) {
	if attemptID == "" || attemptID != j.AttemptID || !providerID.MatchString(id) {
		return j, ErrJobConflict
	}
	if j.ProviderID != "" {
		if j.ProviderID == id {
			return j, nil
		}
		return j, ErrJobConflict
	}
	if j.State != JobSubmitting && j.State != JobSubmissionUnknown {
		return j, ErrJobTransition
	}
	j.ProviderID = id
	return j.transition(JobProcessing), nil
}

// RecordOutcome freezes the settlement ID and the provider outcome. New results
// must be recorded before the deadline, and expiration is allowed from the deadline.
// An exact replay of a journaled outcome remains valid after the deadline.
// During SUBMITTING, only a definitive rejection can start settlement.
func (j Job) RecordOutcome(settlementID string, outcome Outcome, now time.Time) (Job, error) {
	if !identifier.MatchString(settlementID) || !outcome.valid() || now.IsZero() {
		return j, ErrJobTransition
	}
	if j.SettlementID != "" {
		if j.SettlementID == settlementID && j.Outcome == outcome {
			return j, nil
		}
		return j, ErrJobConflict
	}
	beforeDeadline := now.Before(j.Deadline)
	switch outcome.State {
	case JobCompleted, JobPartial:
		if !beforeDeadline {
			return j, ErrJobTransition
		}
	case JobExpired:
		if beforeDeadline {
			return j, ErrJobTransition
		}
	}
	switch j.State {
	case JobQueued, JobClaimed:
		if outcome.State != JobCancelled && outcome.State != JobExpired {
			return j, ErrJobTransition
		}
	case JobSubmitting:
		if outcome.State != JobFailed {
			return j, ErrJobTransition
		}
	case JobSubmissionUnknown:
		if outcome.State != JobExpired {
			return j, ErrJobTransition
		}
	case JobProcessing:
	default:
		return j, ErrJobTransition
	}
	j.SettlementID = settlementID
	j.Outcome = outcome
	return j.transition(JobSettling), nil
}

// CompleteSettlement is called after the durable settlement using the same ID succeeds.
func (j Job) CompleteSettlement(settlementID string) (Job, error) {
	if settlementID == "" || j.SettlementID != settlementID {
		return j, ErrJobConflict
	}
	if j.State == j.Outcome.State {
		return j, nil
	}
	if j.State != JobSettling || !j.Outcome.valid() {
		return j, ErrJobTransition
	}
	return j.transition(j.Outcome.State), nil
}

func (j Job) transition(state JobState) Job {
	j.State = state
	j.Revision++
	return j
}
