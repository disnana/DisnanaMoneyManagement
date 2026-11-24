package receiptai

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"sync"
	"time"

	"github.com/gocql/gocql"
)

var (
	ErrReceiptInput = errors.New("invalid receipt input")
	ErrReceiptQuote = errors.New("receipt quote no longer matches")
)

const (
	receiptQueueShards = 8
	receiptSendWorkers = 2
)

type RuntimeConfig struct {
	PriceVersion       string
	CreditPerImage     int64
	JobTimeout         time.Duration
	ClaimDuration      time.Duration
	AcknowledgeTimeout time.Duration
	PollInterval       time.Duration
	PollBatchSize      int
}

type ConfigView struct {
	PriceVersion       string `json:"price_version"`
	CreditPerImage     int64  `json:"credits_per_image"`
	MaxJSONBytes       int    `json:"max_json_bytes"`
	MaxGroups          int    `json:"max_groups"`
	MaxImagesPerGroup  int    `json:"max_images_per_group"`
	MaxTotalImages     int    `json:"max_total_images"`
	MaxImageBytes      int    `json:"max_image_bytes"`
	MaxTotalImageBytes int    `json:"max_total_image_bytes"`
	MaxImagePixels     int64  `json:"max_image_pixels"`
}

type JobView struct {
	RequestID     string      `json:"id"`
	State         JobState    `json:"state"`
	Accepted      bool        `json:"accepted"`
	Settled       bool        `json:"settled"`
	PriceVersion  string      `json:"price_version"`
	MaximumCredit int64       `json:"maximum_credit"`
	FinalCredit   *int64      `json:"final_credit"`
	Groups        []GroupView `json:"groups"`
}

type GroupView struct {
	ID        string   `json:"id"`
	State     JobState `json:"state"`
	Result    *Result  `json:"result,omitempty"`
	ErrorCode string   `json:"error_code,omitempty"`
}

// A pending row holds the shared input and is the recoverable work index. It is
// written before reserving credits and deleted only after durable settlement.
type pendingReceipt struct {
	Intake         ReceiptIntake
	CreditPerImage int64
	Limits         RequestLimits
	Groups         []pendingGroup
}

type pendingGroup struct {
	ID       string
	Digest   string
	ImageIDs []string
}

type pendingQueue interface {
	insert(context.Context, JobKey, pendingReceipt, []byte) (bool, error)
	load(context.Context, JobKey) (pendingReceipt, error)
	body(context.Context, JobKey) ([]byte, error)
	page(context.Context, int, JobKey, int) ([]JobKey, error)
	remove(context.Context, JobKey) error
}

type Runtime struct {
	service *Service
	queue   pendingQueue
	config  RuntimeConfig
	wake    chan struct{}
}

func NewRuntime(service *Service, db *gocql.Session, config RuntimeConfig) (*Runtime, error) {
	if db == nil {
		return nil, errors.New("receipt runtime database is required")
	}
	return newRuntime(service, scyllaPending{db: db}, config)
}

func newRuntime(service *Service, queue pendingQueue, config RuntimeConfig) (*Runtime, error) {
	if service == nil || queue == nil || !identifier.MatchString(config.PriceVersion) ||
		config.CreditPerImage <= 0 || config.JobTimeout <= 0 || config.ClaimDuration <= 0 ||
		config.ClaimDuration >= config.JobTimeout || config.AcknowledgeTimeout <= 0 ||
		config.AcknowledgeTimeout >= config.JobTimeout || config.PollInterval <= 0 ||
		config.PollBatchSize <= 0 || config.PollBatchSize > 100 {
		return nil, errors.New("invalid receipt runtime configuration")
	}
	l := service.limits
	if l.MaxJSONBytes <= 0 || l.MaxGroups <= 0 || l.MaxImagesPerGroup <= 0 || l.MaxTotalImages <= 0 ||
		l.MaxImageBytes <= 0 || l.MaxTotalImageBytes <= 0 || l.MaxImagePixels <= 0 ||
		int64(l.MaxTotalImages) > math.MaxInt64/config.CreditPerImage {
		return nil, errors.New("invalid receipt runtime limits")
	}
	return &Runtime{service: service, queue: queue, config: config, wake: make(chan struct{}, 1)}, nil
}

func (r *Runtime) Config() ConfigView {
	l := r.service.limits
	return ConfigView{
		PriceVersion: r.config.PriceVersion, CreditPerImage: r.config.CreditPerImage,
		MaxJSONBytes: l.MaxJSONBytes, MaxGroups: l.MaxGroups, MaxImagesPerGroup: l.MaxImagesPerGroup,
		MaxTotalImages: l.MaxTotalImages, MaxImageBytes: l.MaxImageBytes,
		MaxTotalImageBytes: l.MaxTotalImageBytes, MaxImagePixels: l.MaxImagePixels,
	}
}

