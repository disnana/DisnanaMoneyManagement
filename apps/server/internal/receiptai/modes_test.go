package receiptai

import (
	"context"
	"errors"
	"testing"
	"time"
)

type deferredFixture struct {
	submits, polls, aborts, cleanups int
	pendingFirst, failCleanup        bool
	submittedDigests                 map[string]string
}

func (f *deferredFixture) Submit(_ context.Context, input Group) (LunaResponse, error) {
	f.submits++
	if f.submittedDigests == nil {
		f.submittedDigests = make(map[string]string)
	}
	f.submittedDigests[input.ID], _ = groupDigest(input)
	return LunaResponse{ProviderID: "resp_deferred_fixture", Pending: true}, nil
}

func (f *deferredFixture) Poll(_ context.Context, id string, group Group, digest string) (LunaResponse, error) {
	f.polls++
	if digest == "" || digest != f.submittedDigests[group.ID] {
		return LunaResponse{}, errors.New("poll did not receive its submitted group digest")
	}
	for _, image := range group.Images {
		if len(image.Data) != 0 {
			return LunaResponse{}, errors.New("poll unexpectedly received original image bytes")
		}
	}
	if f.pendingFirst && f.polls == 1 {
		return LunaResponse{ProviderID: id, Pending: true}, ErrLunaPollRetry
	}
	total, currency := int64(123), "JPY"
	return LunaResponse{ProviderID: id, Result: Result{Documents: []Document{{
		Type: PaymentReceipt, Status: Success, SourceImageIDs: []string{group.Images[0].ID},
		TotalMinor: &total, Currency: &currency,
	}}}}, nil
}

func (f *deferredFixture) Abort(context.Context, string) error {
	f.aborts++
	return nil
}

func (f *deferredFixture) Cleanup(context.Context, string) error {
	f.cleanups++
	if f.failCleanup {
		f.failCleanup = false
		return ErrLunaPollRetry
	}
	return nil
}

func withDeferredMode(t *testing.T, runtime *Runtime, provider *deferredFixture, mode, profile string) *Runtime {
	t.Helper()
	config := runtime.config
	config.Modes = []RuntimeModeConfig{{
		ID: mode, ProviderProfile: profile, PriceVersion: "deferred-v1", MillicreditsPerImage: 600,
		MaxWait: 2 * time.Hour, PollInterval: 10 * time.Second, Analyzer: provider,
	}}
	updated, err := newRuntime(runtime.service, runtime.queue, runtime.results, config)
	if err != nil {
		t.Fatal(err)
	}
	return updated
}

func TestDeferredReceiptResumesAcrossNodesAndUsesPinnedTariff(t *testing.T) {
	ctx := context.Background()
	r, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	provider := &deferredFixture{pendingFirst: true, failCleanup: true}
	r = withDeferredMode(t, r, provider, ModeBackground, LunaBackground2h)
	config := r.Config()
	if len(config.Modes) != 2 || config.Modes[0].ID != ModeStandard || config.Modes[1].ID != ModeBackground ||
		config.Modes[1].MillicreditsPerImage != 600 || config.Modes[1].MaxWaitSeconds != 7200 {
		t.Fatalf("unexpected mode configuration: %+v", config.Modes)
	}
	if _, err := r.SubmitMode(ctx, key, 1, "deferred-v1", ModeBackground, raw); !errors.Is(err, ErrReceiptQuote) {
		t.Fatalf("under-quoted reservation was accepted: %v", err)
	}
	view, err := r.SubmitMode(ctx, key, 2, "deferred-v1", ModeBackground, raw)
	if err != nil || view.Mode != ModeBackground || !view.Accepted || wallet.holds[key] != 2 {
		t.Fatalf("deferred request was not accepted: %v", err)
	}
	if _, err := r.Submit(ctx, key, 2, "deferred-v1", raw); !errors.Is(err, ErrJobConflict) {
		t.Fatalf("duplicate request could change mode: %v", err)
	}
	// Fail only the acknowledgement of the provider ID CAS. Another node must
	// read the acknowledged provider ID instead of issuing another POST.
	r.service.store.(*memoryJobs).loseCAS = func(row ReceiptJob) bool {
		return row.Groups[0].Job.State == JobProcessing && row.Groups[0].Job.NextPollAt.IsZero()
	}
	if err := r.process(ctx, key); !errors.Is(err, lostWrite) || provider.submits != 1 {
		t.Fatalf("expected lost provider ID acknowledgement: %v", err)
	}

	// Simulate missing image storage after the provider already accepted the
	// original group. Its persisted IDs and digest are sufficient to recover.
	savedInput := queue.rows[key]
	savedInput.data = nil
	queue.rows[key] = savedInput

	changed := r.config
	changed.Modes = append([]RuntimeModeConfig(nil), changed.Modes...)
	changed.Modes[0].PriceVersion, changed.Modes[0].MillicreditsPerImage = "deferred-v2", 2000
	other, err := newRuntime(r.service, queue, r.results, changed)
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := other.process(ctx, key); err != nil {
			t.Fatal(err)
		}
	}
	if provider.submits != 1 || provider.polls != 1 || wallet.effects != 0 {
		t.Fatal("either external submission, retry polling, or settlement occurred twice")
	}

	*now = now.Add(10 * time.Second)
	if err := other.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err = other.Job(ctx, key)
	if err != nil || !view.Settled || view.FinalCredit == nil || *view.FinalCredit != 1 ||
		wallet.effects != 1 || provider.polls != 2 || provider.submits != 1 {
		t.Fatalf("known partial output was not settled from its original quote: %v", err)
	}
	if _, err := queue.body(ctx, key); !errors.Is(err, ErrReceiptNotFound) {
		t.Fatalf("settled job retained input while awaiting provider cleanup: %v", err)
	}
	*now = now.Add(10 * time.Second)
	if err := other.process(ctx, key); err != nil || provider.cleanups != 1 {
		t.Fatalf("expected one deferred cleanup attempt: %v", err)
	}
	*now = now.Add(10 * time.Second)
	if err := other.process(ctx, key); err != nil || provider.cleanups != 2 || len(queue.rows) != 0 || wallet.effects != 1 {
		t.Fatalf("cleanup did not retry without repeating the debit: %v", err)
	}
}

