package telemetry

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"sync/atomic"
	"testing"
	"time"
)

func TestFromEnv(t *testing.T) {
	t.Setenv("SANDBOX_TELEMETRY_URL", "")
	t.Setenv("SANDBOX_TELEMETRY_KEY", "")
	t.Setenv("SANDBOX_NAME_SALT", "")
	if em, err := FromEnv(); err != nil || em.Enabled() {
		t.Fatalf("unset env: %T %v, want Noop", em, err)
	}

	t.Setenv("SANDBOX_TELEMETRY_URL", "http://127.0.0.1:1")
	t.Setenv("SANDBOX_TELEMETRY_KEY", "k")
	if em, err := FromEnv(); err == nil || em.Enabled() {
		t.Fatalf("no salt: %T %v, want Noop and an error", em, err)
	}

	t.Setenv("SANDBOX_NAME_SALT", "s")
	em, err := FromEnv()
	if err != nil || !em.Enabled() {
		t.Fatalf("full env: %T %v, want HTTP", em, err)
	}
	_ = em.Close(context.Background())
}

func TestHash(t *testing.T) {
	h := NewHTTP(Config{URL: "http://127.0.0.1:1", Key: "k", Salt: "salt"})
	defer h.Close(context.Background())
	got := h.Hash("  Alice ")
	if !regexp.MustCompile(`^[0-9a-f]{16}$`).MatchString(got) {
		t.Fatalf("hash %q", got)
	}
	if h.Hash("alice") != got {
		t.Error("hash is not trim/case-insensitive")
	}
	other := NewHTTP(Config{URL: "http://127.0.0.1:1", Key: "k", Salt: "other"})
	defer other.Close(context.Background())
	if other.Hash("alice") == got {
		t.Error("hash ignores the salt")
	}
}

func TestRetriesOnceOn5xxNotOn4xx(t *testing.T) {
	for status, wantAttempts := range map[int]int32{500: 2, 400: 1} {
		var attempts int32
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			atomic.AddInt32(&attempts, 1)
			w.WriteHeader(status)
		}))
		h := NewHTTP(Config{URL: srv.URL, Key: "k", Salt: "s", FlushInterval: time.Hour})
		h.Emit(RoomOpened(NewRoomID(), "0123456789abcdef"))
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		if err := h.Close(ctx); err != nil {
			t.Fatal(err)
		}
		cancel()
		srv.Close()
		if got := atomic.LoadInt32(&attempts); got != wantAttempts {
			t.Errorf("status %d: %d attempts, want %d", status, got, wantAttempts)
		}
	}
}

func TestEmitDropsWhenFull(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-release }))
	defer srv.Close()
	defer close(release)
	h := NewHTTP(Config{URL: srv.URL, Key: "k", Salt: "s", BufferSize: 2, BatchSize: 1})
	done := make(chan struct{})
	go func() {
		for i := 0; i < 1000; i++ {
			h.Emit(RoomOpened(NewRoomID(), "0123456789abcdef"))
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Emit blocked on a hung sink")
	}
	if atomic.LoadInt64(&h.dropped) == 0 {
		t.Error("no events counted as dropped")
	}
}
