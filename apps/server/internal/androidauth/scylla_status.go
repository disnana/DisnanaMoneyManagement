package androidauth

import (
	"context"
	"crypto/subtle"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"
)

var scyllaHostID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type statusSnapshot struct {
	Observed int64             `json:"observed_at_ms"`
	Hosts    map[string]string `json:"hosts"`
}

// ScyllaStatus samples local nodetool outside the challenge request path.
type ScyllaStatus struct {
	token    string
	mu       sync.RWMutex
	snapshot statusSnapshot
}

func NewScyllaStatus(token string) (*ScyllaStatus, bool) {
	if len(token) < 32 || strings.TrimSpace(token) != token || strings.ContainsAny(token, " \t\r\n") {
		return nil, false
	}
	return &ScyllaStatus{token: token}, true
}

func parseNodetoolStatus(output string) map[string]string {
	hosts := map[string]string{}
	for _, line := range strings.Split(output, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		switch fields[0] {
		case "UN", "UL", "UJ", "UM", "DN", "DL", "DJ", "DM":
			id := fields[len(fields)-2]
			if scyllaHostID.MatchString(id) {
				hosts[strings.ToLower(id)] = fields[0]
			}
		}
	}
	return hosts
}

func (s *ScyllaStatus) Poll(ctx context.Context, nodetool string) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		sample, cancel := context.WithTimeout(ctx, 4*time.Second)
		body, err := exec.CommandContext(sample, nodetool, "status").Output()
		cancel()
		if err == nil {
			hosts := parseNodetoolStatus(string(body))
			if len(hosts) != 0 {
				s.mu.Lock()
				s.snapshot = statusSnapshot{time.Now().UnixMilli(), hosts}
				s.mu.Unlock()
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (s *ScyllaStatus) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	provided := bearer(r)
	if subtle.ConstantTimeCompare([]byte(s.token), []byte(provided)) != 1 {
		reject(w, http.StatusUnauthorized)
		return
	}
	s.mu.RLock()
	snapshot := s.snapshot
	s.mu.RUnlock()
	if snapshot.Observed == 0 || time.Since(time.UnixMilli(snapshot.Observed)) > 30*time.Second {
		reject(w, http.StatusServiceUnavailable)
		return
	}
	jsonReply(w, http.StatusOK, snapshot)
}
