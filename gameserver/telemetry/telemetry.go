// Package telemetry emits sandbox room/player lifecycle events to
// unbrewed-telemetry (POST /v1/sandbox-events). The contract lives there;
// testdata/sandbox-events.v1.schema.json is a copy of it.
//
// Emitting is fire-and-forget: Emit only enqueues, so it is safe to call
// while holding a room lock, and a slow or dead sink can never stall play.
package telemetry

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync/atomic"
	"time"

	log "github.com/sirupsen/logrus"
)

const (
	TypeRoomOpened   = "room_opened"
	TypePlayerJoined = "player_joined"
	TypePlayerLeft   = "player_left"
	TypeHeroSeen     = "hero_seen"
	TypeRoomClosed   = "room_closed"

	ReasonInactive = "inactive"
	ReasonShutdown = "shutdown"

	// heroName is capped at 128 code points by the schema.
	maxHeroName = 128
	// MaxHeroesPerPlayer caps hero_seen per player per room, so a buggy or
	// hostile client cannot flood the buffer and push out real events.
	MaxHeroesPerPlayer = 8
)

// Event is one wire event. Fields a type does not carry stay nil/empty and
// are omitted; the schema rejects nulls and unknown fields.
type Event struct {
	EventID         string `json:"eventId"`
	Type            string `json:"type"`
	RoomID          string `json:"roomId"`
	LobbyHash       string `json:"lobbyHash,omitempty"`
	PlayerHash      string `json:"playerHash,omitempty"`
	Connections     *int   `json:"connections,omitempty"`
	HeroName        string `json:"heroName,omitempty"`
	DeckSource      string `json:"deckSource,omitempty"`
	DeckURL         string `json:"deckUrl,omitempty"`
	Reason          string `json:"reason,omitempty"`
	LifetimeMs      *int64 `json:"lifetimeMs,omitempty"`
	DistinctPlayers *int   `json:"distinctPlayers,omitempty"`
	PeakConnections *int   `json:"peakConnections,omitempty"`
	StateUpdates    *int64 `json:"stateUpdates,omitempty"`
	TS              string `json:"ts"`
}

type batch struct {
	SchemaVersion int     `json:"schemaVersion"`
	Events        []Event `json:"events"`
}

func newEvent(typ, roomID string) Event {
	return Event{
		EventID: uuidV4(),
		Type:    typ,
		RoomID:  roomID,
		TS:      time.Now().UTC().Format(time.RFC3339),
	}
}

// RoomOpened carries the hashed lobby gid; the raw gid never leaves the relay.
func RoomOpened(roomID, lobbyHash string) Event {
	e := newEvent(TypeRoomOpened, roomID)
	e.LobbyHash = lobbyHash
	return e
}

func PlayerJoined(roomID, playerHash string, connections int) Event {
	e := newEvent(TypePlayerJoined, roomID)
	e.PlayerHash, e.Connections = playerHash, &connections
	return e
}

func PlayerLeft(roomID, playerHash string, connections int) Event {
	e := newEvent(TypePlayerLeft, roomID)
	e.PlayerHash, e.Connections = playerHash, &connections
	return e
}

// HeroSeen carries the hero's deck source and page when known. The pair is
// re-checked here, so a bad one is dropped (hero_seen still goes out) instead
// of getting the whole batch rejected by the schema.
func HeroSeen(roomID, playerHash, heroName, deckSource, deckURL string) Event {
	e := newEvent(TypeHeroSeen, roomID)
	e.PlayerHash, e.HeroName = playerHash, TruncateHeroName(heroName)
	e.DeckSource, e.DeckURL = CleanDeck(deckSource, deckURL)
	return e
}

// maxDeckURL is the schema's maxLength for deckUrl.
const maxDeckURL = 512

// deckHosts lists the hosts a deckUrl may live on, per deckSource. The
// telemetry validator holds the same table and rejects a mismatch.
var deckHosts = map[string][]string{
	"unmatched-club":  {"the-unmatched.club", "www.the-unmatched.club"},
	"unmatched-cards": {"unmatched.cards", "www.unmatched.cards"},
	"labs":            {"unmatchedlabs.com", "www.unmatchedlabs.com"},
}

