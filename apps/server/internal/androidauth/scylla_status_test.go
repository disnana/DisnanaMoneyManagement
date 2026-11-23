package androidauth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNodetoolStatusAndPrivateSnapshot(t *testing.T) {
	const a = "20ababab-0167-4c4b-a290-6d561b671cee"
	const b = "c268fb05-e07f-4d36-b906-a65bdf96bb1d"
	hosts := parseNodetoolStatus("Datacenter: datacenter1\n" +
		"UN  10.0.0.3   14.2 GB  256  ?  " + a + "  rack1\n" +
		"DN  10.0.0.4   ?        256  ?  " + b + "  rack1\n" +
		"UN  malformed   100GB    256  ?  bad   rack1\n")
	if len(hosts) != 2 || hosts[a] != "UN" || hosts[b] != "DN" {
		t.Fatalf("unexpected status: %v", hosts)
	}
	token := strings.Repeat("a", 32)
	status, ok := NewScyllaStatus(token)
	if !ok {
		t.Fatal("valid token rejected")
	}
	request := httptest.NewRequest("GET", "/_internal/scylla-status", nil)
	check := func(expected int) {
		recorder := httptest.NewRecorder()
		status.ServeHTTP(recorder, request)
		if recorder.Code != expected {
			t.Fatalf("got %d, want %d", recorder.Code, expected)
		}
	}
	check(http.StatusUnauthorized)
	request.Header.Set("Authorization", "Bearer "+token)
	check(http.StatusServiceUnavailable)
	status.snapshot = statusSnapshot{time.Now().UnixMilli(), hosts}
	check(http.StatusOK)
	status.snapshot.Observed = time.Now().Add(-time.Minute).UnixMilli()
	check(http.StatusServiceUnavailable)
}
