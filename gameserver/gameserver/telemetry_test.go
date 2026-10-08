package gameserver

import (
	"bytes"
	"context"
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Emyrk/unbrewed-server/telemetry"
	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

// sink is a fake unbrewed-telemetry recording every batch it is posted.
type sink struct {
	mu      sync.Mutex
	bodies  [][]byte
	headers []http.Header
	paths   []string
}

func (s *sink) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	body, _ := ioutil.ReadAll(r.Body)
	s.mu.Lock()
	s.bodies = append(s.bodies, body)
	s.headers = append(s.headers, r.Header.Clone())
	s.paths = append(s.paths, r.URL.Path)
	s.mu.Unlock()
	w.WriteHeader(http.StatusCreated)
}

func startTelemetryServer(t *testing.T, sinkURL string) (*GameServer, *httptest.Server, *telemetry.HTTP) {
	t.Helper()
	gs := NewGameServer(prometheus.NewRegistry())
	em := telemetry.NewHTTP(telemetry.Config{
		URL: sinkURL, Key: "test-key", Salt: "test-salt",
		BufferSize: 8, BatchSize: 2, FlushInterval: 10 * time.Millisecond,
	})
	gs.Telemetry = em
	gs.Mux = mux.NewRouter()
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)
	srv := httptest.NewServer(gs.Mux)
	t.Cleanup(srv.Close)
	if _, err := gs.CreateLobby("room"); err != nil {
		t.Fatal(err)
	}
	return gs, srv, em
}