// CleanDeck returns the (source, url) pair when it satisfies the telemetry
// contract — a known source, an https url of at most 512 bytes on that
// source's site — and ("", "") otherwise. Both or neither, never one.
func CleanDeck(source, rawURL string) (string, string) {
	hosts, ok := deckHosts[source]
	if !ok || rawURL == "" || len(rawURL) > maxDeckURL {
		return "", ""
	}
	// The schema's "uri" format is RFC 3986: printable ASCII, no spaces and
	// none of < > " \ ^ ` { | }.
	for i := 0; i < len(rawURL); i++ {
		if c := rawURL[i]; c <= 0x20 || c >= 0x7f || strings.IndexByte("<>\"\\^`{|}", c) >= 0 {
			return "", ""
		}
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.User != nil {
		return "", ""
	}
	for _, h := range hosts {
		if u.Hostname() == h {
			return source, rawURL
		}
	}
	return "", ""
}

func RoomClosed(roomID, reason string, lifetime time.Duration, distinctPlayers, peakConnections int, stateUpdates int64) Event {
	e := newEvent(TypeRoomClosed, roomID)
	ms := lifetime.Milliseconds()
	if ms < 0 {
		ms = 0
	}
	e.Reason, e.LifetimeMs = reason, &ms
	e.DistinctPlayers, e.PeakConnections, e.StateUpdates = &distinctPlayers, &peakConnections, &stateUpdates
	return e
}

// TruncateHeroName trims a hero name and clamps it to 128 runes (the
// schema's maxLength counts code points). Empty means: do not send.
func TruncateHeroName(name string) string {
	name = strings.TrimSpace(name)
	if r := []rune(name); len(r) > maxHeroName {
		name = string(r[:maxHeroName])
	}
	return name
}

// NewRoomID mints a room's telemetry id. Lobby gids come from a small name
// pool and get reused, so they cannot identify one sitting.
func NewRoomID() string {
	return uuidV4()
}

func uuidV4() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// Emitter receives relay events. Implementations must never block.
type Emitter interface {
	// Enabled reports whether events go anywhere; callers skip work that
	// only feeds telemetry when it is false.
	Enabled() bool
	// Hash is the only form a player name or lobby gid may leave the relay in.
	Hash(s string) string
	// Emit enqueues an event. Safe to call while holding any lock.
	Emit(Event)
	// Close flushes what is queued, giving up when ctx is done.
	Close(ctx context.Context) error
}

// Noop is used when telemetry is not configured: local dev and tests.
type Noop struct{}

func (Noop) Enabled() bool               { return false }
func (Noop) Hash(string) string          { return "" }
func (Noop) Emit(Event)                  {}
func (Noop) Close(context.Context) error { return nil }

// FromEnv builds the emitter from SANDBOX_TELEMETRY_URL, SANDBOX_TELEMETRY_KEY
// and SANDBOX_NAME_SALT. With URL or key unset it returns Noop. With both set
// but no salt it also returns Noop, plus an error: names must never be hashed
// with an empty salt, and a telemetry misconfig must not take the relay down.
func FromEnv() (Emitter, error) {
	url, key := os.Getenv("SANDBOX_TELEMETRY_URL"), os.Getenv("SANDBOX_TELEMETRY_KEY")
	if url == "" || key == "" {
		return Noop{}, nil
	}
	salt := os.Getenv("SANDBOX_NAME_SALT")
	if salt == "" {
		return Noop{}, fmt.Errorf("SANDBOX_NAME_SALT is required when SANDBOX_TELEMETRY_URL and SANDBOX_TELEMETRY_KEY are set; sandbox telemetry disabled")
	}
	return NewHTTP(Config{URL: url, Key: key, Salt: salt}), nil
}

type Config struct {
	URL  string // base URL; events go to {URL}/v1/sandbox-events
	Key  string // bearer credential with sandbox:submit
	Salt string // HMAC key for player names

	// Zero values take the defaults below.
	BufferSize    int           // default 1000
	BatchSize     int           // default 200
	FlushInterval time.Duration // default 30s
	Timeout       time.Duration // per request, default 5s
}

// HTTP batches events and posts them from a single goroutine.
type HTTP struct {
	dropped  int64 // first: 64-bit atomics need alignment on 32-bit
	cfg      Config
	endpoint string
	client   *http.Client
	events   chan Event
	stop     chan context.Context
	done     chan struct{}
}

func NewHTTP(cfg Config) *HTTP {
	if cfg.BufferSize <= 0 {
		cfg.BufferSize = 1000
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 200
	}
	if cfg.FlushInterval <= 0 {
		cfg.FlushInterval = 30 * time.Second
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 5 * time.Second
	}
	h := &HTTP{
		cfg:      cfg,
		endpoint: strings.TrimRight(cfg.URL, "/") + "/v1/sandbox-events",
		client:   &http.Client{Timeout: cfg.Timeout},
		events:   make(chan Event, cfg.BufferSize),
		stop:     make(chan context.Context),
		done:     make(chan struct{}),
	}
	go h.run()
	return h
}

func (h *HTTP) Enabled() bool { return true }

// Hash is the first 16 hex chars of HMAC-SHA256(salt, lower(trim(s))).
func (h *HTTP) Hash(s string) string {
	m := hmac.New(sha256.New, []byte(h.cfg.Salt))
	_, _ = m.Write([]byte(strings.ToLower(strings.TrimSpace(s))))
	return hex.EncodeToString(m.Sum(nil))[:16]
}

// Emit drops the event when the buffer is full rather than wait.
func (h *HTTP) Emit(e Event) {
	select {
	case h.events <- e:
	default:
		atomic.AddInt64(&h.dropped, 1)
	}
}

// Close drains the buffer and posts it, bounded by ctx. Events emitted after
// Close are dropped.
func (h *HTTP) Close(ctx context.Context) error {
	select {
	case h.stop <- ctx:
	case <-h.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
	select {
	case <-h.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (h *HTTP) run() {
	defer close(h.done)
	ticker := time.NewTicker(h.cfg.FlushInterval)
	defer ticker.Stop()
	var pending []Event
	for {
		select {
		case e := <-h.events:
			pending = append(pending, e)
			if len(pending) >= h.cfg.BatchSize {
				h.post(context.Background(), pending)
				pending = nil
			}
		case <-ticker.C:
			h.post(context.Background(), pending)
			pending = nil
		case ctx := <-h.stop:
			for drained := false; !drained; {
				select {
				case e := <-h.events:
					pending = append(pending, e)
				default:
					drained = true
				}
			}
			for len(pending) > 0 && ctx.Err() == nil {
				n := len(pending)
				if n > h.cfg.BatchSize {
					n = h.cfg.BatchSize
				}
				h.post(ctx, pending[:n])
				pending = pending[n:]
			}
			return
		}
	}
}

// post sends one batch, retrying once on a network error or 5xx (safe: the
// sink dedupes on eventId), then drops it.
func (h *HTTP) post(ctx context.Context, events []Event) {
	if dropped := atomic.SwapInt64(&h.dropped, 0); dropped > 0 {
		log.WithField("dropped", dropped).Warn("sandbox telemetry buffer full: events dropped")
	}
	if len(events) == 0 {
		return
	}
	body, err := json.Marshal(batch{SchemaVersion: 1, Events: events})
	if err != nil {
		log.WithError(err).Error("sandbox telemetry: marshal batch")
		return
	}
	for attempt := 1; ; attempt++ {
		retry, err := h.send(ctx, body)
		if err == nil {
			return
		}
		if !retry || attempt >= 2 || ctx.Err() != nil {
			log.WithError(err).WithField("events", len(events)).Error("sandbox telemetry: batch dropped")
			return
		}
	}
}

func (h *HTTP) send(ctx context.Context, body []byte) (retry bool, err error) {
	req, err := http.NewRequest(http.MethodPost, h.endpoint, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req = req.WithContext(ctx)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+h.cfg.Key)
	resp, err := h.client.Do(req)
	if err != nil {
		return true, err
	}
	defer resp.Body.Close()
	msg, _ := ioutil.ReadAll(io.LimitReader(resp.Body, 512))
	if resp.StatusCode >= 500 {
		return true, fmt.Errorf("status %d: %s", resp.StatusCode, msg)
	}
	if resp.StatusCode >= 300 {
		return false, fmt.Errorf("status %d: %s", resp.StatusCode, msg)
	}
	return false, nil
}
