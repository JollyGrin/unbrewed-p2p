package gameserver

import (
	"encoding/json"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	log "github.com/sirupsen/logrus"
	logtest "github.com/sirupsen/logrus/hooks/test"
)

func startServer(t *testing.T) (*GameServer, *httptest.Server) {
	t.Helper()
	gs := NewGameServer(prometheus.NewRegistry())
	gs.Mux = mux.NewRouter()
	gs.Mux.HandleFunc("/lobby/{gid}", gs.LobbyHandler)
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)
	srv := httptest.NewServer(gs.Mux)
	t.Cleanup(srv.Close)
	if _, err := gs.CreateLobby("room"); err != nil {
		t.Fatal(err)
	}
	return gs, srv
}

func dial(t *testing.T, srv *httptest.Server, name string) *websocket.Conn {
	t.Helper()
	url := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/room?name=" + name
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// next reads frames until one of msgtype arrives, returning its content.
func next(t *testing.T, c *websocket.Conn, msgtype string) json.RawMessage {
	t.Helper()
	_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
	for {
		_, raw, err := c.ReadMessage()
		if err != nil {
			t.Fatalf("waiting for %s: %v", msgtype, err)
		}
		var gm GameMessage
		if err := json.Unmarshal(raw, &gm); err != nil {
			t.Fatal(err)
		}
		if gm.MessageType == msgtype {
			return gm.Content
		}
	}
}

func send(t *testing.T, c *websocket.Conn, msgtype string, content string) {
	t.Helper()
	msg := `{"msgtype":"` + msgtype + `","content":` + content + `}`
	if err := c.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
		t.Fatal(err)
	}
}

// The client's join hold (#807) leans on this replay but must not require it;
// this pins what the repo relay sends so a change to it is deliberate.
func TestJoinReplaysStateAndPositions(t *testing.T) {
	_, srv := startServer(t)
	alice := dial(t, srv, "alice")
	if got := string(next(t, alice, MsgTypeGameState)); !strings.Contains(got, `"alice":{}`) {
		t.Fatalf("join gamestate = %s, want alice placeholder", got)
	}
	if got := string(next(t, alice, MsgTypePlayerPosition)); got != "{}" {
		t.Fatalf("join positions = %s, want {}", got)
	}
}

// Two connections under one name (two tabs, phone + laptop) both hear the
// room. Keyed by name, the newer one evicted the older from every broadcast.
func TestSameNameConnectionsBothReceiveBroadcasts(t *testing.T) {
	_, srv := startServer(t)
	tab1 := dial(t, srv, "alice")
	next(t, tab1, MsgTypePlayerPosition)
	tab2 := dial(t, srv, "alice")
	next(t, tab2, MsgTypePlayerPosition)
	next(t, tab1, MsgTypePlayerPosition) // tab2's join replay reaches tab1 too
	bob := dial(t, srv, "bob")
	next(t, bob, MsgTypePlayerPosition)
	next(t, tab1, MsgTypePlayerPosition)
	next(t, tab2, MsgTypePlayerPosition)

	send(t, bob, MsgTypePlayerState, `{"pool":{"hand":["x"]}}`)
	for i, c := range []*websocket.Conn{tab1, tab2} {
		if got := string(next(t, c, MsgTypeGameState)); !strings.Contains(got, `"bob":{"pool"`) {
			t.Fatalf("tab%d missed bob's update: %s", i+1, got)
		}
	}

	// A write from one tab reaches the other.
	send(t, tab1, MsgTypePlayerPosition, `{"tokens":[{"id":"t1"}]}`)
	if got := string(next(t, tab2, MsgTypePlayerPosition)); !strings.Contains(got, `"t1"`) {
		t.Fatalf("tab2 missed tab1's write: %s", got)
	}
}

