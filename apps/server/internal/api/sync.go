package api

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/disnana/dmm/server/internal/store"
)

const (
	maxOpsPerPush = 500
	maxDeviceLen  = 64
)

type pushOp struct {
	ID      string `json:"id"`
	Device  string `json:"device"`
	Payload []byte `json:"payload"` // base64 ciphertext
}

func (s *Server) push(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Ops []pushOp `json:"ops"`
	}
	if !decode(w, r, int64(maxOpsPerPush*(s.cfg.MaxOpBytes*4/3+256)), &body) {
		return
	}
	if len(body.Ops) == 0 || len(body.Ops) > maxOpsPerPush {
		writeErr(w, http.StatusBadRequest, "1 to 500 ops per request")
		return
	}
	ops := make([]store.Op, 0, len(body.Ops))
	for _, o := range body.Ops {
		if !store.ValidOpID(o.ID) {
			writeErr(w, http.StatusBadRequest, "invalid op id")
			return
		}
		if o.Device == "" || len(o.Device) > maxDeviceLen || !store.ValidOpID(o.Device) {
			writeErr(w, http.StatusBadRequest, "invalid device id")
			return
		}
		if len(o.Payload) == 0 || len(o.Payload) > s.cfg.MaxOpBytes {
			writeErr(w, http.StatusRequestEntityTooLarge, "op payload empty or too large")
			return
		}
		ops = append(ops, store.Op{ID: o.ID, Device: o.Device, Payload: o.Payload})
	}
	res, err := s.store.Push(r.Context(), userID(r), ops, s.cfg.MaxUserBytes)
	switch {
	case errors.Is(err, store.ErrQuota):
		writeErr(w, http.StatusInsufficientStorage, "storage quota exceeded")
	case err != nil:
		s.fail(w, err)
	default:
		writeJSON(w, 200, map[string]any{"accepted": res.Accepted, "duplicates": res.Duplicates, "cursor": res.Cursor.String()})
	}
}

type pulledOp struct {
	Cursor  string `json:"cursor"`
	ID      string `json:"id"`
	Device  string `json:"device"`
	Payload []byte `json:"payload"`
}

// pull returns ops strictly after ?cursor=. A client starting a sync session should rewind its saved cursor
// by a few seconds (node clocks may skew) and de-duplicate by op id; pagination within a session uses the
// returned cursor as-is.
func (s *Server) pull(w http.ResponseWriter, r *http.Request) {
	after, err := store.ParseCursor(r.URL.Query().Get("cursor"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid cursor")
		return
	}
	limit := 200
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 1000 {
			writeErr(w, http.StatusBadRequest, "limit must be 1..1000")
			return
		}
		limit = n
	}
	ops, more, err := s.store.Pull(r.Context(), userID(r), after, limit)
	if err != nil {
		s.fail(w, err)
		return
	}
	out := make([]pulledOp, 0, len(ops))
	next := after
	for _, o := range ops {
		out = append(out, pulledOp{Cursor: o.Cursor().String(), ID: o.ID, Device: o.Device, Payload: o.Payload})
		next = o.Cursor()
	}
	writeJSON(w, 200, map[string]any{"ops": out, "cursor": next.String(), "has_more": more})
}

func (s *Server) putSnapshot(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Upto    string `json:"upto"`
		Payload []byte `json:"payload"`
	}
	if !decode(w, r, int64(s.cfg.MaxSnapshotBytes*4/3+1024), &body) {
		return
	}
	upto, err := store.ParseCursor(body.Upto)
	if err != nil || upto == (store.Cursor{}) {
		writeErr(w, http.StatusBadRequest, "invalid upto cursor")
		return
	}
	if len(body.Payload) == 0 || len(body.Payload) > s.cfg.MaxSnapshotBytes {
		writeErr(w, http.StatusRequestEntityTooLarge, "snapshot empty or too large")
		return
	}
	prune := r.URL.Query().Get("prune") == "1"
	err = s.store.PutSnapshot(r.Context(), userID(r), store.Snapshot{Upto: upto, Payload: body.Payload}, prune, s.cfg.MaxUserBytes)
	switch {
	case errors.Is(err, store.ErrQuota):
		writeErr(w, http.StatusInsufficientStorage, "storage quota exceeded")
	case err != nil:
		s.fail(w, err)
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *Server) getSnapshot(w http.ResponseWriter, r *http.Request) {
	sn, err := s.store.GetSnapshot(r.Context(), userID(r))
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeErr(w, http.StatusNotFound, "no snapshot")
	case err != nil:
		s.fail(w, err)
	default:
		writeJSON(w, 200, map[string]any{"upto": sn.Upto.String(), "payload": sn.Payload, "updated_at": sn.UpdatedAt})
	}
}
