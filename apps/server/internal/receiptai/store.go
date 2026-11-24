package receiptai

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
	"unicode/utf8"

	"github.com/gocql/gocql"
)

var ErrReceiptNotFound = errors.New("receipt job not found")

// JobKey is scoped to the authenticated account. RequestID must stay the same
// across retries to another node.
type JobKey struct {
	Subject   string
	RequestID string
}

type ReceiptIntake struct {
	BodySHA256    string
	PriceVersion  string
	MaximumCredit int64
	Deadline      time.Time
}

type SavedGroup struct {
	Job         Job
	InputSHA256 string
	// Result is the JSON encoding of the validated output. It is committed in
	// the same revision as the transition to SETTLING.
	Result string
}

// ReceiptJob groups the states and immutable quote for one accepted upload. Actual
// input images are kept separately so that image retention can be enforced.
type ReceiptJob struct {
	Revision    int64
	Intake      ReceiptIntake
	Accepted    bool
	Abandoned   bool
	FinalCredit *int64
	Settled     bool
	Groups      []SavedGroup
}

func newReceiptJob(intake ReceiptIntake, groups []Group) (ReceiptJob, error) {
	if !resultDigest.MatchString(intake.BodySHA256) || !identifier.MatchString(intake.PriceVersion) ||
		intake.MaximumCredit <= 0 || intake.Deadline.IsZero() || len(groups) == 0 {
		return ReceiptJob{}, ErrJobTransition
	}
	intake.Deadline = intake.Deadline.UTC()
	receipt := ReceiptJob{Revision: 1, Intake: intake, Groups: make([]SavedGroup, 0, len(groups))}
	seen := make(map[string]bool, len(groups))
	for _, input := range groups {
		id := input.ID
		if seen[id] {
			return ReceiptJob{}, ErrJobConflict
		}
		group, err := NewJob(id, intake.Deadline)
		if err != nil {
			return ReceiptJob{}, err
		}
		digest, err := groupDigest(input)
		if err != nil {
			return ReceiptJob{}, err
		}
		seen[id] = true
		receipt.Groups = append(receipt.Groups, SavedGroup{Job: group, InputSHA256: digest})
	}
	return receipt, nil
}

func (j ReceiptJob) accept() ReceiptJob {
	j.Accepted = true
	j.Revision++
	return j
}

func (j ReceiptJob) group(groupID string) (int, error) {
	for i, group := range j.Groups {
		if group.Job.GroupID == groupID {
			return i, nil
		}
	}
	return 0, ErrReceiptNotFound
}

// updateGroup returns a revision suitable for CAS, leaving the loaded snapshot
// intact. Result bytes must match the outcome and are immutable after recording.
func (j ReceiptJob) updateGroup(index int, next Job, result string) (ReceiptJob, error) {
	if !j.Accepted || j.FinalCredit != nil || index < 0 || index >= len(j.Groups) {
		return j, ErrJobTransition
	}
	previous := j.Groups[index]
	if next.GroupID != previous.Job.GroupID || !next.Deadline.Equal(j.Intake.Deadline) ||
		next.Revision != previous.Job.Revision+1 {
		return j, ErrJobConflict
	}
	if len(result) == 0 {
		result = previous.Result
	}
	if previous.Result != "" && previous.Result != result {
		return j, ErrJobConflict
	}
	if next.Outcome.ResultSHA256 != "" {
		if !json.Valid([]byte(result)) {
			return j, ErrJobTransition
		}
		if digestString([]byte(result)) != next.Outcome.ResultSHA256 {
			return j, ErrJobConflict
		}
	} else if len(result) != 0 {
		return j, ErrJobTransition
	}
	j.Groups = append([]SavedGroup(nil), j.Groups...)
	j.Groups[index] = SavedGroup{Job: next, InputSHA256: previous.InputSHA256, Result: result}
	j.Revision++
	return j, nil
}

func (j ReceiptJob) stageSettlement(used int64) (ReceiptJob, error) {
	if !j.Accepted || used < 0 || used > j.Intake.MaximumCredit {
		return j, ErrJobTransition
	}
	if j.FinalCredit != nil {
		if *j.FinalCredit != used {
			return j, ErrJobConflict
		}
		return j, nil
	}
	hasResult := false
	for _, entry := range j.Groups {
		if entry.Job.State != JobSettling {
			return j, ErrJobTransition
		}
		if entry.Job.Outcome.ResultSHA256 != "" {
			hasResult = true
		}
	}
	if used > 0 && !hasResult {
		return j, ErrJobConflict
	}
	j.FinalCredit = &used
	j.Revision++
	return j, nil
}