func (r *Runtime) Submit(ctx context.Context, key JobKey, expectedMax int64, priceVersion string, raw []byte) (JobView, error) {
	if !key.valid() || len(raw) == 0 {
		return JobView{}, ErrReceiptInput
	}
	if expectedMax <= 0 || !identifier.MatchString(priceVersion) {
		return JobView{}, ErrReceiptQuote
	}

	digest := digestString(raw)
	job, jobErr := r.service.store.load(ctx, key)
	if jobErr != nil && !errors.Is(jobErr, ErrReceiptNotFound) {
		return JobView{}, jobErr
	}
	if jobErr == nil {
		if !matchIntake(job.Intake, digest, expectedMax, priceVersion) {
			return JobView{}, ErrJobConflict
		}
		if job.Accepted {
			return publicJob(key, job)
		}
		if job.Abandoned {
			return JobView{}, ErrJobTransition
		}
	}

	staged, err := r.queue.load(ctx, key)
	if errors.Is(err, ErrReceiptNotFound) {
		if jobErr == nil {
			return JobView{}, errors.New("receipt input missing for existing intake")
		}
		if priceVersion != r.config.PriceVersion {
			return JobView{}, ErrReceiptQuote
		}
		decoded, decodeErr := DecodeRequest(raw, r.service.limits)
		if decodeErr != nil {
			return JobView{}, fmt.Errorf("%w: %v", ErrReceiptInput, decodeErr)
		}
		images := 0
		groups := make([]pendingGroup, 0, len(decoded.Groups))
		for _, group := range decoded.Groups {
			digest, err := groupDigest(group)
			if err != nil {
				return JobView{}, err
			}
			ids := make([]string, 0, len(group.Images))
			for _, image := range group.Images {
				ids = append(ids, image.ID)
			}
			images += len(ids)
			groups = append(groups, pendingGroup{ID: group.ID, Digest: digest, ImageIDs: ids})
		}
		if expectedMax != int64(images)*r.config.CreditPerImage {
			return JobView{}, ErrReceiptQuote
		}
		staged = pendingReceipt{
			Intake: ReceiptIntake{BodySHA256: digest, PriceVersion: priceVersion, MaximumCredit: expectedMax,
				Deadline: r.service.now().Add(r.config.JobTimeout).UTC()},
			CreditPerImage: r.config.CreditPerImage, Limits: r.service.limits, Groups: groups,
		}
		inserted, insertErr := r.queue.insert(ctx, key, staged, raw)
		if insertErr != nil {
			return JobView{}, insertErr
		}
		err = nil
		if !inserted {
			staged, err = r.queue.load(ctx, key)
		}
	}
	if err != nil {
		return JobView{}, err
	}
	if !matchIntake(staged.Intake, digest, expectedMax, priceVersion) {
		return JobView{}, ErrJobConflict
	}

	service := *r.service
	service.limits = staged.Limits
	accepted, err := service.AcceptDurableInput(ctx, key, staged.Intake, raw)
	if err != nil {
		return JobView{}, err
	}
	select {
	case r.wake <- struct{}{}:
	default:
	}
	return publicJob(key, accepted)
}

func matchIntake(intake ReceiptIntake, digest string, maximum int64, version string) bool {
	return intake.BodySHA256 == digest && intake.MaximumCredit == maximum && intake.PriceVersion == version
}

func (r *Runtime) Job(ctx context.Context, key JobKey) (JobView, error) {
	job, err := r.service.store.load(ctx, key)
	if err != nil {
		return JobView{}, err
	}
	return publicJob(key, job)
}

func publicJob(key JobKey, job ReceiptJob) (JobView, error) {
	view := JobView{RequestID: key.RequestID, State: receiptState(job), Accepted: job.Accepted,
		Settled: job.Settled, PriceVersion: job.Intake.PriceVersion, MaximumCredit: job.Intake.MaximumCredit,
		FinalCredit: job.FinalCredit, Groups: make([]GroupView, 0, len(job.Groups))}
	for _, group := range job.Groups {
		item := GroupView{ID: group.Job.GroupID, State: group.Job.State, ErrorCode: group.Job.Outcome.ErrorCode}
		if group.Result != "" {
			var result Result
			if err := json.Unmarshal([]byte(group.Result), &result); err != nil {
				return JobView{}, errors.New("invalid stored receipt result")
			}
			item.Result = &result
		}
		view.Groups = append(view.Groups, item)
	}
	return view, nil
}

