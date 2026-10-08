package gameserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/Emyrk/unbrewed-server/telemetry"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	log "github.com/sirupsen/logrus"
)

type gameServerMetrics struct {
	GCRoomsCloseCounter  prometheus.Counter
	GCRoomLifetime       prometheus.Histogram
	OpenRooms            prometheus.Gauge
	PlayerJoinEventCount prometheus.Gauge
}

type GameServer struct {
	HTTPServer *http.Server
	Mux        *mux.Router
	ctx        context.Context
	registry   prometheus.Registerer
	metrics    *gameServerMetrics
	// Telemetry receives sandbox room/player events. Noop unless main wires
	// one up from the environment.
	Telemetry telemetry.Emitter

	roomLock sync.RWMutex
	Rooms    map[string]*Room
}

func NewGameServer(reg prometheus.Registerer) *GameServer {
	gs := new(GameServer)
	gs.HTTPServer = &http.Server{}
	gs.Rooms = make(map[string]*Room)
	gs.ctx = context.Background()
	gs.registry = reg
	gs.Telemetry = telemetry.Noop{}

	fact := promauto.With(gs.registry)
	gs.metrics = &gameServerMetrics{
		GCRoomsCloseCounter: fact.NewCounter(prometheus.CounterOpts{
			Namespace:   "unbrewed",
			Subsystem:   "gameserver",
			Name:        "gc_rooms_closed",
			Help:        "Total count of rooms closed",
			ConstLabels: nil,
		}),

		GCRoomLifetime: fact.NewHistogram(prometheus.HistogramOpts{
			Namespace: "unbrewed",
			Subsystem: "gameserver",
			Name:      "gc_room_lifetime",
			Help:      "Lifetime of a room before it is closed due to inactivity",
			// 24hrs, 12hrs, 6hrs, 1hr, 40m, 20m, 10m, 5m, 1m
			Buckets: []float64{60, 5 * 60, 10 * 60, 20 * 60, 40 * 60, 60 * 60, 60 * 60 * 12, 60 * 60 * 24},
		}),

		OpenRooms: fact.NewGauge(prometheus.GaugeOpts{
			Namespace: "unbrewed",
			Subsystem: "gameserver",
			Name:      "open_rooms_count",
			Help:      "Total count of open rooms",
		}),

		PlayerJoinEventCount: fact.NewGauge(prometheus.GaugeOpts{
			Namespace: "unbrewed",
			Subsystem: "gameserver",
			Name:      "player_join_event_count",
			Help:      "Total count of player join events",
		}),
	}

	return gs
}

func (gs *GameServer) Serve(ctx context.Context) error {
	gs.Mux = mux.NewRouter()

	gs.Mux.HandleFunc("/lobby/{gid}", gs.LobbyHandler)
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)

	gs.HTTPServer.Handler = handlers.CORS()(gs.Mux)
	port := os.Getenv("PORT")
	if port == "" {
		port = "1111"
	}
	gs.HTTPServer.Addr = "0.0.0.0:" + port
	go gs.GarbageCollector(ctx)
	gs.ctx = ctx

	return gs.HTTPServer.ListenAndServe()
}

func (gs *GameServer) LobbyHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	w.WriteHeader(http.StatusOK)
	gid := vars["gid"]
	new, err := gs.CreateLobby(gid)
	if err != nil {
		log.WithError(err).Errorf("failed to make the game room")
		fmt.Fprintf(w, "Unable to make the game room: %v\n", err)
		return
	}
	if new {
		log.WithFields(log.Fields{"gid": gid}).Info("new game room created")
	}

	// fmt.Fprintf(w, "Game ID: %v\n", vars["gid"])
	homeTemplate.Execute(w, "ws://unbrewed-api.vercel.app/ws/"+gid)

}