func TestDeferredProfileChangeDoesNotLaunchPreviouslyAcceptedJob(t *testing.T) {
	ctx := context.Background()
	r, _, wallet, key, now, raw, _ := runtimeFixture(t)
	old, replacement := &deferredFixture{}, &deferredFixture{}
	r = withDeferredMode(t, r, old, ModeBackground, LunaBackground2h)
	if _, err := r.SubmitMode(ctx, key, 2, "deferred-v1", ModeBackground, raw); err != nil {
		t.Fatal(err)
	}
	r = withDeferredMode(t, r, replacement, ModeBackground, LunaBackground8h)
	if err := r.process(ctx, key); err != nil || old.submits != 0 || replacement.submits != 0 {
		t.Fatalf("queued request was submitted with a different provider tier: %v", err)
	}
	*now = now.Add(2 * time.Hour)
	if err := r.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := r.Job(ctx, key)
	if err != nil || view.State != JobExpired || !view.Settled || wallet.used[key] != 0 {
		t.Fatalf("unprocessed request was not given back its hold: %v", err)
	}
}

func TestDeferredExpiryAbortsKnownBatchAndDoesNotCharge(t *testing.T) {
	ctx := context.Background()
	r, queue, wallet, key, now, raw, _ := runtimeFixture(t)
	provider := &deferredFixture{}
	r = withDeferredMode(t, r, provider, ModeBatch, LunaBatch24h)
	if _, err := r.SubmitMode(ctx, key, 2, "deferred-v1", ModeBatch, raw); err != nil {
		t.Fatal(err)
	}
	if err := r.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	*now = now.Add(2 * time.Hour)
	if err := r.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err := r.Job(ctx, key)
	if err != nil || view.State != JobExpired || wallet.used[key] != 0 || provider.aborts != 1 ||
		provider.cleanups != 1 || provider.submits != 1 || len(queue.rows) != 0 {
		t.Fatalf("expired deferred job was not recovered and cleaned up: %v", err)
	}
}

func TestDeferredPollRecoversKnownGroupWhenAnotherGroupsImagesAreMissing(t *testing.T) {
	ctx := context.Background()
	runtime, queue, wallet, key, now, _, _ := runtimeFixture(t)
	provider := &deferredFixture{}
	runtime = withDeferredMode(t, runtime, provider, ModeBatch, LunaBatch24h)
	top, bottom := receiptImages(t)
	request := Request{Groups: []Group{
		{ID: "awaiting-images", Images: []Image{top}},
		{ID: "provider-known", Images: []Image{bottom}},
	}}
	raw := requestJSON(t, request)
	if _, err := runtime.SubmitMode(ctx, key, 2, "deferred-v1", ModeBatch, raw); err != nil {
		t.Fatal(err)
	}
	if err := runtime.service.runGroup(ctx, key, request.Groups[1], "accepted-by-provider",
		now.Add(time.Second), now.Add(5*time.Second), provider.Submit); err != nil {
		t.Fatal(err)
	}
	noImages := queue.rows[key]
	noImages.data = nil
	queue.rows[key] = noImages
	if err := runtime.process(ctx, key); err == nil || provider.submits != 1 || provider.polls != 1 {
		t.Fatalf("failed image read blocked the known provider response: %v", err)
	}
	view, err := runtime.Job(ctx, key)
	if err != nil || view.Groups[0].State != JobQueued || view.Groups[1].State != JobSettling ||
		view.Groups[1].Result == nil || view.Settled {
		t.Fatalf("partial in-progress result was not preserved: %v", err)
	}
	*now = now.Add(2 * time.Hour)
	if err := runtime.process(ctx, key); err != nil {
		t.Fatal(err)
	}
	view, err = runtime.Job(ctx, key)
	if err != nil || view.State != JobPartial || wallet.used[key] != 1 || wallet.effects != 1 ||
		provider.submits != 1 || provider.polls != 1 {
		t.Fatalf("expired group did not preserve and settle the other result: %v", err)
	}
}
