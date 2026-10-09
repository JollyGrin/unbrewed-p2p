package gameserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/Emyrk/unbrewed-server/telemetry"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/santhosh-tekuri/jsonschema/v5"
)

// A distinctive gid, so the "no raw gid in any payload" check can't collide
// with event type names.
const testLobby = "SleepyOtter42"

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

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

// events validates every batch the sink got against the schema copy, checks
// none contains a forbidden string, and returns the events in order.
func (s *sink) events(t *testing.T, forbidden ...string) []telemetry.Event {
	t.Helper()
	compiler := jsonschema.NewCompiler()
	compiler.AssertFormat = true
	schema, err := compiler.Compile("../telemetry/testdata/sandbox-events.v1.schema.json")
	if err != nil {
		t.Fatal(err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	var events []telemetry.Event
	for i, body := range s.bodies {
		if s.paths[i] != "/v1/sandbox-events" {
			t.Errorf("path = %s", s.paths[i])
		}
		if got := s.headers[i].Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("Authorization = %q", got)
		}
		var doc interface{}
		dec := json.NewDecoder(bytes.NewReader(body))
		dec.UseNumber()
		if err := dec.Decode(&doc); err != nil {
			t.Fatal(err)
		}
		if err := schema.Validate(doc); err != nil {
			t.Errorf("batch %s invalid: %#v", body, err)
		}
		for _, f := range forbidden {
			if bytes.Contains(body, []byte(f)) {
				t.Errorf("raw %q in batch %s", f, body)
			}
		}
		var b struct{ Events []telemetry.Event }
		if err := json.Unmarshal(body, &b); err != nil {
			t.Fatal(err)
		}
		events = append(events, b.Events...)
	}
	return events
}

func startTelemetryServer(t *testing.T, sinkURL string) (*GameServer, *httptest.Server, *telemetry.HTTP) {
	t.Helper()
	gs := NewGameServer(prometheus.NewRegistry())
	em := telemetry.NewHTTP(telemetry.Config{
		URL: sinkURL, Key: "test-key", Salt: "test-salt",
		BufferSize: 64, BatchSize: 2, FlushInterval: 10 * time.Millisecond,
	})
	gs.Telemetry = em
	gs.Mux = mux.NewRouter()
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)
	srv := httptest.NewServer(gs.Mux)
	t.Cleanup(srv.Close)
	if _, err := gs.CreateLobby(testLobby); err != nil {
		t.Fatal(err)
	}
	return gs, srv, em
}