func receiptState(job ReceiptJob) JobState {
	if !job.Settled {
		waiting, settling := true, true
		for _, group := range job.Groups {
			waiting = waiting && group.Job.State == JobQueued
			settling = settling && group.Job.State == JobSettling
		}
		switch {
		case waiting:
			return JobQueued
		case settling:
			return JobSettling
		default:
			return JobProcessing
		}
	}
	completed, expired, cancelled := true, true, true
	hasResult := false
	for _, group := range job.Groups {
		completed = completed && group.Job.State == JobCompleted
		expired = expired && group.Job.State == JobExpired
		cancelled = cancelled && group.Job.State == JobCancelled
		hasResult = hasResult || group.Job.State == JobCompleted || group.Job.State == JobPartial
	}
	switch {
	case completed:
		return JobCompleted
	case hasResult:
		return JobPartial
	case expired:
		return JobExpired
	case cancelled:
		return JobCancelled
	default:
		return JobFailed
	}
}

// Run uses a bounded clustering-key cursor per shard. Several workers can see
// the same key. The job CAS, not the queue cursor, fences provider attempts.
func (r *Runtime) Run(ctx context.Context) {
	ticker := time.NewTicker(r.config.PollInterval)
	defer ticker.Stop()
	var cursors [receiptQueueShards]JobKey
	slots := make(chan struct{}, receiptSendWorkers)
	var senders sync.WaitGroup
	defer senders.Wait()
	visit := func(ctx context.Context, key JobKey) error {
		select {
		case slots <- struct{}{}:
			senders.Go(func() {
				defer func() { <-slots }()
				if err := r.process(ctx, key); workFailure(err) && ctx.Err() == nil {
					log.Print("receipt runtime: a pending send operation failed")
				}
			})
			return nil
		default:
			// Recovery and cleanup keep running even while both send slots are busy.
			return r.processPending(ctx, key, false)
		}
	}
	for ctx.Err() == nil {
		if err := r.poll(ctx, &cursors, visit); err != nil && ctx.Err() == nil {
			log.Print("receipt runtime: a pending work operation failed")
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-r.wake:
		}
	}
}

func (r *Runtime) poll(ctx context.Context, cursors *[receiptQueueShards]JobKey, visit func(context.Context, JobKey) error) error {
	var operationErr error
	for shard, after := range cursors {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		keys, err := r.queue.page(ctx, shard, after, r.config.PollBatchSize)
		if err != nil {
			operationErr = err
			continue
		}
		if len(keys) == r.config.PollBatchSize {
			cursors[shard] = keys[len(keys)-1]
		} else {
			cursors[shard] = JobKey{}
		}
		for _, key := range keys {
			if err := visit(ctx, key); workFailure(err) {
				operationErr = err
			}
		}
	}
	return operationErr
}

func workFailure(err error) bool {
	return err != nil && !errors.Is(err, ErrReceiptNotFound) && !errors.Is(err, ErrJobConflict) &&
		!errors.Is(err, ErrJobTransition)
}

func (r *Runtime) process(ctx context.Context, key JobKey) error {
	return r.processPending(ctx, key, true)
}

