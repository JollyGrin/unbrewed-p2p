# Game replay — investigation & spec

_Researched 2026-07-03. Question: how do we let players watch back a finished
game — scrubbing through board moves, card plays, and HP swings — given that
game communication is a bare websocket, there are no accounts, and the only
persistence is the browser?_

## TL;DR recommendation

**The game already broadcasts full state snapshots on every action, so we do
not need a sophisticated logger or a simulator.** Every message the client
receives (`gamestate`, `playerposition`) is a complete, self-describing
picture of the table at that moment. A replay is therefore just:

1. **Record:** append every incoming websocket broadcast to IndexedDB
   (via Dexie.js) with a timestamp — one `useEffect` tap inside
   `WebGameProvider`. No outgoing-action instrumentation, no server changes,
   no reconstruction logic.
2. **Play back:** a `/replay` page that mounts the *existing* game components
   (`BoardCanvas`, `PlayerBox`, `HandFan`, card modals) under a
   `ReplayGameProvider` that impersonates `useWebGame()` — feeding it the
   i-th recorded snapshot instead of a live socket, with no-op setters.
   Scrubbing = picking a different index. Zero rendering code is duplicated.
3. **Clean the noise:** drag events arrive at pointer-move frequency; a
   compaction pass at game end collapses each drag into start→end keyframes,
   and playback tweens between them (d3 transitions — d3 is already the
   board renderer).
4. **Gate the UX:** recording runs silently all game; the replay entry only
   *appears* once any hero's HP ≤ 0 is observed. (Honesty note: every client
   already receives the opponent's full hand and deck order over the wire,
   so this gate is deterrence, not security — see §7.)

Ship in phases: **P1** recorder + storage, **P2** replay viewer, **P3**
compaction/tweening + event feed, **P4** export/import of replay files,
**P5 (bonus)** video export via canvas + MediaRecorder, with the existing
`marketing/` Remotion project as the high-quality offline render path.

---

## 1. How the game actually works today (findings)

### 1.1 The server is a dumb relay with no history

`gameserver/gameserver/server.go` keeps exactly two maps per room and
overwrites them on every message:

- `FieldState.Players[name] = <raw JSON>` — replaced wholesale on each
  `playerstate` message (`server.go:334-341`)
- `PlayerPositions[name] = <raw JSON>` — replaced wholesale on each
  `playerposition` message (`server.go:326-332`)

After each update it re-marshals the *entire* map and broadcasts it to
every client. Rooms are garbage-collected after 12h idle. There is no event
log, no sequence numbers, no persistence. **Consequence: replays must be
captured and stored client-side; conversely, the server needs zero changes.**

### 1.2 Every message is a full snapshot, not a delta

- `gamestate` content: `{ gid, players: { [name]: { pool: PoolType } }, last_updated }`
  (`lib/gamesocket/message.ts:11-17`)
- `playerposition` content: `Record<name, PositionType>` where each entry is
  the player's hero token with nested `sidekicks[]`
  (`components/Positions/position.type.ts`)

`PoolType` (`components/DeckPool/PoolFns.ts:3-19`) contains the complete
deck state: `cards` (the full card definitions with all text/image URLs),
`deck` (draw pile, **in order**), `hand`, `discard`, `commit` (main/boost/
reveal), plus hero and sidekick stats including `hp`. So any single
`gamestate` message is enough to render the whole table — decks, hands,
HP, commits — with the components we already have. **This is the load-bearing
fact of the whole design: scrubbing to event *i* requires no replaying of
actions, just rendering snapshot *i*.**

### 1.3 There are exactly two choke points, both client-side

All incoming data funnels through the two callbacks in `WebGameProvider`
(`lib/contexts/WebGameProvider.tsx:70-75`): `onGameState` and
`onGamePositions`, which receive the raw JSON string. All consuming
components read via `useWebGame()`. This gives us:

- **Recording:** tap the two callbacks (or the two `useState` values) — done.
- **Playback:** provide the same context shape (`WebGameProviderValue`) from
  recorded data and every game component works unmodified.