func (j ReceiptJob) finishSettlement() (ReceiptJob, error) {
	if j.FinalCredit == nil {
		return j, ErrJobTransition
	}
	if j.Settled {
		return j, nil
	}
	groups := append([]SavedGroup(nil), j.Groups...)
	for i := range groups {
		entry := &groups[i]
		next, err := entry.Job.CompleteSettlement(entry.Job.SettlementID)
		if err != nil {
			return j, err
		}
		entry.Job = next
	}
	j.Groups = groups
	j.Settled = true
	j.Revision++
	return j, nil
}

func digestString(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}

func groupDigest(group Group) (string, error) {
	data, err := json.Marshal(group)
	if err != nil {
		return "", err
	}
	return digestString(data), nil
}

func (k JobKey) valid() bool {
	// The subject comes from the verified session and is never supplied by the
	// request body.
	return k.Subject != "" && len(k.Subject) <= 255 && utf8.ValidString(k.Subject) && identifier.MatchString(k.RequestID)
}

type ScyllaJobs struct {
	db          *gocql.Session
	maxJobBytes int
}

func NewScyllaJobs(db *gocql.Session, maxJobBytes int) (*ScyllaJobs, error) {
	if db == nil || maxJobBytes <= 0 {
		return nil, errors.New("receipt job database and byte limit are required")
	}
	return &ScyllaJobs{db: db, maxJobBytes: maxJobBytes}, nil
}

// putIfAbsent journals the request before credit is reserved. On an uncertain
// acknowledgement, the caller must stop and let the same request retry.
func (s *ScyllaJobs) putIfAbsent(ctx context.Context, key JobKey, job ReceiptJob) (bool, error) {
	if !key.valid() || job.Accepted || job.Revision != 1 {
		return false, ErrJobTransition
	}
	payload, err := s.payload(job)
	if err != nil {
		return false, err
	}
	return s.db.Query("INSERT INTO receipt_ai_jobs (subject, request_id, revision, payload) VALUES (?, ?, ?, ?) IF NOT EXISTS",
		key.Subject, key.RequestID, job.Revision, payload).WithContext(ctx).
		Consistency(gocql.LocalQuorum).SerialConsistency(gocql.LocalSerial).Idempotent(false).MapScanCAS(map[string]interface{}{})
}

func (s *ScyllaJobs) load(ctx context.Context, key JobKey) (ReceiptJob, error) {
	if !key.valid() {
		return ReceiptJob{}, ErrJobTransition
	}
	var revision int64
	var payload string
	err := s.db.Query("SELECT revision, payload FROM receipt_ai_jobs WHERE subject = ? AND request_id = ?",
		key.Subject, key.RequestID).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&revision, &payload)
	if errors.Is(err, gocql.ErrNotFound) {
		return ReceiptJob{}, ErrReceiptNotFound
	}
	if err != nil {
		return ReceiptJob{}, err
	}
	var job ReceiptJob
	if len(payload) > s.maxJobBytes || json.Unmarshal([]byte(payload), &job) != nil || job.Revision != revision {
		return ReceiptJob{}, errors.New("invalid stored receipt job")
	}
	return job, nil
}

func (s *ScyllaJobs) replace(ctx context.Context, key JobKey, previous int64, next ReceiptJob) (bool, error) {
	if !key.valid() || previous < 1 || next.Revision <= previous || next.Revision-previous != 1 {
		return false, ErrJobTransition
	}
	payload, err := s.payload(next)
	if err != nil {
		return false, err
	}
	return s.db.Query("UPDATE receipt_ai_jobs SET revision = ?, payload = ? WHERE subject = ? AND request_id = ? IF revision = ?",
		next.Revision, payload, key.Subject, key.RequestID, previous).WithContext(ctx).
		Consistency(gocql.LocalQuorum).SerialConsistency(gocql.LocalSerial).Idempotent(false).MapScanCAS(map[string]interface{}{})
}

func (s *ScyllaJobs) payload(job ReceiptJob) (string, error) {
	payload, err := json.Marshal(job)
	if err != nil {
		return "", err
	}
	if len(payload) > s.maxJobBytes {
		return "", errors.New("receipt job exceeds the configured storage limit")
	}
	return string(payload), nil
}