func (gs *GameServer) WSHandler(w http.ResponseWriter, r *http.Request) {
	log.Info("Websocket attempt started")
	vars := mux.Vars(r)
	gid := vars["gid"]
	gs.roomLock.RLock()
	room, ok := gs.Rooms[gid]
	gs.roomLock.RUnlock()
	if !ok {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = fmt.Fprintf(w, "Unable to find the game room socket: %v\n", fmt.Errorf("gid: %s", gid))
		log.Errorf("Unable to find the game room socket: %v\n", fmt.Errorf("gid: %s", gid))
		return
	}

	c, err := room.WS.Upgrade(w, r, nil)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		log.WithError(err).Errorf("failed to upgrade websocket")
		return
	}

	values, _ := url.ParseQuery(r.URL.RawQuery)
	if len(values["name"]) == 0 {
		w.WriteHeader(http.StatusFailedDependency)
		_, _ = fmt.Fprintf(w, "required 'playername' header not found")
		return
	}
	name := strings.Join(values["name"], " ")

	gs.metrics.PlayerJoinEventCount.Inc()
	err = room.PlayerJoin(c, name)
	if err != nil {
		_, _ = fmt.Fprintf(w, "player failed to join: %s", err.Error())
		return
	}
}

func (gs *GameServer) CreateLobby(gid string) (bool, error) {
	if gid == "" {
		return false, fmt.Errorf("game id cannot be blank")
	}

	gs.roomLock.Lock()
	defer gs.roomLock.Unlock()
	_, ok := gs.Rooms[gid]
	if ok {
		return false, nil
	}

	room := NewRoom(gid, gs.ctx)
	room.telemetry = gs.Telemetry
	gs.Rooms[gid] = room
	gs.metrics.OpenRooms.Set(float64(len(gs.Rooms)))
	if gs.Telemetry.Enabled() {
		gs.Telemetry.Emit(telemetry.RoomOpened(gid))
	}

	return true, nil
}

func (gs *GameServer) GarbageCollector(ctx context.Context) {
	ticker := time.NewTicker(time.Minute * 30)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
		gs.collectGarbage()
	}
}

func (gs *GameServer) collectGarbage() {
	start := time.Now()
	gs.roomLock.Lock()
	closed := 0
	for gid, room := range gs.Rooms {
		room.mutex.Lock()
		if time.Since(room.FieldState.LastUpdate) > time.Hour*12 {
			// Close the room to kill any active go routines, all clients
			// will be disconnected if present.
			room.Close()
			room.emitClosed(telemetry.ReasonInactive)
			gs.metrics.GCRoomsCloseCounter.Inc()
			gs.metrics.GCRoomLifetime.Observe(room.FieldState.LastUpdate.Sub(room.openedAt).Seconds())
			delete(gs.Rooms, gid)
			log.WithFields(log.Fields{
				"time":       start,
				"inactivity": time.Since(room.FieldState.LastUpdate),
				"gid":        gid,
			}).Info("room removed due to inactivity")
			closed++
		}
		room.mutex.Unlock()
	}
	gs.roomLock.Unlock()

	if closed > 0 {
		log.WithFields(log.Fields{
			"time":         start,
			"dur":          time.Since(start),
			"closed_count": closed,
		}).Info("GC Run")
	}
	gs.metrics.OpenRooms.Set(float64(len(gs.Rooms)))
}

// EmitShutdown reports every open room as closed by a relay shutdown. The
// caller still has to flush the emitter before exiting.
func (gs *GameServer) EmitShutdown() {
	gs.roomLock.RLock()
	defer gs.roomLock.RUnlock()
	for _, room := range gs.Rooms {
		room.mutex.Lock()
		room.emitClosed(telemetry.ReasonShutdown)
		room.mutex.Unlock()
	}
}

type PlayerConn struct {
	Name string
	// hash is Name as telemetry sees it; empty when telemetry is off.
	hash string
	*websocket.Conn
	// Serializes writes: gorilla conns forbid concurrent WriteMessage, and
	// with permessage-deflate a racing write corrupts the flate stream for
	// the receiver instead of panicking. Broadcasts and direct replies
	// (pong) share connections, so every write must go through Send.
	writeMu sync.Mutex
}

func (c *PlayerConn) Send(mt int, msg []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	// A dead-but-not-closed socket must error out instead of blocking the
	// room forever — broadcastAll runs under the room mutex.
	_ = c.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.WriteMessage(mt, msg)
}

type GameState struct {
	GameID     string                     `json:"gid"`
	Players    map[string]json.RawMessage `json:"players"`
	LastUpdate time.Time                  `json:"last_updated"`
}

func NewGameState(gid string) *GameState {
	gs := new(GameState)
	gs.Players = make(map[string]json.RawMessage)
	gs.GameID = gid
	gs.LastUpdate = time.Now()

	return gs
}