### 1.4 Position messages are extremely noisy

d3's `dragged` handler (`components/BoardCanvas/useCanvas.tsx:119-131`)
calls `move()` on **every pointer-move event**, and `game.tsx`'s `move`
sends a websocket message each time. A single token drag produces dozens to
hundreds of `playerposition` broadcasts (~200–500 bytes each). This is the
"noise" to wipe: raw recording is fine (cheap appends), but compaction +
tweening is what makes playback watchable and storage small (§4).

### 1.5 There is no game-over concept anywhere

HP is just a number on the pool, adjusted by ±1 clicks in the header
(`header.components.tsx:50-55` → `adjustHp`). Nothing observes it. The
replay unlock therefore needs its own latch: *first time any observed
`gamestate` has a player with `pool.hero.hp <= 0`, mark the recording
unlocked*. HP can be corrected upward afterwards (misclicks happen — the
latch should stay set only if it wasn't immediately corrected; see §5.3).

### 1.6 Persistence constraints

Everything persistent lives in `localStorage` (`lib/hooks/useLocalStorage.ts`):
decks (`DECKS`), maps (`MAP_LIST`), servers. localStorage caps at ~5MB and
the deck bag already budgets against it (the existing image-deck doc's
"URLs only, never base64" rule exists for this reason). A raw replay is
**10–30MB per game** (see estimate in §3.3) — localStorage is not an option.
**IndexedDB is:** quotas are effectively hundreds of MB+ on all modern
browsers, and it's the standard home for this kind of blob. The user
suggestion "dixxie" = **Dexie.js**, the de-facto IndexedDB wrapper (~25KB,
zero deps) — recommended; the raw IndexedDB API is miserable to use
directly. Note IndexedDB is per-origin *and* survives refreshes, which also
fixes the "refresh mid-game wipes the recording" worry: the recorder just
keeps appending to the same recording when the player rejoins the same `gid`.

### 1.7 What identifies a game

Nothing durable: `gid` is a free-text lobby name typed by players and reused
across games; `name` is a free-text player name; the map arrives only as a
`mapUrl` query param on `/game` (defaulting to `basraport.webp`). A
recording must therefore capture its own metadata (map URL, player names,
deck names, start time) and detect *game boundaries* itself (§5.2), because
"same lobby name, next evening" is a different game.

### 1.8 Rendering is already replay-friendly

- Decks render through the Card factory which branches per-card between the
  generated SVG template and whole-card images (`cardImage`), and all art is
  **URLs embedded in the pool snapshot** — so a replay renders correctly
  even if the deck was later deleted from the bag. (URL rot is accepted,
  same as live play.)
- `BoardCanvas` takes `data: PositionType[]` + `self` as props. Passing a
  `self` that matches no token id makes every token non-draggable (the drag
  `filter` at `useCanvas.tsx:59-63` matches nothing) — read-only board for
  free. Token images/colors are inside the recorded positions.
- `PlayerBox` hides the HP +/- buttons when `isLocal` is false — pass
  `isLocal={false}` for all players and the header is read-only.
- The one component needing care is `HandContainer`
  (`hand.container.tsx:53-60`): it auto-initializes a pool when none exists.
  The replay page must not mount that effect — see §5.1.

---

## 2. Architecture overview

```
 LIVE GAME                                REPLAY
┌────────────────────────┐            ┌─────────────────────────────┐
│ WebGameProvider        │            │ /replays  (list, gated)     │
│  onGameState ──┐       │            │ /replay?id=…                │
│  onGamePos ────┤       │            │                             │
│                ▼       │            │ ReplayGameProvider          │
│  useReplayRecorder     │            │   snapshot(i) ──► same      │
│   • append event ──────┼──► Dexie   │   no-op setters   context   │
│   • hp≤0 latch         │   (IndexedDB)   ▲               shape    │
│   • boundary detect    │        │       │                        │
└────────────────────────┘        │   timeline scrubber,           │
                                  │   play/pause/speed,            │
              game end            │   event feed                   │
              compaction ─────────┘   (reuses BoardCanvas,         │
              (drag coalescing,        PlayerBox, HandFan,         │
               dedupe, gzip)           card modals)                │
└──────────────────────────────────────────────────────────────────┘
```

New code lives in:

| Path | Contents |
|---|---|
| `lib/replay/db.ts` | Dexie schema + open/migrate |
| `lib/replay/useReplayRecorder.ts` | recording hook mounted in `WebGameProvider` |
| `lib/replay/compact.ts` | drag coalescing, dedupe, keyframes, gzip |
| `lib/replay/semantics.ts` | snapshot diff → human-readable event feed |
| `lib/contexts/ReplayGameProvider.tsx` | context impersonator + timeline state |
| `pages/replays.tsx` | replay library (gated list) |
| `pages/replay.tsx` | the viewer |
| `components/Replay/*` | timeline bar, controls, event feed panel |

Touched existing files: `WebGameProvider.tsx` (mount recorder, ~10 lines),
`useCanvas.tsx` (optional `animate` prop for tweened transforms, ~5 lines),
`header.container.tsx` or game layout (quiet "Watch replay" button when
unlocked). **`gameserver/` untouched.**

## 3. Recording (Phase 1)

### 3.1 Record the *incoming* stream, not outgoing actions

Record broadcasts, not local actions, because:

- Broadcasts include **both** players' changes — each player's local
  recording is complete on its own (the opponent doesn't need to cooperate,
  export, or merge anything).
- Both clients receive byte-identical streams, so both players end up with
  equivalent replays.
- It's one tap point instead of instrumenting every PoolFns call site.

In `WebGameProvider`, alongside the existing `setGameState(state)` /
`setGamePositions(state)` calls, hand the raw string to the recorder:

```ts
onGameState: (state) => { setGameState(state); recorder.push("gamestate", state); },
onGamePositions: (state) => { setGamePositions(state); recorder.push("playerposition", state); },
```

`recorder.push` stamps `Date.now()` and a monotonic `seq`, and appends to
Dexie in the background (buffered, `bulkAdd` every ~250ms so drag storms
don't cause an IndexedDB write per pointer-move).

### 3.2 Dexie schema

```ts
// lib/replay/db.ts
class ReplayDB extends Dexie {
  recordings!: Table<RecordingMeta, string>; // key: recordingId
  events!: Table<ReplayEvent, number>;       // auto-increment
  constructor() {
    super("unbrewed-replays");
    this.version(1).stores({
      recordings: "id, gid, startedAt, unlockedAt",
      events: "++id, recordingId, seq, t",
    });
  }
}

type RecordingMeta = {
  id: string;              // `${gid}:${startedAt}`
  gid: string;
  startedAt: number;
  endedAt?: number;
  unlockedAt?: number;     // set by the hp≤0 latch — gates UI visibility
  mapUrl: string;          // captured from the /game query param
  localPlayer: string;     // who recorded it
  players: { name: string; deckName: string; heroName: string }[];
  finalHp?: Record<string, number>;
  compacted: boolean;      // raw events replaced by compacted blob
  blob?: Blob;             // gzip(JSON) after compaction (CompressionStream)
  schemaVersion: 1;
};

type ReplayEvent = {
  recordingId: string;
  seq: number;
  t: number;               // Date.now() at receipt
  msgtype: "gamestate" | "playerposition";
  content: string;         // the raw websocket JSON, unparsed (cheap append)
};
```

### 3.3 Storage estimate (why raw-append is fine, and why compaction matters)

A pool with ~30 cards of rules text is ~30–60KB of JSON; a `gamestate`
broadcast carries every player's pool, so ~60–120KB × roughly 100–300 card/HP
actions per game ≈ **10–30MB raw**. Position events are small (~0.5KB) but
number in the thousands. IndexedDB absorbs this comfortably during play;
compaction at game end (§4) shrinks it ~50–100× (snapshots are massively
self-similar — JSON-patch deltas + gzip via the native `CompressionStream`
API). Retention policy: keep the newest N compacted replays (default 20)
plus anything the user has pinned/exported; prune raw un-compacted
recordings older than 48h (abandoned games).

### 3.4 Refresh / reconnect / boundary behavior

- On mount, the recorder looks for an existing recording with the same `gid`
  whose last event is **< 30 minutes old** and which doesn't look like a
  finished game → resume appending to it (mid-game refresh heals invisibly).
- Otherwise it starts a new recording.
- Additional boundary signal: a player's pool transitioning to a
  freshly-initialized shape (full deck, hand of 1, empty discard — the
  `flow(newPool, makeDeck, shuffleDeck, draw)` signature in
  `hand.container.tsx:56`) after having been mid-game marks a **new game in
  the same room**; close the old recording and open a new one.
- `endedAt` is stamped when the provider unmounts or on the boundary above;
  compaction runs lazily the next time the replay library is opened (not
  during the game — don't compete with live play for main-thread time).

## 4. Compaction & motion cleanup (Phase 3, but designed now)

Input: the raw event list. Output: a single compressed blob on
`RecordingMeta` (raw events deleted).

1. **Dedupe** identical consecutive contents (reconnect echoes, no-op
   rebroadcasts triggered by the other player's join).
2. **Coalesce drags:** group consecutive `playerposition` events where the
   same token id changes, ending a group when that token is quiet for
   > 400ms (there is no drag-end marker on the wire — the time-gap heuristic
   stands in for one). Keep only the group's first and last snapshot; store
   the intermediate points as an optional low-rate `path` sample (every
   ~120ms) for path-drawing later. One drag: hundreds of events → 1 event.
3. **Timeline compression:** replay time ≠ wall time. Record each kept
   event's wall `t`, but the player maps them onto a playback clock where
   idle gaps are capped (default: any gap > 2.5s plays as 2.5s; scrubber
   shows event density, not wall minutes). Thinking pauses vanish; the
   rhythm of play survives.
4. **Delta-encode gamestates:** keep a full snapshot every 25 gamestate
   events (keyframe), store the rest as RFC-6902 JSON patches
   (`fast-json-patch`, ~10KB dep) against the previous state. Scrub cost:
   apply ≤ 24 patches from the nearest keyframe — microseconds.
5. **Gzip** the whole event array with `CompressionStream("gzip")` → `Blob`.

Playback tweening: the viewer feeds `BoardCanvas` interpolated positions.
Smallest-change approach: an `animate?: boolean` prop on
`useCanvas`/`BoardCanvas` that swaps the hard `.attr("transform", …)` for
`.transition().duration(350).ease(d3.easeCubicOut).attr("transform", …)` —
d3 tweens each token to its next keyframe. (Framer-motion is also available,
but the tokens live inside d3-managed SVG; staying in d3 is less plumbing.)

## 5. The replay viewer (Phase 2)

### 5.1 `ReplayGameProvider`

Provides the exact `WebGameProviderValue` shape from recorded data:

```tsx
const value: WebGameProviderValue = {
  gameState: snapshots.gamestate[cursor.stateIndex],      // parsed WebsocketMessage
  gamePositions: snapshots.positions[cursor.posIndex],
  setPlayerState: () => () => {},                          // no-ops
  setPlayerPosition: { current: () => {} },
  connectionStatus: "open",
};
```

The viewer page composes existing pieces directly rather than reusing
`pages/game.tsx` wholesale, because the game page couples in live-only
behavior (`HandContainer`'s pool auto-init effect, the default-token-spawn
effect at `game.tsx:116-127`). Concretely, `/replay` renders:

- `HeaderContainer`-style player boxes: `PlayerBox` per player with
  `isLocal={false}` (hides HP buttons) and a no-op `setGameState`.
- `BoardCanvas` with `data` from the current position snapshot,
  `self={""}` *(matches no token → nothing draggable; note
  `id.includes("")` is `true`, so all tokens render at full opacity — a
  happy accident that reads correctly for a neutral observer)*, and
  `animate` on.
- Hands: `HandFan` per player fed `pool.hand`, with the action callbacks
  stubbed out (or a read-only variant of the card fan — the fan itself is
  presentation; only its `functions` prop mutates).
- Discard/deck/commit modals reuse the existing modal bodies read-only.
- **Commit reveal fidelity:** render `commit.main`/`commit.boost` face-down
  while `commit.reveal` is false — the replay recreates the reveal moment
  the way the table saw it. A "peek" toggle flips everything face-up
  (pointless to hide — the data is local — but the default preserves drama).

### 5.2 Timeline model

The compacted event list is merged (gamestate + position events interleaved
by `seq`) into one timeline. The cursor is an event index; the derived
`stateIndex`/`posIndex` are "latest of each type at or before the cursor".
Controls: play/pause, speed (1×/2×/4×), step ± one event, click-to-scrub,
and jump-to markers from the event feed. Because every point is a snapshot
(or keyframe+patches), seeking is random-access — no replay-from-start.

### 5.3 Deriving the human-readable event feed

Diffing consecutive gamestate snapshots classifies almost every PoolFns
action without ever logging actions explicitly:

| Observed diff (per player) | Feed entry |
|---|---|
| `hand +1`, `deck −1` | "drew a card" |
| `hand −1`, `discard +1` | "discarded *{title}*" |
| `hand −1`, `commit.main` set | "committed a card" |
| `hand −1` or `deck −1`, `commit.boost` set | "boosted (+{boost} from deck/hand)" |
| `commit.reveal` false→true | "revealed *{title}*{ + boost}" |
| `commit.*` → discard | "resolved combat" |
| `commit.*` → hand | "took the committed card back" |
| `hero.hp` Δ | "hero {±n} HP ({old}→{new})" |
| `sidekick.hp` / `quantity` Δ | "sidekick {±n}" |
| deck same length, different order | "shuffled" |
| pool appears/reset | "joined with *{deckName}*" |
| coalesced position group | "moved {hero/sidekick}" (with tween) |

Unrecognized diffs fall back to "updated their board" — the feed degrades
gracefully as PoolFns grows. HP entries render as markers on the scrubber;
the hp≤0 latch (§1.5) also lives here: **unlock when a hero-HP entry lands
at ≤ 0 and is not corrected back above 0 within the next 3 gamestate
events** (misclick tolerance).

### 5.4 Entry points & gating

- **`/replays` library page** (linked from the Bag or navbar): lists only
  recordings with `unlockedAt` set. Card per game: map thumbnail, matchup
  ("Medusa vs Bigfoot"), date, duration, final HP.
- **Post-game quiet reveal:** on the game page, when the local recorder's
  latch fires, a small unobtrusive "Watch replay" chip appears near the
  connection chip after a short delay. No fanfare mid-game; nothing renders
  before the latch.
- Locked recordings are invisible in UI but present in IndexedDB (see §7).

## 6. Export / import (Phase 4)

A compacted replay serializes to a single `.unbrewed-replay.json.gz` file
(the blob, plus meta header). Export = download; import = file-picker on
`/replays` (validated by `schemaVersion`). This gives shareability with zero
backend, mirrors the existing deck-share-by-URL culture, and doubles as the
input format for the video path below. Replays are fully self-contained
(card art and token art are URLs inside the snapshots).

## 7. Honest threat model for the "hidden until HP 0" gate

Every client receives the opponent's **entire pool on every action — hand
contents and the exact draw-pile order included** (§1.2). Anyone with
devtools open can read it live today, replay feature or not. Therefore:

- The gate is **courtesy/deterrence UX, not security**: it keeps honest
  players honest and keeps the replay button from tempting anyone mid-game.
- Don't spend effort on client-side encryption-at-rest; the data and the key
  would sit in the same origin. State this plainly in the UI copy ("replays
  unlock when a hero falls").
- The only real fix is server-side hidden information (the relay would have
  to own shuffling and hand privacy) — a full architecture change, out of
  scope, and arguably against the sandbox spirit of the sim.

## 8. Bonus: rendering a video

Three tiers, in increasing quality and effort:

### 8.1 MVP: canvas + `MediaRecorder` (in-browser, zero deps)

The board is d3-managed SVG, which `MediaRecorder` can't capture directly.
Two workable captures:

- **Purpose-built canvas painter (recommended):** a replay-to-canvas
  renderer is genuinely small — draw the map bitmap, then per token either
  a colored circle or its image, plus an HP/name strip and (optionally) the
  committed card images. Drive it from the same timeline cursor at a fixed
  step, `canvas.captureStream(30)` → `MediaRecorder` → WebM download
  (MP4 natively on Safari). Runs at real playback speed.
- **SVG rasterization per frame** (serialize SVG → `Image` → `drawImage`)
  captures the exact board look but is slower and fights image CORS taint;
  only worth it if the hand/header chrome must appear in the video.

### 8.2 Better: WebCodecs + a muxer (`mediabunny`)

Faster-than-realtime, frame-accurate MP4 (H.264) in the browser: render each
timeline frame to canvas, encode with `VideoEncoder`, mux with `mediabunny`
(already appears in `marketing/node_modules` as part of the Remotion
toolchain — it's an actively maintained standalone lib). This is the upgrade
path if 8.1's realtime capture feels clunky; same canvas painter, different
sink.

### 8.3 Remotion — for us, not (yet) for end users

Remotion **playback** in the browser is `@remotion/player` (no file export);
**rendering to a file** runs in Node/headless Chrome (`npx remotion render`
or Lambda) — so it is not a client-side export button for players without
shipping a backend. But the repo already has a Remotion 4 project in
`marketing/`, which makes a great **first-party highlight pipeline**:

- A `<GameReplay>` composition that takes an exported replay file (§6) as
  props, uses `calculateMetadata` to set `durationInFrames` from the
  compacted timeline, and animates tokens with `interpolate()` between
  position keyframes (per Remotion rules: frame-driven animation only, no
  CSS transitions).
- Reuses the replay's semantic feed for lower-third captions ("Medusa reveals
  *Gaze of Stone* — 6 damage").
- Rendered locally via `remotion studio` / `remotion render` for trailers,
  socials, or a "clip of the week" — exactly what `marketing/` exists for.

Recommendation: ship 8.1 behind an "Export video" button on the replay
viewer; treat 8.3 as a marketing tool fed by the same export format; revisit
8.2 only if users actually export videos often.

## 9. Phased plan

| Phase | Scope | Size | Risk |
|---|---|---|---|
| **P1 Recorder** | Dexie schema, `useReplayRecorder` in `WebGameProvider`, boundary/resume logic, hp≤0 latch, retention pruning | S–M | Low — additive, invisible |
| **P2 Viewer** | `ReplayGameProvider`, `/replays` + `/replay` pages, timeline scrub over **raw** events (compaction not yet required), read-only reuse of board/header/hand | M | Medium — read-only reuse of live components needs the guards in §5.1 |
| **P3 Polish** | compaction pipeline, drag coalescing + d3 tweening, idle compression, semantic event feed + scrubber markers | M | Low — pure client post-processing |
| **P4 Share** | export/import replay files | S | Low |
| **P5 Video** | canvas painter + MediaRecorder export; `marketing/` `<GameReplay>` composition | M | Low — isolated |

P1 should land first and alone: it starts accumulating replays silently, so
by the time P2 ships, users already have games to watch.

## 10. Open questions

1. **Offline mode** (`/offline`) bypasses the websocket entirely — recording
   it would need a second tap point in its local state handler. Out of scope
   for v1?
2. **Spectators/3+ player rooms:** the data model already handles N players
   (`players` is a map); the viewer layout should not hard-code two.
3. **Retention defaults:** 20 replays ≈ 200–600KB compacted each is trivial;
   is auto-pruning even needed beyond raw-recording cleanup?
4. **Name collisions:** the server comments out its duplicate-name rejection
   (`server.go:283-286`); two "Dean"s share one pool slot live, and the
   replay will faithfully show the same chaos. Not a replay bug, worth
   knowing.
5. Should the scrubber show wall-clock timestamps or only compressed
   playback time? (Proposal: playback time on the bar, wall time in the
   event feed tooltip.)
