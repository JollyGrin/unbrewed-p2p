package gameserver

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"sort"
	"sync/atomic"
	"time"

	"github.com/gorilla/handlers"
	log "github.com/sirupsen/logrus"
)

// handler is the relay's root handler: the game routes behind the CORS
// wildcard, plus /view and /view.json outside it when adminKey is set. With
// no key the admin routes don't exist and fall through to a 404.
func (gs *GameServer) handler(adminKey string) http.Handler {
	game := handlers.CORS()(gs.Mux)
	if adminKey == "" {
		return game
	}
	root := http.NewServeMux()
	root.Handle("/view", gs.adminOnly(adminKey, gs.viewHTML))
	root.Handle("/view.json", gs.adminOnly(adminKey, gs.viewJSON))
	root.Handle("/", game)
	return root
}

// adminAuthorized checks HTTP Basic auth: any username, password = adminKey.
// Both sides are hashed so the constant-time compare sees equal lengths.
func adminAuthorized(r *http.Request, adminKey string) bool {
	_, password, ok := r.BasicAuth()
	if !ok || adminKey == "" {
		return false
	}
	a := sha256.Sum256([]byte(password))
	b := sha256.Sum256([]byte(adminKey))
	return subtle.ConstantTimeCompare(a[:], b[:]) == 1
}