func waitClients(t *testing.T, room *Room, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for {
		room.mutex.Lock()
		n := len(room.Clients)
		room.mutex.Unlock()
		if n == want {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("clients = %d, want %d", n, want)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestSandboxTelemetryLifecycle(t *testing.T) {
	sk := &sink{}
	sinkSrv := httptest.NewServer(sk)
	t.Cleanup(sinkSrv.Close)
	gs, srv, em := startTelemetryServer(t, sinkSrv.URL)

	zelda := dial(t, srv, "ZeldaQuill")
	next(t, zelda, MsgTypePlayerPosition)
	bob := dial(t, srv, "BobbyTables")
	next(t, bob, MsgTypePlayerPosition)
	next(t, zelda, MsgTypePlayerPosition)

	hero := `{"pool":{"hero":{"name":"Medusa"},"hand":["x"]}}`
	send(t, zelda, MsgTypePlayerState, hero)
	next(t, bob, MsgTypeGameState)
	send(t, zelda, MsgTypePlayerState, hero) // same hero again: no second hero_seen
	next(t, bob, MsgTypeGameState)
	send(t, bob, MsgTypePlayerPosition, `{"tokens":[]}`)
	next(t, zelda, MsgTypePlayerPosition)

	_ = bob.Close()
	room := gs.Rooms["room"]
	waitClients(t, room, 1)

	// Age the room past the GC threshold, one hour after it opened.
	room.mutex.Lock()
	room.openedAt = time.Now().Add(-14 * time.Hour)
	room.FieldState.LastUpdate = room.openedAt.Add(time.Hour)
	room.mutex.Unlock()
	gs.collectGarbage()
	if _, ok := gs.Rooms["room"]; ok {
		t.Fatal("room not collected")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := em.Close(ctx); err != nil {
		t.Fatal(err)
	}

	schema := jsonschema.NewCompiler()
	schema.AssertFormat = true
	compiled, err := schema.Compile("../telemetry/testdata/sandbox-events.v1.schema.json")
	if err != nil {
		t.Fatal(err)
	}

	sk.mu.Lock()
	defer sk.mu.Unlock()
	var events []telemetry.Event
	for i, body := range sk.bodies {
		if sk.paths[i] != "/v1/sandbox-events" {
			t.Errorf("path = %s", sk.paths[i])
		}
		if got := sk.headers[i].Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q", got)
		}
		var doc interface{}
		dec := json.NewDecoder(bytes.NewReader(body))
		dec.UseNumber()
		if err := dec.Decode(&doc); err != nil {
			t.Fatal(err)
		}
		if err := compiled.Validate(doc); err != nil {
			t.Errorf("batch %s invalid: %#v", body, err)
		}
		for _, name := range []string{"ZeldaQuill", "zeldaquill", "BobbyTables", "bobbytables"} {
			if bytes.Contains(body, []byte(name)) {
				t.Errorf("raw player name %q in batch %s", name, body)
			}
		}
		var b struct{ Events []telemetry.Event }
		if err := json.Unmarshal(body, &b); err != nil {
			t.Fatal(err)
		}
		events = append(events, b.Events...)
	}

	byType := map[string][]telemetry.Event{}
	ids := map[string]bool{}
	for _, e := range events {
		byType[e.Type] = append(byType[e.Type], e)
		if ids[e.EventID] {
			t.Errorf("duplicate eventId %s", e.EventID)
		}
		ids[e.EventID] = true
	}

	if n := len(byType[telemetry.TypeRoomOpened]); n != 1 {
		t.Errorf("room_opened = %d, want 1", n)
	}
	joined := byType[telemetry.TypePlayerJoined]
	if len(joined) != 2 || *joined[0].Connections != 1 || *joined[1].Connections != 2 {
		t.Fatalf("player_joined = %+v", joined)
	}
	zeldaHash, bobHash := joined[0].PlayerHash, joined[1].PlayerHash
	if zeldaHash == bobHash {
		t.Errorf("both players hashed to %s", zeldaHash)
	}
	heroes := byType[telemetry.TypeHeroSeen]
	if len(heroes) != 1 || heroes[0].HeroName != "Medusa" || heroes[0].PlayerHash != zeldaHash {
		t.Errorf("hero_seen = %+v", heroes)
	}
	left := byType[telemetry.TypePlayerLeft]
	if len(left) == 0 || left[0].PlayerHash != bobHash || *left[0].Connections != 1 {
		t.Errorf("player_left = %+v", left)
	}
	closed := byType[telemetry.TypeRoomClosed]
	if len(closed) != 1 {
		t.Fatalf("room_closed = %+v", closed)
	}
	c := closed[0]
	if c.Reason != telemetry.ReasonInactive || *c.LifetimeMs != 3600000 ||
		*c.DistinctPlayers != 2 || *c.PeakConnections != 2 || *c.StateUpdates != 3 {
		t.Errorf("room_closed = reason %s lifetime %d players %d peak %d updates %d",
			c.Reason, *c.LifetimeMs, *c.DistinctPlayers, *c.PeakConnections, *c.StateUpdates)
	}
}

// A sink that hangs or errors must never slow a broadcast: Emit only
// enqueues, and drops once the buffer is full.
func TestSandboxTelemetryBadSinkNeverDelaysBroadcast(t *testing.T) {
	for name, handler := range map[string]func(chan struct{}) http.HandlerFunc{
		"hangs": func(release chan struct{}) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) { <-release }
		},
		"500": func(chan struct{}) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) }
		},
	} {
		t.Run(name, func(t *testing.T) {
			release := make(chan struct{})
			sinkSrv := httptest.NewServer(handler(release))
			t.Cleanup(sinkSrv.Close)
			t.Cleanup(func() { close(release) }) // runs before sinkSrv.Close
			_, srv, _ := startTelemetryServer(t, sinkSrv.URL)

			alice := dial(t, srv, "alice")
			next(t, alice, MsgTypePlayerPosition)
			bob := dial(t, srv, "bob")
			next(t, bob, MsgTypePlayerPosition)
			next(t, alice, MsgTypePlayerPosition)

			start := time.Now()
			for i := 0; i < 100; i++ {
				// A new hero each time so every message also emits.
				send(t, alice, MsgTypePlayerState, `{"pool":{"hero":{"name":"Hero`+strings.Repeat("x", i)+`"}}}`)
				next(t, bob, MsgTypeGameState)
			}
			if d := time.Since(start); d > 2*time.Second {
				t.Fatalf("100 broadcasts took %s with a bad sink", d)
			}
		})
	}
}