func (r *Runtime) processPending(ctx context.Context, key JobKey, allowSend bool) error {
	job, err := r.service.store.load(ctx, key)
	if err != nil && !errors.Is(err, ErrReceiptNotFound) {
		return err
	}
	if job.Settled {
		return r.queue.remove(ctx, key)
	}
	pending, err := r.queue.load(ctx, key)
	if err != nil {
		return err
	}
	var input *Request
	request := func() (*Request, error) {
		if input != nil {
			return input, nil
		}
		raw, err := r.queue.body(ctx, key)
		if err != nil {
			return nil, err
		}
		if digestString(raw) != pending.Intake.BodySHA256 {
			return nil, errors.New("stored receipt input digest mismatch")
		}
		decoded, err := DecodeRequest(raw, pending.Limits)
		if err != nil {
			return nil, err
		}
		input = &decoded
		return input, nil
	}
	if job.Revision != 0 && (!matchIntake(job.Intake, pending.Intake.BodySHA256,
		pending.Intake.MaximumCredit, pending.Intake.PriceVersion) || !job.Intake.Deadline.Equal(pending.Intake.Deadline)) {
		return errors.New("stored receipt quote does not match the job")
	}
	if !job.Accepted {
		return r.recoverIntake(ctx, key, job, pending)
	}
	for i, saved := range job.Groups {
		state := saved.Job.State
		now := r.service.now()
		if allowSend && now.Before(job.Intake.Deadline) &&
			(state == JobQueued || (state == JobClaimed && !now.Before(saved.Job.ClaimUntil))) {
			input, err := request()
			if err != nil {
				return err
			}
			if i >= len(input.Groups) || input.Groups[i].ID != saved.Job.GroupID {
				return errors.New("stored receipt group does not match the accepted job")
			}
			if err := r.runGroup(ctx, key, input.Groups[i], job.Intake.Deadline); err != nil &&
				!errors.Is(err, ErrJobConflict) && !errors.Is(err, ErrJobTransition) {
				return err
			}
		} else if state != JobSettling && (!now.Before(job.Intake.Deadline) ||
			(state == JobSubmitting && !now.Before(saved.Job.AcknowledgeUntil))) {
			if err := r.service.RecoverGroup(ctx, key, saved.Job.GroupID); err != nil &&
				!errors.Is(err, ErrJobConflict) && !errors.Is(err, ErrJobTransition) {
				return err
			}
		}
	}

	job, err = r.service.store.load(ctx, key)
	if err != nil {
		return err
	}
	if job.Settled {
		return r.queue.remove(ctx, key)
	}
	for _, group := range job.Groups {
		if group.Job.State != JobSettling {
			return nil
		}
	}
	var used int64
	if job.FinalCredit == nil {
		used, err = eligibleImageCredits(job, pending)
		if err != nil {
			return err
		}
	} else {
		used = *job.FinalCredit
	}
	final, err := r.service.SettleReceipt(ctx, key, used)
	if err == nil && final.Settled {
		return r.queue.remove(ctx, key)
	}
	return err
}

func (r *Runtime) recoverIntake(ctx context.Context, key JobKey, job ReceiptJob, pending pendingReceipt) error {
	if r.service.now().Before(pending.Intake.Deadline) {
		return nil
	}
	if job.Revision == 0 {
		// Fence an in-flight first insertion before deleting images. If the
		// accepting caller won the job CAS, the next poll sees its state instead.
		fence := ReceiptJob{Revision: 1, Intake: pending.Intake, Abandoned: true,
			Groups: make([]SavedGroup, 0, len(pending.Groups))}
		for _, group := range pending.Groups {
			initial, err := NewJob(group.ID, pending.Intake.Deadline)
			if err != nil || !resultDigest.MatchString(group.Digest) {
				return ErrJobConflict
			}
			fence.Groups = append(fence.Groups, SavedGroup{Job: initial, InputSHA256: group.Digest})
		}
		if _, err := r.service.store.putIfAbsent(ctx, key, fence); err != nil {
			return err
		}
	}
	if err := r.service.RecoverExpiredIntake(ctx, key); err != nil {
		return err
	}
	return r.queue.remove(ctx, key)
}

func (r *Runtime) runGroup(ctx context.Context, key JobKey, group Group, deadline time.Time) error {
	now := r.service.now()
	claimUntil := now.Add(r.config.ClaimDuration)
	if deadline.Before(claimUntil) {
		claimUntil = deadline
	}
	acknowledgeUntil := now.Add(r.config.AcknowledgeTimeout)
	if deadline.Before(acknowledgeUntil) {
		acknowledgeUntil = deadline
	}
	var nonce [16]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return err
	}
	return r.service.RunStandardGroup(ctx, key, group, hex.EncodeToString(nonce[:]), claimUntil, acknowledgeUntil)
}

func eligibleImageCredits(job ReceiptJob, pending pendingReceipt) (int64, error) {
	perImage := pending.CreditPerImage
	if perImage <= 0 || len(job.Groups) != len(pending.Groups) {
		return 0, ErrJobConflict
	}
	eligible := make(map[string]bool)
	for i, group := range job.Groups {
		original := pending.Groups[i]
		if group.Job.GroupID != original.ID || group.InputSHA256 != original.Digest {
			return 0, ErrJobConflict
		}
		if group.Result == "" {
			continue
		}
		var result Result
		if err := json.Unmarshal([]byte(group.Result), &result); err != nil {
			return 0, errors.New("invalid stored receipt result")
		}
		membership := make(map[string]bool, len(original.ImageIDs))
		for _, id := range original.ImageIDs {
			membership[id] = true
		}
		for _, document := range result.Documents {
			if !eligibleDocument(document) {
				continue
			}
			for _, id := range document.SourceImageIDs {
				if !membership[id] {
					return 0, ErrJobConflict
				}
				eligible[id] = true
			}
		}
	}
	if int64(len(eligible)) > job.Intake.MaximumCredit/perImage {
		return 0, ErrJobConflict
	}
	return int64(len(eligible)) * perImage, nil
}