type Room struct {
	GameID string
	WS     *websocket.Upgrader
	// Every live connection, keyed by the connection itself — not by player
	// name. Two tabs (or a phone and a laptop) under one name are two
	// connections to one blob; keyed by name, the newer one silently evicted
	// the older from every broadcast, which then acted on a board it could no
	// longer see (issue #807).
	Clients map[*PlayerConn]struct{}

	PlayerPositions map[string]json.RawMessage
	FieldState      *GameState

	mutex sync.Mutex

	openedAt time.Time
	ctx      context.Context
	stop     context.CancelFunc

	// Sandbox telemetry, guarded by mutex. playerHashes and heroesSeen are
	// only filled while telemetry is enabled.
	telemetry    telemetry.Emitter
	playerHashes map[string]struct{}
	heroesSeen   map[string]struct{} // playerHash + "\x00" + heroName
	peakClients  int
	stateUpdates int64
}

func NewRoom(gid string, ctx context.Context) *Room {
	r := new(Room)
	r.GameID = gid
	r.FieldState = NewGameState(gid)
	r.PlayerPositions = make(map[string]json.RawMessage)
	r.WS = &websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
		// permessage-deflate: game state / position JSON is extremely
		// repetitive (same keys and card text on every drag tick), so this
		// shrinks broadcasts ~5-10x. Browsers negotiate it automatically;
		// clients that don't offer it just get uncompressed frames.
		EnableCompression: true,
	}
	r.ctx, r.stop = context.WithCancel(ctx)
	r.Clients = make(map[*PlayerConn]struct{})
	r.openedAt = time.Now()
	r.telemetry = telemetry.Noop{}
	r.playerHashes = make(map[string]struct{})
	r.heroesSeen = make(map[string]struct{})

	return r
}

// emitClosed reports the room's end. Lifetime is open to last activity, as
// the gc_room_lifetime metric measures it. Caller holds r.mutex.
func (r *Room) emitClosed(reason string) {
	if !r.telemetry.Enabled() {
		return
	}
	r.telemetry.Emit(telemetry.RoomClosed(r.GameID, reason,
		r.FieldState.LastUpdate.Sub(r.openedAt),
		len(r.playerHashes), r.peakClients, r.stateUpdates))
}

// emitLeft reports a connection removed from Clients. Caller holds r.mutex.
func (r *Room) emitLeft(c *PlayerConn) {
	if r.telemetry.Enabled() {
		r.telemetry.Emit(telemetry.PlayerLeft(r.GameID, c.hash, len(r.Clients)))
	}
}

// heroName pulls pool.hero.name out of an otherwise opaque player blob.
func (r *Room) heroName(blob json.RawMessage) string {
	if !r.telemetry.Enabled() {
		return ""
	}
	var state struct {
		Pool struct {
			Hero struct {
				Name string `json:"name"`
			} `json:"hero"`
		} `json:"pool"`
	}
	if json.Unmarshal(blob, &state) != nil {
		return ""
	}
	return telemetry.TruncateHeroName(state.Pool.Hero.Name)
}

// noteHero emits hero_seen once per (player, hero). Caller holds r.mutex.
func (r *Room) noteHero(c *PlayerConn, hero string) {
	if hero == "" || !r.telemetry.Enabled() {
		return
	}
	key := c.hash + "\x00" + hero
	if _, ok := r.heroesSeen[key]; ok {
		return
	}
	r.heroesSeen[key] = struct{}{}
	r.telemetry.Emit(telemetry.HeroSeen(r.GameID, c.hash, hero))
}

func (r *Room) Close() {
	r.stop()
	for c := range r.Clients {
		_ = c.Close()
	}
}

