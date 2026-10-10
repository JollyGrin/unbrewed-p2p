package gameserver

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Emyrk/unbrewed-server/telemetry"
	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus"
)

const testAdminKey = "s3cret-admin"

// startAdminServer is startServer behind the relay's real root handler.
func startAdminServer(t *testing.T, adminKey string) (*GameServer, *httptest.Server) {
	t.Helper()
	gs := NewGameServer(prometheus.NewRegistry())
	gs.Mux = mux.NewRouter()
	gs.Mux.HandleFunc("/lobby/{gid}", gs.LobbyHandler)
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)
	srv := httptest.NewServer(gs.handler(adminKey))
	t.Cleanup(srv.Close)
	if _, err := gs.CreateLobby("room"); err != nil {
		t.Fatal(err)
	}
	return gs, srv
}

func getAdmin(t *testing.T, srv *httptest.Server, path, password string, withAuth bool) (int, http.Header, string) {
	t.Helper()
	req, err := http.NewRequest("GET", srv.URL+path, nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", "https://elsewhere.example")
	if withAuth {
		req.SetBasicAuth("anyone", password)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, string(body)
}

func viewJSON(t *testing.T, srv *httptest.Server) (adminSnapshot, string) {
	t.Helper()
	code, _, body := getAdmin(t, srv, "/view.json", testAdminKey, true)
	if code != http.StatusOK {
		t.Fatalf("view.json = %d: %s", code, body)
	}
	var snap adminSnapshot
	if err := json.Unmarshal([]byte(body), &snap); err != nil {
		t.Fatal(err)
	}
	return snap, body
}

func TestAdminRoutesAbsentWithoutKey(t *testing.T) {
	_, srv := startAdminServer(t, "")
	for _, path := range []string{"/view", "/view.json"} {
		if code, _, _ := getAdmin(t, srv, path, "", true); code != http.StatusNotFound {
			t.Errorf("%s without ADMIN_KEY = %d, want 404", path, code)
		}
	}
}

func TestAdminAuth(t *testing.T) {
	_, srv := startAdminServer(t, testAdminKey)
	for _, path := range []string{"/view", "/view.json"} {
		code, hdr, _ := getAdmin(t, srv, path, "", false)
		if code != http.StatusUnauthorized {
			t.Errorf("%s no creds = %d, want 401", path, code)
		}
		if got := hdr.Get("WWW-Authenticate"); got != `Basic realm="unbrewed-sandbox admin"` {
			t.Errorf("%s WWW-Authenticate = %q", path, got)
		}
		if code, _, _ := getAdmin(t, srv, path, "wrong", true); code != http.StatusUnauthorized {
			t.Errorf("%s wrong password = %d, want 401", path, code)
		}
		code, hdr, _ = getAdmin(t, srv, path, testAdminKey, true)
		if code != http.StatusOK {
			t.Errorf("%s right password = %d, want 200", path, code)
		}
		// Admin routes sit outside the CORS wildcard.
		if got := hdr.Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("%s Access-Control-Allow-Origin = %q", path, got)
		}
	}
}

func TestAdminSnapshotPlayers(t *testing.T) {
	gs, srv := startAdminServer(t, testAdminKey)
	tab1 := dial(t, srv, "alice")
	next(t, tab1, MsgTypePlayerPosition)
	tab2 := dial(t, srv, "alice")
	next(t, tab2, MsgTypePlayerPosition)
	bob := dial(t, srv, "bob")
	next(t, bob, MsgTypePlayerPosition)

	send(t, tab1, MsgTypePlayerState, `{"mapUrl":"https://maps.example/castle.png","pool":{
		"deckName":"Alice Deck","deckid":"deck-a","author":"ana","hero":{"name":"Alice"},
		"deck":[{"title":"A1"},{"title":"A2"},{"title":"A3"}],"hand":[{"title":"A4"}],"discard":[]}}`)
	next(t, bob, MsgTypeGameState)
	send(t, bob, MsgTypePlayerState, `{"pool":{
		"deckName":"Bob Deck","deckid":"deck-b","author":"ben","hero":{"name":"Bob"},
		"deck":[{"title":"B1"}],"hand":[{"title":"B2"},{"title":"B3"}],"discard":[{"title":"B4"}]}}`)
	next(t, tab1, MsgTypeGameState)
	_ = bob.Close()
	waitClients(t, gs.Rooms["room"], 2)

	snap, _ := viewJSON(t, srv)
	if snap.RoomCount != 1 || len(snap.Rooms) != 1 || snap.WSClients != 2 {
		t.Fatalf("roomCount=%d rooms=%d wsClients=%d, want 1/1/2", snap.RoomCount, len(snap.Rooms), snap.WSClients)
	}
	if snap.RoomsCreated != 1 || snap.Joins != 3 {
		t.Errorf("roomsCreated=%d joins=%d, want 1/3", snap.RoomsCreated, snap.Joins)
	}
	room := snap.Rooms[0]
	if room.ID != "room" || room.MapURL != "https://maps.example/castle.png" {
		t.Errorf("room id=%q mapUrl=%q", room.ID, room.MapURL)
	}
	// Telemetry off: the room still has its roomId and the counters it
	// always keeps, but no hash-based ones.
	if room.RoomID != gs.Rooms["room"].telemetryID || room.RoomID == "" {
		t.Errorf("roomId = %q, want %q", room.RoomID, gs.Rooms["room"].telemetryID)
	}
	if snap.Telemetry || room.PeakConnections != 3 || room.StateUpdates != 2 ||
		room.DistinctPlayers != nil || room.HeroesSeen != nil {
		t.Errorf("telemetry=%v peak=%d updates=%d distinct=%s heroes=%v, want false/3/2/–/nil",
			snap.Telemetry, room.PeakConnections, room.StateUpdates, fmtCount(room.DistinctPlayers), room.HeroesSeen)
	}
	if len(room.Players) != 2 {
		t.Fatalf("players = %+v, want 2", room.Players)
	}
	byName := map[string]adminPlayer{}
	for _, p := range room.Players {
		byName[p.Name] = p
	}
	type want struct {
		conns                 int
		status, deck, hero    string
		deckN, handN, discard int
		left                  bool
	}
	for name, w := range map[string]want{
		"alice": {2, "connected", "Alice Deck", "Alice", 3, 1, 0, false},
		"bob":   {0, "left", "Bob Deck", "Bob", 1, 2, 1, true},
	} {
		p := byName[name]
		if p.Connections != w.conns || p.Status != w.status || p.DeckName != w.deck || p.HeroName != w.hero {
			t.Errorf("%s = %+v, want %+v", name, p, w)
		}
		if p.DeckCount == nil || *p.DeckCount != w.deckN || p.HandCount == nil || *p.HandCount != w.handN ||
			p.DiscardCount == nil || *p.DiscardCount != w.discard {
			t.Errorf("%s zone counts = %s/%s/%s, want %d/%d/%d", name,
				fmtCount(p.DeckCount), fmtCount(p.HandCount), fmtCount(p.DiscardCount), w.deckN, w.handN, w.discard)
		}
		if p.JoinedAt == 0 {
			t.Errorf("%s joinedAt unset", name)
		}
		if (p.LastSeenAt != 0) != w.left {
			t.Errorf("%s lastSeenAt = %d, left = %v", name, p.LastSeenAt, w.left)
		}
	}
	if byName["alice"].DeckID != "deck-a" || byName["bob"].Author != "ben" {
		t.Errorf("deckid/author = %q/%q", byName["alice"].DeckID, byName["bob"].Author)
	}
}

// A fresh joiner ({}), a garbage blob and a pool-less blob all render without
// deck fields instead of failing the page.
func TestAdminSnapshotToleratesMissingPool(t *testing.T) {
	gs, srv := startAdminServer(t, testAdminKey)
	alice := dial(t, srv, "alice")
	next(t, alice, MsgTypePlayerPosition)
	room := gs.Rooms["room"]
	room.mutex.Lock()
	room.FieldState.Players["garbage"] = json.RawMessage(`[1,2`)
	room.FieldState.Players["nopool"] = json.RawMessage(`{"rev":3}`)
	room.mutex.Unlock()

	snap, _ := viewJSON(t, srv)
	if len(snap.Rooms) != 1 || len(snap.Rooms[0].Players) != 3 {
		t.Fatalf("snapshot = %+v", snap)
	}
	for _, p := range snap.Rooms[0].Players {
		if p.DeckName != "" || p.HandCount != nil {
			t.Errorf("%s decoded deck fields from an empty blob: %+v", p.Name, p)
		}
	}
	if code, _, _ := getAdmin(t, srv, "/view", testAdminKey, true); code != http.StatusOK {
		t.Errorf("/view = %d", code)
	}
}

// The view is spectator-level: zone counts only, never which cards.
func TestAdminViewHidesCardNames(t *testing.T) {
	gs, srv := startAdminServer(t, testAdminKey)
	alice := dial(t, srv, "alice")
	next(t, alice, MsgTypePlayerPosition)
	send(t, alice, MsgTypePlayerState, `{"pool":{"deckName":"Alice Deck","hero":{"name":"Alice"},
		"deck":[{"title":"SecretDeckCard","boxSize":1}],
		"hand":[{"title":"SecretHandCard"}],
		"discard":[{"title":"SecretDiscardCard"}],
		"commit":{"main":{"title":"SecretCommitMain"},"boost":{"title":"SecretCommitBoost"},"reveal":false}}}`)
	next(t, alice, MsgTypeGameState)
	waitClients(t, gs.Rooms["room"], 1)

	_, jsonBody := viewJSON(t, srv)
	_, _, htmlBody := getAdmin(t, srv, "/view", testAdminKey, true)
	if !strings.Contains(jsonBody, "Alice Deck") || !strings.Contains(htmlBody, "Alice Deck") {
		t.Fatalf("deck name missing; json=%s", jsonBody)
	}
	for _, secret := range []string{"SecretDeckCard", "SecretHandCard", "SecretDiscardCard", "SecretCommitMain", "SecretCommitBoost"} {
		if strings.Contains(jsonBody, secret) {
			t.Errorf("view.json leaks %s", secret)
		}
		if strings.Contains(htmlBody, secret) {
			t.Errorf("view leaks %s", secret)
		}
	}
}

func TestAdminViewEscapesPlayerStrings(t *testing.T) {
	_, srv := startAdminServer(t, testAdminKey)
	evil := dial(t, srv, "%3Cscript%3Ealert(1)%3C%2Fscript%3E")
	next(t, evil, MsgTypePlayerPosition)
	send(t, evil, MsgTypePlayerState, `{"pool":{"deckName":"<img src=x onerror=alert(2)>"}}`)
	next(t, evil, MsgTypeGameState)

	_, _, body := getAdmin(t, srv, "/view", testAdminKey, true)
	if strings.Contains(body, "<script>") || strings.Contains(body, "<img") {
		t.Fatalf("unescaped player string in view:\n%s", body)
	}
	if !strings.Contains(body, "&lt;script&gt;alert(1)&lt;/script&gt;") {
		t.Fatalf("escaped name missing from view:\n%s", body)
	}
}

// With telemetry on, the view lines a room up with telemetry's Sandbox tab
// (gid and roomId side by side, room_closed's counters) without exposing the
// salt or anything hashed with it.
func TestAdminViewTelemetryCounters(t *testing.T) {
	sk := &sink{}
	sinkSrv := httptest.NewServer(sk)
	t.Cleanup(sinkSrv.Close)
	gs := NewGameServer(prometheus.NewRegistry())
	em := telemetry.NewHTTP(telemetry.Config{
		URL: sinkSrv.URL, Key: "test-key", Salt: "test-salt",
		FlushInterval: 10 * time.Millisecond,
	})
	gs.Telemetry = em
	gs.Mux = mux.NewRouter()
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)
	srv := httptest.NewServer(gs.handler(testAdminKey))
	t.Cleanup(srv.Close)
	if _, err := gs.CreateLobby(testLobby); err != nil {
		t.Fatal(err)
	}

	zelda := dialLobby(t, srv, "ZeldaQuill")
	next(t, zelda, MsgTypePlayerPosition)
	bob := dialLobby(t, srv, "BobbyTables")
	next(t, bob, MsgTypePlayerPosition)
	send(t, zelda, MsgTypePlayerState, `{"pool":{"hero":{"name":"Medusa"}}}`)
	next(t, bob, MsgTypeGameState)
	send(t, bob, MsgTypePlayerState, `{"pool":{"hero":{"name":"Achilles"}}}`)
	next(t, zelda, MsgTypeGameState)

	snap, jsonBody := viewJSON(t, srv)
	_, _, htmlBody := getAdmin(t, srv, "/view", testAdminKey, true)
	if !snap.Telemetry || len(snap.Rooms) != 1 {
		t.Fatalf("snapshot = %s", jsonBody)
	}
	room := snap.Rooms[0]
	wantID := gs.Rooms[testLobby].telemetryID
	if room.ID != testLobby || room.RoomID != wantID {
		t.Errorf("id=%q roomId=%q, want %q/%q", room.ID, room.RoomID, testLobby, wantID)
	}
	if room.PeakConnections != 2 || room.StateUpdates != 2 || room.DistinctPlayers == nil || *room.DistinctPlayers != 2 {
		t.Errorf("peak=%d updates=%d distinct=%s, want 2/2/2", room.PeakConnections, room.StateUpdates, fmtCount(room.DistinctPlayers))
	}
	if strings.Join(room.HeroesSeen, ",") != "Achilles,Medusa" {
		t.Errorf("heroesSeen = %v", room.HeroesSeen)
	}
	for _, out := range []string{jsonBody, htmlBody} {
		if !strings.Contains(out, testLobby) || !strings.Contains(out, wantID) {
			t.Errorf("gid or roomId missing from output")
		}
	}
	for _, secret := range []string{"test-salt", em.Hash("ZeldaQuill"), em.Hash("BobbyTables"), em.Hash(testLobby)} {
		if strings.Contains(jsonBody, secret) || strings.Contains(htmlBody, secret) {
			t.Errorf("view exposes %q", secret)
		}
	}
}
