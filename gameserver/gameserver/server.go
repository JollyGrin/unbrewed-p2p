package gameserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	log "github.com/sirupsen/logrus"
)

type GameServer struct {
	HTTPServer *http.Server
	Mux        *mux.Router
	ctx        context.Context

	roomLock sync.RWMutex
	Rooms    map[string]*Room
}

func NewGameServer() *GameServer {
	gs := new(GameServer)
	gs.HTTPServer = &http.Server{}
	gs.Rooms = make(map[string]*Room)

	return gs
}

func (gs *GameServer) Serve(ctx context.Context) error {
	gs.Mux = mux.NewRouter()

	gs.Mux.HandleFunc("/lobby/{gid}", gs.LobbyHandler)
	gs.Mux.HandleFunc("/ws/{gid}", gs.WSHandler)

	gs.HTTPServer.Handler = handlers.CORS()(gs.Mux)
	gs.HTTPServer.Addr = "0.0.0.0:1111"
	go gs.GarbageCollector(ctx)

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
	homeTemplate.Execute(w, "ws://api.unbrewed.xyz/ws/"+gid)

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

	gs.Rooms[gid] = NewRoom(gid, gs.ctx)

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

		start := time.Now()
		gs.roomLock.Lock()
		closed := 0
		for gid, room := range gs.Rooms {
			if time.Since(room.FieldState.LastUpdate) > time.Hour*12 {
				// Close the room to kill any active go routines, all clients
				// will be disconnected if present.
				room.Close()
				delete(gs.Rooms, gid)
				log.WithFields(log.Fields{
					"time":       start,
					"inactivity": time.Since(room.FieldState.LastUpdate),
					"gid":        gid,
				}).Info("room removed due to inactivity")
				closed++
			}
			var _ = gid
		}
		gs.roomLock.Unlock()

		if closed > 0 {
			log.WithFields(log.Fields{
				"time":         start,
				"dur":          time.Since(start),
				"closed_count": closed,
			}).Info("GC Run")
		}
	}
}

type PlayerConn struct {
	Name string
	*websocket.Conn
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
	GameID  string
	WS      *websocket.Upgrader
	Clients map[string]*PlayerConn

	PlayerPositions map[string]json.RawMessage
	FieldState      *GameState

	mutex sync.Mutex

	ctx  context.Context
	stop context.CancelFunc
}

func NewRoom(gid string, ctx context.Context) *Room {
	r := new(Room)
	r.GameID = gid
	r.FieldState = NewGameState(gid)
	r.PlayerPositions = make(map[string]json.RawMessage)
	r.WS = &websocket.Upgrader{CheckOrigin: func(r *http.Request) bool {
		return true
	}}
	r.ctx, r.stop = context.WithCancel(ctx)
	r.Clients = make(map[string]*PlayerConn)

	return r
}

func (r *Room) Close() {
	r.stop()
	for _, c := range r.Clients {
		_ = c.Close()
	}
}

func (r *Room) PlayerJoin(c *websocket.Conn, name string) error {
	player := &PlayerConn{
		Conn: c,
		Name: name,
	}

	if name == "" {
		return fmt.Errorf("must provide a player name")
	}

	r.mutex.Lock()
	defer r.mutex.Unlock()
	_, ok := r.Clients[name]
	if ok {
		// return fmt.Errorf("player name taken")
	}
	r.Clients[name] = player
	if _, ok := r.FieldState.Players[name]; !ok {
		r.FieldState.Players[name] = []byte("{}")
		r.FieldState.LastUpdate = time.Now()
	}

	go r.PlayerListener(player, r.ctx)
	r.broadcastAll(websocket.TextMessage, r.GetGameState())

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
		r.PlayerPositions[c.Name] = gm.Content
		msg := r.GetPlayerPositions()
		r.FieldState.LastUpdate = time.Now()
		r.broadcastAll(websocket.TextMessage, msg)
		r.mutex.Unlock()

	case MsgTypePlayerState:
		// Update player state
		r.mutex.Lock()
		r.FieldState.Players[c.Name] = gm.Content
		r.FieldState.LastUpdate = time.Now()
		msg := r.GetGameState()
		r.broadcastAll(websocket.TextMessage, msg)
		r.mutex.Unlock()
	case MsgTypePing:
		msg, _ := json.Marshal(GameMessage{
			MessageType: MsgTypePong,
		})
		_ = c.WriteMessage(websocket.TextMessage, msg)
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
	for _, c := range r.Clients {
		err := c.WriteMessage(mt, msg)
		if err != nil {
			log.WithError(err).Error("write failed")
		}
	}
}

func (r *Room) PlayerExit(c *PlayerConn) bool {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	_, ok := r.Clients[c.Name]
	delete(r.Clients, c.Name)

	return ok
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