func dialLobby(t *testing.T, srv *httptest.Server, name string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/" + testLobby + "?name=" + name
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

func flush(t *testing.T, em *telemetry.HTTP) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := em.Close(ctx); err != nil {
		t.Fatal(err)
	}
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

	zelda := dialLobby(t, srv, "ZeldaQuill")
	next(t, zelda, MsgTypePlayerPosition)
	bob := dialLobby(t, srv, "BobbyTables")
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
	room := gs.Rooms[testLobby]
	waitClients(t, room, 1)

	// Age the room past the GC threshold, one hour after it opened.
	room.mutex.Lock()
	room.openedAt = time.Now().Add(-14 * time.Hour)
	room.FieldState.LastUpdate = room.openedAt.Add(time.Hour)
	room.mutex.Unlock()
	gs.collectGarbage()
	if _, ok := gs.Rooms[testLobby]; ok {
		t.Fatal("room not collected")
	}
	// The name pool is small, so a later sitting reuses the gid. It must
	// not be merged into the first one.
	if _, err := gs.CreateLobby(testLobby); err != nil {
		t.Fatal(err)
	}
	flush(t, em)

	events := sk.events(t, "ZeldaQuill", "zeldaquill", "BobbyTables", "bobbytables", testLobby, strings.ToLower(testLobby))

	byType := map[string][]telemetry.Event{}
	ids := map[string]bool{}
	for _, e := range events {
		byType[e.Type] = append(byType[e.Type], e)
		if ids[e.EventID] {
			t.Errorf("duplicate eventId %s", e.EventID)
		}
		ids[e.EventID] = true
		if e.Type != telemetry.TypeRoomOpened && e.LobbyHash != "" {
			t.Errorf("%s carries lobbyHash", e.Type)
		}
	}

	opened := byType[telemetry.TypeRoomOpened]
	if len(opened) != 2 {
		t.Fatalf("room_opened = %+v, want one per sitting", opened)
	}
	first, second := opened[0].RoomID, opened[1].RoomID
	if !uuidRe.MatchString(first) || !uuidRe.MatchString(second) || first == second {
		t.Errorf("roomIds %q, %q: want two distinct uuid v4s", first, second)
	}
	if opened[0].LobbyHash == "" || opened[0].LobbyHash != opened[1].LobbyHash {
		t.Errorf("lobbyHash %q, %q: want the same hash for the same gid", opened[0].LobbyHash, opened[1].LobbyHash)
	}
	for _, e := range events {
		if e.RoomID != first && !(e.Type == telemetry.TypeRoomOpened && e.RoomID == second) {
			t.Errorf("%s has roomId %s, want the first sitting's %s", e.Type, e.RoomID, first)
		}
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

// heroName is clamped to 128 runes, a blank one is skipped, and one player
// gets at most MaxHeroesPerPlayer hero_seen per room.
func TestSandboxTelemetryHeroNames(t *testing.T) {
	sk := &sink{}
	sinkSrv := httptest.NewServer(sk)
	t.Cleanup(sinkSrv.Close)
	_, srv, em := startTelemetryServer(t, sinkSrv.URL)

	alice := dialLobby(t, srv, "alice")
	next(t, alice, MsgTypePlayerPosition)
	sendHero := func(name string) {
		t.Helper()
		b, _ := json.Marshal(name)
		send(t, alice, MsgTypePlayerState, `{"pool":{"hero":{"name":`+string(b)+`}}}`)
		next(t, alice, MsgTypeGameState)
	}

	long := strings.Repeat("é", 200) // 200 runes, 400 bytes
	sendHero(long)
	sendHero("   ")
	for i := 0; i < 2*telemetry.MaxHeroesPerPlayer; i++ {
		sendHero(fmt.Sprintf("Hero %d", i))
	}
	flush(t, em)

	var heroes []string
	for _, e := range sk.events(t) {
		if e.Type == telemetry.TypeHeroSeen {
			heroes = append(heroes, e.HeroName)
		}
	}
	if len(heroes) != telemetry.MaxHeroesPerPlayer {
		t.Fatalf("hero_seen = %d %q, want %d", len(heroes), heroes, telemetry.MaxHeroesPerPlayer)
	}
	if heroes[0] != strings.Repeat("é", 128) || utf8.RuneCountInString(heroes[0]) != 128 {
		t.Errorf("long hero sent as %d runes, want the first 128", utf8.RuneCountInString(heroes[0]))
	}
	if heroes[1] != "Hero 0" {
		t.Errorf("blank hero not skipped: %q", heroes)
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

			alice := dialLobby(t, srv, "alice")
			next(t, alice, MsgTypePlayerPosition)
			bob := dialLobby(t, srv, "bob")
			next(t, bob, MsgTypePlayerPosition)
			next(t, alice, MsgTypePlayerPosition)

			start := time.Now()
			for i := 0; i < 100; i++ {
				send(t, alice, MsgTypePlayerPosition, fmt.Sprintf(`{"i":%d}`, i))
				next(t, bob, MsgTypePlayerPosition)
				// A join and a leave per round: 200 events against 64 slots.
				extra := dialLobby(t, srv, fmt.Sprintf("extra%d", i))
				next(t, extra, MsgTypePlayerPosition)
				_ = extra.Close()
			}
			if d := time.Since(start); d > 3*time.Second {
				t.Fatalf("100 broadcasts took %s with a bad sink", d)
			}
		})
	}
}