func (r *Room) PlayerJoin(c *websocket.Conn, name string) error {
	player := &PlayerConn{
		Conn: c,
		Name: name,
		hash: r.telemetry.PlayerHash(name),
	}

	if name == "" {
		return fmt.Errorf("must provide a player name")
	}

	// Largest legit message is a full pool (~15KB); 256KB is ample headroom.
	// Without a limit, permessage-deflate turns one tiny hostile frame into a
	// decompression bomb (the limit is checked against decompressed bytes as
	// they stream out, so this also caps bomb inflation).
	c.SetReadLimit(256 * 1024)

	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.Clients[player] = struct{}{}
	if len(r.Clients) > r.peakClients {
		r.peakClients = len(r.Clients)
	}
	if r.telemetry.Enabled() {
		r.playerHashes[player.hash] = struct{}{}
		r.telemetry.Emit(telemetry.PlayerJoined(r.GameID, player.hash, len(r.Clients)))
	}
	if _, ok := r.FieldState.Players[name]; !ok {
		r.FieldState.Players[name] = []byte("{}")
		r.FieldState.LastUpdate = time.Now()
	}

	go r.PlayerListener(player, r.ctx)
	r.broadcastAll(websocket.TextMessage, r.GetGameState())
	// Replay board positions too — without this a rejoining player sees an
	// empty board until someone moves a token, and their client's
	// starter-token fallback then overwrites (destroys) their real blob.
	r.broadcastAll(websocket.TextMessage, r.GetPlayerPositions())

	return nil
}

func (r *Room) PlayerListener(c *PlayerConn, ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			r.PlayerExit(c)
			return // Player closed
		default:
		}

		mt, message, err := c.ReadMessage()
		if err != nil {
			log.WithError(err).Error("read failed: player exited")
			r.PlayerExit(c)
			break
		}
		r.HandleMessage(c, mt, message)
	}
}

func (r *Room) HandleMessage(c *PlayerConn, mt int, msg []byte) {
	gm := new(GameMessage)
	err := json.Unmarshal(msg, gm)
	if err != nil {
		log.WithError(err).Errorf("msg from client not able to decode: %s", msg)
		return
	}
	switch gm.MessageType {
	case MsgTypePlayerPosition:
		r.mutex.Lock()
		r.stateUpdates++
		r.PlayerPositions[c.Name] = gm.Content
		msg := r.GetPlayerPositions()
		r.FieldState.LastUpdate = time.Now()
		r.broadcastAll(websocket.TextMessage, msg)
		r.mutex.Unlock()

	case MsgTypePlayerState:
		// Update player state
		hero := r.heroName(gm.Content) // decoded outside the lock
		r.mutex.Lock()
		r.stateUpdates++
		r.noteHero(c, hero)
		r.FieldState.Players[c.Name] = gm.Content
		r.FieldState.LastUpdate = time.Now()
		msg := r.GetGameState()
		r.broadcastAll(websocket.TextMessage, msg)
		r.mutex.Unlock()
	case MsgTypePing:
		msg, _ := json.Marshal(GameMessage{
			MessageType: MsgTypePong,
		})
		_ = c.Send(websocket.TextMessage, msg)
	default:
		log.Errorf("msg type '%s' is undefined", gm.MessageType)
	}
}

func (r *Room) GetGameState() []byte {
	data, err := json.Marshal(r.FieldState)
	if err != nil {
		log.WithError(err).Errorf("failed to marshal game state")
	}
	msg, err := json.Marshal(GameMessage{
		MessageType: MsgTypeGameState,
		Content:     data,
	})
	if err != nil {
		log.WithError(err).Errorf("failed to marshal game state")
	}
	return msg
}

func (r *Room) BroadcastAll(mt int, msg []byte) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.broadcastAll(mt, msg)
}

func (r *Room) broadcastAll(mt int, msg []byte) {
	for c := range r.Clients {
		err := c.Send(mt, msg)
		if err != nil {
			// A failed write leaves the conn unusable, and a dead-but-open one
			// would cost every later broadcast the full write deadline. Drop
			// it; its read loop errors out next and PlayerExit is a no-op.
			log.WithError(err).Error("write failed: dropping connection")
			delete(r.Clients, c)
			_ = c.Close()
			r.emitLeft(c)
		}
	}
}

func (r *Room) PlayerExit(c *PlayerConn) bool {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	// Removes only THIS connection: on a page refresh the new one can join
	// before the old one's read loop notices the close, and a second tab
	// under the same name keeps its own entry.
	if _, ok := r.Clients[c]; !ok {
		return false
	}
	delete(r.Clients, c)
	r.emitLeft(c)
	return true
}

func (r *Room) GetPlayerPositions() []byte {
	data, err := json.Marshal(r.PlayerPositions)
	if err != nil {
		log.WithError(err).Errorf("failed to marshal player positions")
	}
	msg, err := json.Marshal(GameMessage{
		MessageType: MsgTypePlayerPosition,
		Content:     data,
	})
	if err != nil {
		log.WithError(err).Errorf("failed to marshal player positions")
	}
	return msg
}