func (gs *GameServer) adminOnly(adminKey string, h http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !adminAuthorized(r, adminKey) {
			w.Header().Set("WWW-Authenticate", `Basic realm="unbrewed-sandbox admin"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Cache-Control", "no-store")
		h(w, r)
	})
}

type adminSnapshot struct {
	UptimeMs     int64 `json:"uptimeMs"`
	WSClients    int   `json:"wsClients"`
	RoomCount    int   `json:"roomCount"`
	RoomsCreated int64 `json:"roomsCreated"`
	Joins        int64 `json:"joins"`
	// Telemetry says whether roomId values line up with telemetry's Sandbox
	// tab, and whether distinctPlayers/heroesSeen are being counted.
	Telemetry bool        `json:"telemetry"`
	Rooms     []adminRoom `json:"rooms"`
}

type adminRoom struct {
	ID      string        `json:"id"`     // lobby gid
	RoomID  string        `json:"roomId"` // this sitting's telemetry roomId
	AgeMs   int64         `json:"ageMs"`
	IdleMs  int64         `json:"idleMs"`
	MapURL  string        `json:"mapUrl,omitempty"`
	Players []adminPlayer `json:"players"`

	// The room's telemetry counters, as room_closed reports them. Only
	// peakConnections and stateUpdates are kept with telemetry off.
	PeakConnections int      `json:"peakConnections"`
	StateUpdates    int64    `json:"stateUpdates"`
	DistinctPlayers *int     `json:"distinctPlayers,omitempty"`
	HeroesSeen      []string `json:"heroesSeen,omitempty"`
}

type adminPlayer struct {
	Name        string `json:"name"`
	Connections int    `json:"connections"`
	Status      string `json:"status"`   // connected | left
	JoinedAt    int64  `json:"joinedAt"` // unix ms, first join
	LastSeenAt  int64  `json:"lastSeenAt,omitempty"`

	// Unverified labels from the name's most recent live connection (see
	// Identity); empty once the name has left.
	Account string `json:"account,omitempty"`
	Discord string `json:"discord,omitempty"` // unix ms, last connection exited

	// From the player's blob; empty when there is no pool or it won't decode.
	DeckName     string `json:"deckName,omitempty"`
	DeckID       string `json:"deckid,omitempty"`
	HeroName     string `json:"heroName,omitempty"`
	Author       string `json:"author,omitempty"`
	DeckCount    *int   `json:"deckCount,omitempty"`
	HandCount    *int   `json:"handCount,omitempty"`
	DiscardCount *int   `json:"discardCount,omitempty"`
}

// adminBlob is the only part of a player blob the admin view reads. Zones
// decode into empty structs: the view gets counts, never card contents.
type adminBlob struct {
	MapURL string `json:"mapUrl"`
	Pool   *struct {
		DeckName string `json:"deckName"`
		DeckID   string `json:"deckid"`
		Author   string `json:"author"`
		Hero     struct {
			Name string `json:"name"`
		} `json:"hero"`
		Deck    []struct{} `json:"deck"`
		Hand    []struct{} `json:"hand"`
		Discard []struct{} `json:"discard"`
	} `json:"pool"`
}

// roomCopy is what snapshot copies out of a Room under its lock.
type roomCopy struct {
	id         string
	roomID     string
	peak       int
	updates    int64
	telemetry  bool
	distinct   int
	heroes     []string
	openedAt   time.Time
	lastUpdate time.Time
	blobs      map[string]json.RawMessage
	conns      map[string]int
	presence   map[string]presence
	identity   map[string]Identity // name -> most recent live connection's
}

func (gs *GameServer) snapshot() adminSnapshot {
	gs.roomLock.RLock()
	rooms := make([]*Room, 0, len(gs.Rooms))
	for _, room := range gs.Rooms {
		rooms = append(rooms, room)
	}
	gs.roomLock.RUnlock()

	copies := make([]roomCopy, 0, len(rooms))
	for _, room := range rooms {
		rc := room.adminCopy()
		rc.identity = latestIdentity(room.Roster())
		copies = append(copies, rc)
	}

	now := time.Now()
	snap := adminSnapshot{
		UptimeMs:     now.Sub(gs.startedAt).Milliseconds(),
		RoomCount:    len(copies),
		RoomsCreated: atomic.LoadInt64(&gs.roomsCreated),
		Joins:        atomic.LoadInt64(&gs.joins),
		Rooms:        make([]adminRoom, 0, len(copies)),
		Telemetry:    gs.Telemetry.Enabled(),
	}
	sort.Slice(copies, func(i, j int) bool {
		return copies[i].lastUpdate.After(copies[j].lastUpdate)
	})
	for _, rc := range copies {
		ar := adminRoom{
			ID:              rc.id,
			RoomID:          rc.roomID,
			PeakConnections: rc.peak,
			StateUpdates:    rc.updates,
			AgeMs:           now.Sub(rc.openedAt).Milliseconds(),
			IdleMs:          now.Sub(rc.lastUpdate).Milliseconds(),
			Players:         make([]adminPlayer, 0, len(rc.blobs)),
		}
		if rc.telemetry {
			ar.DistinctPlayers = intPtr(rc.distinct)
			sort.Strings(rc.heroes)
			ar.HeroesSeen = rc.heroes
		}
		for name, blob := range rc.blobs {
			p := adminPlayer{
				Name:        name,
				Connections: rc.conns[name],
				Status:      "left",
			}
			if p.Connections > 0 {
				p.Status = "connected"
			}
			snap.WSClients += p.Connections
			if id, ok := rc.identity[name]; ok {
				p.Account, p.Discord = id.AccountID, id.Discord
			}
			if pr, ok := rc.presence[name]; ok {
				p.JoinedAt = unixMs(pr.joinedAt)
				p.LastSeenAt = unixMs(pr.lastSeenAt)
			}
			var b adminBlob
			if err := json.Unmarshal(blob, &b); err == nil {
				if ar.MapURL == "" {
					ar.MapURL = b.MapURL
				}
				if pool := b.Pool; pool != nil {
					p.DeckName = pool.DeckName
					p.DeckID = pool.DeckID
					p.HeroName = pool.Hero.Name
					p.Author = pool.Author
					p.DeckCount = intPtr(len(pool.Deck))
					p.HandCount = intPtr(len(pool.Hand))
					p.DiscardCount = intPtr(len(pool.Discard))
				}
			}
			ar.Players = append(ar.Players, p)
		}
		sort.Slice(ar.Players, func(i, j int) bool {
			return ar.Players[i].JoinedAt < ar.Players[j].JoinedAt ||
				(ar.Players[i].JoinedAt == ar.Players[j].JoinedAt && ar.Players[i].Name < ar.Players[j].Name)
		})
		snap.Rooms = append(snap.Rooms, ar)
	}
	return snap
}

// adminCopy copies the fields the admin view needs, holding r.mutex only for
// the copy. Blobs are replaced, never mutated, so sharing the bytes is safe.
func (r *Room) adminCopy() roomCopy {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	rc := roomCopy{
		id:         r.GameID,
		roomID:     r.telemetryID,
		peak:       r.peakClients,
		updates:    r.stateUpdates,
		telemetry:  r.telemetry.Enabled(),
		distinct:   len(r.playerHashes),
		openedAt:   r.openedAt,
		lastUpdate: r.FieldState.LastUpdate,
		blobs:      make(map[string]json.RawMessage, len(r.FieldState.Players)),
		conns:      make(map[string]int),
		presence:   make(map[string]presence, len(r.presence)),
	}
	for name, blob := range r.FieldState.Players {
		rc.blobs[name] = blob
	}
	for c := range r.Clients {
		rc.conns[c.Name]++
	}
	for name, p := range r.presence {
		rc.presence[name] = *p
	}
	// Hero names only: heroesSeen is keyed by playerHash, which stays here.
	heroes := make(map[string]struct{})
	for _, seen := range r.heroesSeen {
		for hero := range seen {
			heroes[hero] = struct{}{}
		}
	}
	for hero := range heroes {
		rc.heroes = append(rc.heroes, hero)
	}
	return rc
}

// latestIdentity maps each name to its newest connection's identity. Roster
// is oldest join first, so later entries win.
func latestIdentity(roster []RosterEntry) map[string]Identity {
	out := make(map[string]Identity, len(roster))
	for _, e := range roster {
		out[e.Name] = Identity{AccountID: e.AccountID, Discord: e.Discord}
	}
	return out
}

// noteExit stamps lastSeenAt once a name has no connection left. Caller holds
// r.mutex and has already removed the exiting connection from Clients.
func (r *Room) noteExit(name string) {
	for c := range r.Clients {
		if c.Name == name {
			return
		}
	}
	if p, ok := r.presence[name]; ok {
		p.lastSeenAt = time.Now()
	}
}

func unixMs(t time.Time) int64 {
	if t.IsZero() {
		return 0
	}
	return t.UnixNano() / int64(time.Millisecond)
}

func intPtr(n int) *int { return &n }

func (gs *GameServer) viewJSON(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(gs.snapshot()); err != nil {
		log.WithError(err).Error("admin: failed to write view.json")
	}
}

func (gs *GameServer) viewHTML(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := adminPage.Execute(w, gs.snapshot()); err != nil {
		log.WithError(err).Error("admin: failed to render view")
	}
}

func fmtDuration(ms int64) string {
	s := ms / 1000
	switch {
	case s < 60:
		return fmt.Sprintf("%ds", s)
	case s < 3600:
		return fmt.Sprintf("%dm", s/60)
	case s < 86400:
		return fmt.Sprintf("%dh%02dm", s/3600, s/60%60)
	default:
		return fmt.Sprintf("%dd%02dh", s/86400, s/3600%24)
	}
}

func fmtAgo(unixMilli int64) string {
	if unixMilli == 0 {
		return ""
	}
	return fmtDuration(time.Now().UnixNano()/int64(time.Millisecond)-unixMilli) + " ago"
}

func fmtCount(n *int) string {
	if n == nil {
		return "–"
	}
	return fmt.Sprint(*n)
}

var adminPage = template.Must(template.New("view").Funcs(template.FuncMap{
	"dur":   fmtDuration,
	"ago":   fmtAgo,
	"count": fmtCount,
}).Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="10">
<title>unbrewed-sandbox · rooms</title>
<style>
  :root { color-scheme: dark; }
  body { background:#101014; color:#d6d6dd; font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; margin:2rem; }
  h1 { font-size:1rem; letter-spacing:.08em; text-transform:uppercase; color:#8a8a96; }
  h2 { font-size:.9rem; margin:2rem 0 .4rem; color:#fff; font-weight:normal; }
  .stats { display:flex; gap:2rem; margin:1rem 0 1.5rem; flex-wrap:wrap; }
  .stat b { display:block; font-size:1.4rem; color:#fff; }
  .stat span { color:#8a8a96; font-size:.8rem; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:.4rem .8rem; border-bottom:1px solid #24242c; vertical-align:top; }
  th { color:#8a8a96; font-weight:normal; font-size:.8rem; text-transform:uppercase; letter-spacing:.06em; }
  td.num, th.num { text-align:right; }
  code { color:#9ecbff; }
  .dim { color:#6a6a74; }
  .off { color:#e0a35c; }
  .on { color:#7fd18b; }
  .empty { color:#6a6a74; padding:2rem 0; }
</style>
</head>
<body>
<h1>unbrewed-sandbox rooms <span class="dim">· auto-refresh 10s</span></h1>
<div class="stats">
  <div class="stat"><b>{{.RoomCount}}</b><span>rooms now</span></div>
  <div class="stat"><b>{{.WSClients}}</b><span>ws clients</span></div>
  <div class="stat"><b>{{.RoomsCreated}}</b><span>rooms since boot</span></div>
  <div class="stat"><b>{{.Joins}}</b><span>joins since boot</span></div>
  <div class="stat"><b>{{dur .UptimeMs}}</b><span>uptime</span></div>
  <div class="stat"><b>{{if .Telemetry}}on{{else}}off{{end}}</b><span>telemetry</span></div>
</div>
{{range .Rooms}}
<h2><code>{{.ID}}</code> <span class="dim">· roomId <code>{{.RoomID}}</code> · age {{dur .AgeMs}} · idle {{dur .IdleMs}}{{if .MapURL}} · map {{.MapURL}}{{end}}</span></h2>
<p class="dim">peak {{.PeakConnections}} connections · {{.StateUpdates}} state updates · {{count .DistinctPlayers}} distinct players{{if .HeroesSeen}} · heroes seen: {{range $i, $h := .HeroesSeen}}{{if $i}}, {{end}}{{$h}}{{end}}{{end}}</p>
<table>
<thead><tr><th>player</th><th>discord</th><th>account</th><th>status</th><th>deck</th><th>hero</th><th>author</th><th class="num">deck</th><th class="num">hand</th><th class="num">discard</th><th class="num">joined</th><th class="num">last seen</th></tr></thead>
<tbody>
{{range .Players}}<tr>
<td>{{.Name}}</td>
<td>{{.Discord}}</td>
<td>{{if .Account}}<code>{{.Account}}</code>{{end}}</td>
<td>{{if eq .Status "connected"}}<span class="on">connected</span>{{if gt .Connections 1}} <span class="dim">×{{.Connections}}</span>{{end}}{{else}}<span class="off">left</span>{{end}}</td>
<td>{{.DeckName}}{{if .DeckID}} <span class="dim">{{.DeckID}}</span>{{end}}</td>
<td>{{.HeroName}}</td>
<td>{{.Author}}</td>
<td class="num">{{count .DeckCount}}</td>
<td class="num">{{count .HandCount}}</td>
<td class="num">{{count .DiscardCount}}</td>
<td class="num">{{ago .JoinedAt}}</td>
<td class="num">{{ago .LastSeenAt}}</td>
</tr>
{{end}}</tbody>
</table>
{{else}}
<p class="empty">No active rooms.</p>
{{end}}
</body>
</html>
`))