func eligibleDocument(document Document) bool {
	switch document.Status {
	case Success:
		return document.Type != UnknownDocument && document.TotalMinor != nil
	case Partial:
		return (document.Type == ItemizedReceipt || document.Type == PaymentReceipt) && document.TotalMinor != nil
	case OutOfScope:
		return document.Type != UnknownDocument
	case Unreadable:
		return document.QualityReason != nil && (*document.QualityReason == QualityBlur || *document.QualityReason == QualityGlare)
	default:
		return false
	}
}

type scyllaPending struct{ db *gocql.Session }

func shardFor(key JobKey) int {
	sum := sha256.Sum256([]byte(key.Subject + "\x00" + key.RequestID))
	return int(sum[0]) % receiptQueueShards
}

func (s scyllaPending) insert(ctx context.Context, key JobKey, pending pendingReceipt, body []byte) (bool, error) {
	details, err := json.Marshal(pending)
	if err != nil {
		return false, err
	}
	return s.db.Query("INSERT INTO receipt_ai_pending (shard, subject, request_id, details, body) VALUES (?, ?, ?, ?, ?) IF NOT EXISTS",
		shardFor(key), key.Subject, key.RequestID, string(details), body).WithContext(ctx).
		Consistency(gocql.LocalQuorum).SerialConsistency(gocql.LocalSerial).Idempotent(false).MapScanCAS(map[string]any{})
}

func (s scyllaPending) load(ctx context.Context, key JobKey) (pendingReceipt, error) {
	var details string
	err := s.db.Query("SELECT details FROM receipt_ai_pending WHERE shard = ? AND subject = ? AND request_id = ?",
		shardFor(key), key.Subject, key.RequestID).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&details)
	if errors.Is(err, gocql.ErrNotFound) {
		return pendingReceipt{}, ErrReceiptNotFound
	}
	if err != nil {
		return pendingReceipt{}, err
	}
	var pending pendingReceipt
	if err := json.Unmarshal([]byte(details), &pending); err != nil || len(pending.Groups) == 0 ||
		!resultDigest.MatchString(pending.Intake.BodySHA256) || !identifier.MatchString(pending.Intake.PriceVersion) ||
		pending.Intake.MaximumCredit <= 0 || pending.Intake.Deadline.IsZero() || pending.CreditPerImage <= 0 {
		return pendingReceipt{}, errors.New("invalid pending receipt details")
	}
	return pending, nil
}

func (s scyllaPending) body(ctx context.Context, key JobKey) ([]byte, error) {
	var body []byte
	err := s.db.Query("SELECT body FROM receipt_ai_pending WHERE shard = ? AND subject = ? AND request_id = ?",
		shardFor(key), key.Subject, key.RequestID).WithContext(ctx).Consistency(gocql.LocalQuorum).Scan(&body)
	if errors.Is(err, gocql.ErrNotFound) {
		return nil, ErrReceiptNotFound
	}
	return body, err
}

func (s scyllaPending) page(ctx context.Context, shard int, after JobKey, limit int) ([]JobKey, error) {
	query := s.db.Query("SELECT subject, request_id FROM receipt_ai_pending WHERE shard = ? LIMIT ?", shard, limit)
	if after.Subject != "" {
		query = s.db.Query("SELECT subject, request_id FROM receipt_ai_pending WHERE shard = ? AND (subject, request_id) > (?, ?) LIMIT ?",
			shard, after.Subject, after.RequestID, limit)
	}
	rows := query.WithContext(ctx).Consistency(gocql.LocalQuorum).PageSize(limit).Iter()
	var key JobKey
	keys := make([]JobKey, 0, limit)
	for rows.Scan(&key.Subject, &key.RequestID) {
		keys = append(keys, key)
	}
	return keys, rows.Close()
}

func (s scyllaPending) remove(ctx context.Context, key JobKey) error {
	_, err := s.db.Query("DELETE FROM receipt_ai_pending WHERE shard = ? AND subject = ? AND request_id = ? IF EXISTS",
		shardFor(key), key.Subject, key.RequestID).WithContext(ctx).
		Consistency(gocql.LocalQuorum).SerialConsistency(gocql.LocalSerial).Idempotent(false).MapScanCAS(map[string]any{})
	return err
}