// One tab leaving must not take the other out of the room.
func TestClosingOneSameNameConnectionKeepsTheOther(t *testing.T) {
	gs, srv := startServer(t)
	tab1 := dial(t, srv, "alice")
	next(t, tab1, MsgTypePlayerPosition)
	tab2 := dial(t, srv, "alice")
	next(t, tab2, MsgTypePlayerPosition)
	_ = tab1.Close()

	room := gs.Rooms["room"]
	deadline := time.Now().Add(2 * time.Second)
	for {
		room.mutex.Lock()
		n := len(room.Clients)
		room.mutex.Unlock()
		if n == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("clients = %d after tab1 closed, want 1", n)
		}
		time.Sleep(10 * time.Millisecond)
	}

	bob := dial(t, srv, "bob")
	next(t, bob, MsgTypePlayerPosition)
	next(t, tab2, MsgTypePlayerPosition)
	send(t, bob, MsgTypePlayerState, `{"pool":{}}`)
	if got := string(next(t, tab2, MsgTypeGameState)); !strings.Contains(got, `"bob"`) {
		t.Fatalf("tab2 missed bob's update: %s", got)
	}
}

// The account/discord labels are optional: a guest URL (name only) joins as
// before, and a signed-in one's labels land on the roster, cleaned.
func TestJoinCarriesOptionalIdentityLabels(t *testing.T) {
	gs, srv := startServer(t)
	guest := dial(t, srv, "guest")
	next(t, guest, MsgTypePlayerPosition)

	long := strings.Repeat("a", 70)
	q := url.Values{}
	q.Set("account", "  acct-1  ")
	q.Set("discord", "dean\n\x07"+long)
	signed := dial(t, srv, "alice&"+q.Encode())
	next(t, signed, MsgTypePlayerPosition)

	roster := gs.Rooms["room"].Roster()
	if len(roster) != 2 {
		t.Fatalf("roster = %+v, want 2 entries", roster)
	}
	if g := roster[0]; g.Name != "guest" || g.AccountID != "" || g.Discord != "" || g.JoinedAt.IsZero() {
		t.Fatalf("guest entry = %+v", g)
	}
	s := roster[1]
	if s.Name != "alice" || s.AccountID != "acct-1" {
		t.Fatalf("signed-in entry = %+v", s)
	}
	if want := ("dean" + long)[:maxLabelLen]; s.Discord != want {
		t.Fatalf("discord = %q, want %q", s.Discord, want)
	}
	if !s.JoinedAt.After(roster[0].JoinedAt) {
		t.Fatalf("roster not ordered by join: %+v", roster)
	}
}

func TestJoinAndExitLogIdentityFields(t *testing.T) {
	hook := logtest.NewGlobal()
	t.Cleanup(func() { log.StandardLogger().ReplaceHooks(make(log.LevelHooks)) })
	gs, srv := startServer(t)
	c := dial(t, srv, "logan&account=acct-1&discord=dean")
	next(t, c, MsgTypePlayerPosition)
	_ = c.Close()
	waitClients(t, gs.Rooms["room"], 0)

	// The hook is global: earlier tests' connections may still be logging
	// their exits, so match on this test's player too.
	find := func(msg string) *log.Entry {
		for _, e := range hook.AllEntries() {
			if e.Message == msg && e.Data["name"] == "logan" {
				return e
			}
		}
		t.Fatalf("no %q log line", msg)
		return nil
	}
	for _, msg := range []string{"player joined", "read failed: player exited", "player exited"} {
		e := find(msg)
		if e.Data["gid"] != "room" || e.Data["name"] != "logan" || e.Data["account"] != "acct-1" || e.Data["discord"] != "dean" {
			t.Fatalf("%q fields = %v", msg, e.Data)
		}
	}
	if n := find("player joined").Data["clients"]; n != 1 {
		t.Fatalf("join clients = %v, want 1", n)
	}
	if n := find("player exited").Data["clients"]; n != 0 {
		t.Fatalf("exit clients = %v, want 0", n)
	}
}
