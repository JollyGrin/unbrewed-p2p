/**
 * Pro protocol v1 — SOURCE OF TRUTH.
 *
 * The ONLY coupling between the public client (unbrewed-p2p) and this private
 * server. The client contains ZERO rules logic: it renders `view`, offers
 * `legalActions` as UI affordances, answers `prompt`s, and sends actions.
 * Everything here is plain JSON-serializable data.
 *
 * ## Sync procedure (docs/pro/tasks/T-015 in the public repo)
 * Any change here bumps PROTOCOL_VERSION. Copy this file VERBATIM to
 * `unbrewed-p2p/lib/pro/protocol.ts` and note the sync in both commit bodies.
 * This file must compile standalone in both repos: NO imports — the engine
 * shapes it mirrors (Action, PendingPrompt kinds, MapDef) are duplicated here
 * by hand and drift is caught by the type-level tests in
 * `test/protocol.test.ts` (this repo only).
 *
 * ## Reconciliation vs the client DRAFT (v0, 2026-07-04)
 * - Prompt answers are a regular action (`RESPOND_PROMPT`) — the reducer gates
 *   them like any other action. The draft's separate `PROMPT_RESPONSE` client
 *   message is GONE; there is exactly one ACTION path.
 * - `PlayerView` gained `counters` (public per-player counters), `maneuver`
 *   (boost/moved bookkeeping the UI needs during MANEUVER_MOVE), `catalog`
 *   (CardDefId -> printed card metadata so the client can render rule-true
 *   values without correlating against unbrewed-api decks), and a redacted
 *   `prompt` summary for the NON-choosing player (`options: []` = waiting).
 * - No event stream in v1: the client diffs consecutive views (the reveal beat
 *   is `combat.attackerCard` flipping null -> id). Revisit if diffing hurts.
 *
 * ## Reconnect tokens
 * Issued once per seat on CREATE/JOIN. Opaque, stored client-side
 * (sessionStorage), replayed via RECONNECT after a drop; the server re-binds
 * the socket to the seat and re-sends STATE. Tokens do not rotate in v1 and
 * die with the room (in-memory, TTL ~2h after last activity).
 *
 * ## v3 (2026-07-05): bot rooms
 * `CREATE_ROOM` gained optional `bot` — when present the server fills p2 with
 * a scripted AI seat and the game starts immediately (ROOM_CREATED is followed
 * by STATE; there is no JOIN). `bot.heroId` omitted = server picks randomly
 * among supported heroes. The bot plays through the same action pipeline as a
 * human; the client needs NO new message types — the opponent just acts.
 * OPPONENT_STATUS is never sent for a bot seat (it is always "connected").
 *
 * ## v4 (2026-07-05): custom-map playtest
 * `CREATE_ROOM` gained optional `customMap` — a full `ProMapDef` the creator
 * supplies to playtest an unpublished board without shipping it to the server
 * repo. The server validates it (validateMap) and, if clean, uses it for that
 * room only; a bad map answers ERROR{BAD_MAP}. Composes with `bot`.
 *
 * ## v5 (2026-07-05): public lobbies
 * Rooms carry a `public` flag (default false: invite-link rooms stay unlisted).
 * SET_VISIBILITY (from a ws bound to a seat in that room) toggles it and is acked
 * with VISIBILITY. LIST_LOBBIES returns the public, one-seat, game-not-started,
 * recently-active rooms as LobbyListing[] (client polls; no server push — a room
 * drops out the moment its second seat fills or it goes stale). `ageMs` is
 * wait-time since room creation and does NOT reset on a visibility toggle.
 * Composes with `bot` and `customMap` (a bot/custom-map room can still be public).
 *
 * ## v6 (2026-07-05): two-space large fighters
 * `ViewFighter` gained `tailSpace: SpaceId | null` — a LARGE fighter's body
 * occupies TWO adjacent spaces (`space` = head, `tailSpace` = tail); render two
 * linked tokens with a stretch-band between them ("one fighter"). NORMAL
 * fighters always send `null` — the shape is additive and normal fighters are
 * untouched. No new prompt kinds: head/tail placement reuses CHOOSE_SPACE, the
 * tail prompt's options carry `data: { space, head }` so the pending head can
 * be rendered. `MOVE_FIGHTER.path` for a large fighter is the LEADING end's
 * path and may start from either body space; the final pose is
 * (path[n], path[n-1]) — animate each end along the lead/trail paths.
 *
 * ## v7 (2026-07-06): deploy-safe games (SIGTERM warning + resume tokens)
 * Rooms are in-memory, so a Railway redeploy (which SIGTERMs the old instance)
 * would silently kill live games. Three additive messages fix this:
 * - `SERVER_RESTARTING` (server->client): the old instance broadcasts this on
 *   SIGTERM before it closes sockets. The client shows a "server updating" toast
 *   and lets its reconnect/backoff loop take over against the new instance.
 * - `RESUME_TOKEN` (server->client): the server periodically pushes an OPAQUE,
 *   encrypted+authenticated blob per seat (and once more on SIGTERM). It encodes
 *   `{setup, seed, actionLog, dslVersion, stateHash}` — the deterministic-replay
 *   format — so EITHER client can revive the whole room on a fresh instance. The
 *   blob is AES-256-GCM sealed with a server-only key: a client cannot read it,
 *   so replaying it never breaches the redactFor boundary. Client stores it in
 *   localStorage (crash-recovery / "resume tomorrow" fall out for free). When the
 *   key is unset the server NEVER emits a token (fail closed).
 * - `RESUME_ROOM` (client->server): carries a stored blob to a healthy instance.
 *   The server decrypts + verifies it, replays the log, and recreates the room +
 *   both seats with FRESH reconnect tokens, answering `ROOM_JOINED` + `STATE`.
 *   First client to revive wins; a second `RESUME_ROOM` for the same room id just
 *   reconnects to the now-live room. On `dslVersion` mismatch the server still
 *   replays and lets the per-game `stateHash` decide (a semantics change that did
 *   not touch this game's cards still resumes); a genuine divergence answers
 *   ERROR{RESUME_FAILED}.
 */

/**
 * ## v8 (2026-07-06): full-match replay bundles (issue #122)
 * The engine is deterministic (seeded PRNG in GameState, no wall-clock/Math.random),
 * so a whole match is reproducible from `{ config, actionLog }`. Two additions:
 * - `REPLAY_BUNDLE` (server → both seats at GAME_OVER): the unredacted,
 *   self-contained `ReplayBundle` — nothing is secret once the game is over. The
 *   client saves it locally for the /pro/replays scrubber; it is never required to
 *   render a live game.
 * - `ReplayExpansion` / `ReplayError`: the shape returned by the STATELESS HTTP
 *   `POST /replay` endpoint (NOT a ws message). It re-runs a bundle's actionLog
 *   through the authoritative reducer and returns the God-view step sequence
 *   (both hands/decks/discards/tokens at every step) so the browser renders a
 *   full-information replay without shipping the rules engine. The same endpoint
 *   validates imported/shared bundles: an illegal actionLog is rejected by
 *   construction, and a schema/dsl-version mismatch refuses rather than render a
 *   subtly-wrong game.
 *
 * ## v10 (2026-07-08): prompt attribution + player-redacted event stream
 * One release train ships two additive features under a single version (issues
 * #35 and #36):
 *
 * - Prompt attribution (issue #35): `ViewPrompt` gained optional `source` — WHAT
 *   opened the prompt, so the client can label a choice with the card/ability
 *   asking (players were guessing; see unbrewed-p2p#147/#151). Projected in
 *   redactFor from the parked effect run's scope.source: a resolving card's
 *   instance → `{ card }`, a hero ability → `{ hero }`, and system prompts with
 *   no effect run (combat commit, sidekick placement, maneuver, maneuver-boost)
 *   → `null`. Hidden-info guarded: a card instance is named ONLY when its face is
 *   public to BOTH players (a scheme in discard, a revealed combat card); a
 *   still-hidden face sends `null` instead, so `source` never leaks an identity
 *   `redactFor` otherwise strips.
 *
 * - Player-redacted event stream (issue #36): STATE gained an optional
 *   `events: GameEvent[]` — the structured events the engine produced for the
 *   action that triggered THIS broadcast, redacted for the receiving player (own
 *   hidden cards survive; the opponent's are masked to '(hidden)'). Present only
 *   on action-triggered broadcasts; join/reconnect/resume STATE omits it (never
 *   replay old events into a rejoining client's feed). The client appends them to
 *   its activity feed, replacing the snapshot-diffing in
 *   unbrewed-p2p/lib/pro/gameLog.ts; a client that ignores `events` sees a
 *   byte-identical `view`/`legalActions` and behaves exactly as on v9. The
 *   `GameEvent` union below mirrors engine/types.ts (drift caught at compile time
 *   in server/redact.ts). One additive engine event, `EFFECT_FIRED`, was added so
 *   delayed effect damage can be attributed to its source card.
 *
 * ## v11 (2026-07-08): pro undo — request/rewind negotiation (issue #39)
 * A player may undo THEIR OWN last discrete move (single level); on the opponent's
 * consent the server rewinds authoritative state to immediately before that move
 * and rebroadcasts a fresh STATE to both seats. Undo is a META-negotiation — it is
 * NOT an `Action` and is NEVER recorded in the deterministic replay log (the rewind
 * is implemented by truncating `actionLog` + re-running the engine, so a recorded
 * undo would be self-referential). Four additive messages, none of which touch the
 * `ACTION` path:
 * - `UNDO_REQUEST` (client→server): request to undo your own last move. The server
 *   computes the cut index (start of your last discrete move, walking back over your
 *   trailing prompt/combat entries so the rewind lands on a clean boundary, never
 *   mid-prompt) and pushes UNDO_REQUESTED to the opponent. One pending request per
 *   room; a second while one is pending — or a request with nothing to undo — answers
 *   ERROR{UNDO_UNAVAILABLE}.
 * - `UNDO_REQUESTED` (server→opponent): the opponent is ALWAYS prompted, never
 *   blindsided. `requester` names who asked (so the prompt reads "P1 wants to undo…").
 *   `rewindActions` summarizes every action that will be rewound — INCLUDING the
 *   opponent's own moves taken in between (which the rewind also removes, by design)
 *   — so they can consent informedly. A summary is `{ player, action }` (the action
 *   TYPE only — no card ids — so the pre-consent prompt leaks no hidden identities).
 * - `UNDO_RESPONSE {accept}` (client→server): the opponent's answer. accept=true →
 *   the server truncates the log, replays from the seed, and broadcasts the earlier
 *   STATE to both seats (no new "undo result" message — the STATE broadcast is the
 *   result). accept=false → UNDO_REJECTED to the requester, no state change. A bot
 *   opponent cannot consent, so the server auto-accepts on its behalf.
 * - `UNDO_REJECTED` (server→requester): the request was declined, or superseded by a
 *   fresh action / staleness. No state change.
 * Redaction re-derives from the rebuilt state via redactFor, so an undo cannot leak
 * hidden info beyond the accepted rewind; resume tokens auto-track the truncated log
 * (pushed inside broadcastState).
 *
 * `PlayerView.canUndo` (per-viewer, recomputed on every STATE broadcast) tells each
 * client whether that viewer has an eligible last discrete move to undo right now —
 * the frontend gates its Undo button entirely on this flag.
 *
 * ## v12 (2026-07-08): Buster Keaton STUNT event variants
 * The v0.13.0 DSL batch adds three additive GameEvent variants emitted by Buster
 * Keaton primitives: `CARD_PLAYED_FROM_HAND` (nested STUNT play),
 * `CARD_RETURNED_TO_HAND` (combat cleanup returns a revealed combat card), and
 * `CARD_REVEALED` (The Cameraman's random hand reveal). All are public reveal/play
 * moments and are redacted/audited by server/redact.ts.
 *
 * ## v13 (2026-07-09): multiplayer room exposure
 * Wire player ids now use the reserved runtime-player id space (`p1`..`p16`) so
 * STATE, legal actions, events, replay bundles, resume tokens, and room seating
 * can represent 3–4 player formats. `CREATE_ROOM` accepts `formatId` (default
 * `duel`); rooms fill seats in runtime order and start once the selected format's
 * player count is reached. PlayerView keeps the duel `self`/`opponent` aliases
 * for compatibility and adds `players[]`, the multiplayer-safe per-seat view.
 *
 * ## v14 (2026-07-10): host-filled easy bot slots
 * `CREATE_ROOM.botSeats[]` lets the host mark non-host runtime seats as easy AI
 * occupants in any supported format. Human joins still fill the next open runtime
 * slot; planned bot slots materialize automatically once earlier human slots are
 * filled.
 *
 * ## Additive change (2026-07-12, no version bump): live room status + presence
 * (unbrewed-engine #121, client sibling p2p #222). Three ADDITIVE changes — no
 * PROTOCOL_VERSION bump; a client that ignores the new fields behaves exactly as
 * on v14 (duel is untouched):
 *
 * - `ROOM_STATUS` (server → every seated player): the live waiting-room channel.
 *   Carries `{ roomId, formatId, requiredPlayers, seats: RoomStatusSeat[] }` — public
 *   pre-game info (hero picks are public), so the host's waiting panel can render
 *   the true fill count AND which heroes have joined as seats arrive. Broadcast on
 *   join, on pre-game seat release (the count can go DOWN — a ghost seat freed
 *   after a 60s grace), and on waiting-room reconnect/disconnect. The existing
 *   `seats: PlayerId[]` on ROOM_CREATED/ROOM_JOINED is untouched for compatibility;
 *   ROOM_STATUS is the live channel.
 *
 * - `OPPONENT_STATUS.player` (additive): WHICH seat this presence change is about,
 *   so multiplayer clients can flag the specific disconnected seat rather than a
 *   single opaque "opponent". Omitted by older/duel servers, which keep driving the
 *   coarse boolean.
 *
 * - `OPPONENT_STATUS.autoForfeitAt` (additive): when a NON-BOT seat drops mid-game
 *   in a MULTIPLAYER format, the server arms a 2-minute auto-forfeit and sends the
 *   epoch-ms deadline so every client can render a non-drifting countdown
 *   ("reconnecting… auto-forfeit in 1:32", computed from `autoForfeitAt - now`).
 *   Reconnect clears it with a plain all-clear (`connected: true`, no deadline). On
 *   expiry the server injects a normal FORFEIT for that seat — the client needs no
 *   special-casing; the ordinary elimination/game-over STATE takes over.
 *
 * ## v15 (2026-07-12): hero tiers + debug gating (unbrewed-engine #130, #107 Phase 1)
 * `HeroListing` gains `tier` (`'reflavored' | 'spice' | 'community'`) so the
 * client can render a ★ on reflavored names under `?debug`. `LIST_HEROES` and
 * `CREATE_ROOM` both gain an optional `debug` flag (default false/absent):
 * false hides `tier === 'reflavored'` heroes from the HEROES listing and from
 * the server's random bot-hero pool (duel `bot.heroId` omitted, and
 * `botSeats[].heroId` omitted); `debug: true` includes them in both. An
 * EXPLICIT `heroId` — the player's own pick, a named `bot.heroId`/
 * `botSeats[].heroId`, or `JOIN_ROOM.heroId` — is never gated by tier; only the
 * two random-pick pools are filtered. Purely additive; the server still accepts
 * v14 (an older client that omits `debug` gets `debug: false` behavior — a
 * reflavored hero, today only `thetis`, drops out of its HEROES listing and
 * random-bot pools).
 */
export const PROTOCOL_VERSION = 15;

/** Scripted-AI strength preset (server-side budgets; client treats as opaque). */
export type BotDifficulty = "easy" | "medium" | "hard";

export interface BotSeatFill {
  player: PlayerId;
  difficulty: BotDifficulty;
  heroId?: string;
}

// ---------------------------------------------------------------------------
// Shared primitives (mirror engine/types.ts — keep in lockstep)
// ---------------------------------------------------------------------------

export type RuntimePlayerId =
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7" | "p8"
  | "p9" | "p10" | "p11" | "p12" | "p13" | "p14" | "p15" | "p16";
export type DuelPlayerId = "p1" | "p2";
export type PlayerId = RuntimePlayerId;
// Team affiliation, mirrored from the engine (unbrewed-engine PR #101). Public
// info the engine derives from the setup plan; emitted on every seat in every
// format (duel/ffa = distinct per-seat teams, 2v2 = shared per team). Opaque
// string to the client — it only ever compares two TeamIds for equality.
export type TeamId = string;
export type FighterId = string; // '<playerId>/hero' | '<playerId>/sidekick-<n>'
export type CardInstanceId = string; // '<cardDefId>#<n>'
export type CardDefId = string; // 'king-kong/clobber'
export type SpaceId = string;
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type CombatOutcome = "ATTACKER_WON" | "DEFENDER_WON" | "UNKNOWN";

// Actions are the ONLY way the client advances the game. The server's
// legalActions() enumerates which of these are currently legal; the client
// never constructs an action the server didn't offer (exceptions: MOVE_FIGHTER
// may carry any legal path to an offered destination, and FORFEIT may always be
// sent by the player on the clock — the server's legalActions offers it too).
export type Action =
  | { type: "PLACE_SIDEKICK"; player: PlayerId; fighter: FighterId; space: SpaceId }
  | { type: "MANEUVER"; player: PlayerId }
  // Maneuver boost (discard a card to widen a fighter's movement). Multiplayer
  // (unbrewed-engine #119): the engine un-gates BOOST_MOVE enumeration in ffa-3
  // and team-2v2, so any seat on the clock during its maneuver may boost. Hence
  // `player: PlayerId`, not `DuelPlayerId` — same widening as FORFEIT below
  // (additive, no version bump; the client renders it generically from
  // legalActions and echoes back whatever seat the server offered).
  | { type: "BOOST_MOVE"; player: PlayerId; card: CardInstanceId }
  | { type: "MOVE_FIGHTER"; player: PlayerId; fighter: FighterId; path: SpaceId[] }
  | { type: "END_MANEUVER"; player: PlayerId }
  | { type: "SCHEME"; player: PlayerId; card: CardInstanceId }
  | { type: "DECLARE_ATTACK"; player: PlayerId; attacker: FighterId; target: FighterId }
  | { type: "COMMIT_ATTACK_CARD"; player: PlayerId; card: CardInstanceId }
  | { type: "COMMIT_DEFENSE_CARD"; player: PlayerId; card: CardInstanceId }
  | { type: "DECLINE_DEFENSE"; player: PlayerId }
  | { type: "DISCARD_TO_LIMIT"; player: PlayerId; card: CardInstanceId }
  | { type: "RESPOND_PROMPT"; player: PlayerId; promptId: string; optionId: string }
  // Concede (v9). Legal for whoever is on the clock during PLAY; the server ends
  // the game with the OTHER player as winner and emits the replay bundle. The
  // client constructs this directly (the second always-available exception to
  // "never send an action the server didn't offer", alongside MOVE_FIGHTER paths).
  // Multiplayer (unbrewed-engine #117): FORFEIT is a voluntary SEAT elimination —
  // the seat's fighters are swept and it drops out of turn order; the game may
  // continue (team/ffa) or end (human-stake rule). Hence `player: PlayerId`, not
  // `DuelPlayerId` — any seat on the clock may forfeit.
  // `endsMatch` (unbrewed-engine PR #118): SERVER-STAMPED into the action log so a
  // replayed log reproduces the human-stake game-end deterministically (bot-ness
  // is server knowledge the engine can't re-derive from {setup, seed} alone).
  // The CLIENT never sets it — it constructs `{ type: "FORFEIT", player }` and the
  // server fills this in before logging. Optional/absent on the wire the client sends.
  | { type: "FORFEIT"; player: PlayerId; endsMatch?: boolean };

// ---------------------------------------------------------------------------
// Structured event stream (v10). MIRROR of engine/types.ts `GameEvent` — the
// engine is the source of truth; a compile-time assignability check in
// server/redact.ts fails the build if the two unions drift. Events reach a
// client on the STATE that carries the action that produced them, redacted
// per-player by redactEventForPlayer (server/redact.ts) so a card in a hidden
// zone is masked to '(hidden)'. The client appends them to its activity feed;
// a client that ignores `events` behaves exactly as before v10.
// ---------------------------------------------------------------------------
export type GameEvent =
  | { type: "HERO_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "SIDEKICK_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "TURN_STARTED"; player: PlayerId; turnNumber: number }
  | { type: "ACTION_SPENT"; player: PlayerId; action: "MANEUVER" | "SCHEME" | "ATTACK" }
  | { type: "CARD_DRAWN"; player: PlayerId; card: CardInstanceId }
  | { type: "EXHAUSTION_DAMAGE"; player: PlayerId }
  | { type: "DAMAGE_APPLIED"; fighter: FighterId; amount: number; source: "EXHAUSTION" | "EFFECT" | "ATTACK" }
  | { type: "FIGHTER_DEFEATED"; fighter: FighterId }
  | { type: "MOVE_BOOSTED"; player: PlayerId; card: CardInstanceId; boost: number }
  | { type: "FIGHTER_MOVED"; fighter: FighterId; path: SpaceId[] }
  | { type: "SCHEME_PLAYED"; player: PlayerId; card: CardInstanceId }
  | { type: "CARD_DISCARDED"; player: PlayerId; card: CardInstanceId; reason: "HAND_LIMIT" | "BOOST" | "COMBAT" | "EFFECT" | "MILL" }
  | { type: "ATTACK_DECLARED"; attacker: FighterId; target: FighterId }
  | { type: "CARD_COMMITTED"; player: PlayerId }
  | { type: "CARDS_REVEALED"; attackerCard: CardInstanceId; defenderCard: CardInstanceId | null }
  | { type: "COMBAT_DAMAGE"; amount: number }
  | { type: "COMBAT_RESOLVED"; outcome: CombatOutcome }
  | { type: "COMBAT_ENDED" }
  | { type: "TURN_ENDED"; player: PlayerId }
  | { type: "GAME_ENDED"; winner: PlayerId; reason: "HERO_DEFEATED" | "SIMULTANEOUS" | "FORFEIT" }
  | { type: "PROMPT_OPENED"; player: PlayerId; kind: PromptKind; promptId: string }
  | { type: "PROMPT_RESOLVED"; player: PlayerId; promptId: string; optionId: string }
  | { type: "VALUE_MODIFIED"; role: "ATTACK" | "DEFENSE"; delta: number; newEffective: number }
  | { type: "VALUE_SET"; role: "ATTACK" | "DEFENSE"; to: number; locked: boolean }
  | { type: "CARD_BOOSTED"; role: "ATTACK" | "DEFENSE"; card: CardInstanceId; blind: boolean }
  | { type: "BOOST_RETRIEVED"; player: PlayerId; card: CardInstanceId }
  | { type: "EFFECT_CANCELED"; role: "ATTACK" | "DEFENSE"; scope: string }
  | { type: "ACTIONS_GAINED"; player: PlayerId; amount: number }
  | { type: "TURN_END_FORCED"; player: PlayerId }
  | { type: "DEFENSE_IGNORED" }
  | { type: "DAMAGE_PREVENTED"; scope: "ALL" }
  | { type: "COUNTER_CHANGED"; player: PlayerId; name: string; value: number }
  | { type: "FLAG_SET"; player: PlayerId; flag: string }
  | { type: "FLAG_CLEARED"; player: PlayerId; flag: string }
  | { type: "CARD_KEPT"; player: PlayerId; card: CardInstanceId }
  | { type: "ABILITY_BOOST_COMMITTED"; player: PlayerId }
  | { type: "DECK_TOP_REORDERED"; player: PlayerId; count: number }
  | { type: "STAT_SET"; fighter: FighterId; stat: "MOVE"; to: number; expiresAtTurn: number; expiresAt: "START" | "END" }
  | { type: "HP_FLOOR_SET"; fighter: FighterId; floor: number; expiresAtTurn: number; expiresAt: "START" | "END" }
  | { type: "HP_SET"; fighter: FighterId; to: number }
  | { type: "EFFECT_SCHEDULED"; source: string; fireAt: "START" | "END" | "COMBAT_END" }
  // v10: mirror of EFFECT_SCHEDULED emitted when a scheduled effect actually
  // fires — lets the client attribute delayed effect damage to the source card.
  | { type: "EFFECT_FIRED"; source: string; fireAt: "START" | "END" | "COMBAT_END" }
  | { type: "CARD_FOUND"; player: PlayerId; card: CardInstanceId; from: "DECK" | "DISCARD" }
  | { type: "CARD_SHUFFLED_INTO_DECK"; player: PlayerId; card: CardInstanceId; from: "HAND" | "DISCARD" }
  | { type: "CARD_RETURNED_TO_HAND"; player: PlayerId; card: CardInstanceId }
  | { type: "CARD_PLAYED_FROM_HAND"; player: PlayerId; card: CardInstanceId }
  | { type: "CARD_REVEALED"; player: PlayerId; card: CardInstanceId }
  | { type: "DECK_SHUFFLED"; player: PlayerId }
  | { type: "TOKEN_PLACED"; token: string; kind: "totem"; owner: PlayerId; space: SpaceId }
  | { type: "TOKEN_DESTROYED"; token: string; kind: "totem"; owner: PlayerId; space: SpaceId; reason: "EFFECT" | "ENTERED" | "REPLACED" }
  | { type: "FIGHTER_REVIVED"; fighter: FighterId; space: SpaceId }
  | { type: "FIGHTER_PINNED"; fighter: FighterId; expiresAtTurn: number; expiresAt: "START" | "END" }
  | { type: "FIGHTER_TAIL_PLACED"; fighter: FighterId; space: SpaceId }
  | { type: "FIGHTER_EJECTED"; fighter: FighterId; to: SpaceId }
  | { type: "REGION_CLOSED"; region: string };

export type LegalOption = { id: string; label: string; data?: Json };

export type PromptKind =
  | "CHOOSE_TARGET"
  | "CHOOSE_SPACE"
  | "YES_NO"
  | "CHOOSE_OPTION"
  | "COMMIT_COMBAT_CARD"
  | "PAY_COST";

/**
 * The prompt as the viewer sees it. The choosing player receives the full
 * options; the other player receives `options: []` (render "opponent is
 * deciding…"). Answer by sending the RESPOND_PROMPT action offered in
 * `legalActions`.
 */
export interface ViewPrompt {
  promptId: string;
  player: PlayerId;
  kind: PromptKind;
  options: LegalOption[];
  /** What opened this prompt: a resolving card's instance (face public to both
   *  players), a hero ability, or null for system prompts (setup, commit,
   *  maneuver). Lets the client show WHICH effect is asking. A card is named
   *  only when its face is public to BOTH viewers — a face still hidden from the
   *  receiving viewer sends null instead, so this never leaks a redacted id. */
  source?: { card: CardInstanceId } | { hero: PlayerId } | null;
}

// ---------------------------------------------------------------------------
// Map (mirror engine/map.ts MapDef — the server sends the full graph in the
// view; clients never load map files themselves)
// ---------------------------------------------------------------------------

export interface ProMapZone {
  id: string;
  color: string;
  label: string;
}

// A board region (v0.12.0 — Baba Yaga's Hut): a partition rendered as an inset
// minimap panel. See engine docs/plans/baba-yaga-hut-design.md D11.
export interface ProMapRegion {
  id: string;
  label: string;
  imageUrl?: string; // region inset background
  spaceDiameter?: number; // pawn size inside the region frame
}

export interface ProMapSpace {
  id: SpaceId;
  x: number; // normalized 0–1 fraction of image width
  y: number; // normalized 0–1 fraction of image height
  zones: string[]; // SET semantics — multi-zone spaces list every zone
  adjacentTo: SpaceId[]; // undirected, stored symmetrically
  oneWayTo?: SpaceId[]; // directed MOVEMENT-ONLY edges (e.g. Drum stairs)
  region?: string; // region id (absent = main board) — v0.12.0
  start?: { slot: number };
}

export interface ProMapDef {
  schemaVersion: string;
  id: string;
  meta: {
    title: string;
    minPlayers: number;
    maxPlayers: number;
    specialRules: boolean;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    spaceDiameter?: number; // pawn/space size as a fraction of image WIDTH
    set?: string;
    source?: string;
    license?: string;
  };
  zones: ProMapZone[];
  regions?: ProMapRegion[]; // v0.12.0 — board regions (absent on ordinary maps)
  spaces: ProMapSpace[];
}

// ---------------------------------------------------------------------------
// Card catalog — printed metadata for every CardDefId in the match, so the
// client renders rule-true numbers. Strip a CardInstanceId's '#n' suffix to
// look it up. (Display art can still be matched by title against the
// unbrewed-api deck; the catalog is the mechanical truth.)
// ---------------------------------------------------------------------------

export interface CardMeta {
  title: string;
  type: "attack" | "defense" | "scheme" | "versatile";
  value: number | null;
  boost: number | null;
}

// ---------------------------------------------------------------------------
// Per-player redacted view. The server strips the opponent's secrets and
// replaces them with counts; the viewer's own secrets arrive in full.
// ---------------------------------------------------------------------------

export interface ViewFighter {
  id: FighterId;
  owner: PlayerId;
  kind: "HERO" | "SIDEKICK";
  name: string;
  space: SpaceId | null;
  // v6: the second body space of a LARGE fighter (adjacent to `space`), or null
  // for NORMAL fighters / off-board. Render as two linked tokens + stretch-band.
  tailSpace: SpaceId | null;
  hp: number;
  maxHp: number;
  reach: "MELEE" | "RANGED";
  defeated: boolean;
}

// Neutral board tokens (totems). Nothing about a totem is hidden — the full list
// is sent to both players; the client renders a non-interactive sprite at
// `space` and diffs appearances/disappearances (TOKEN_PLACED/TOKEN_DESTROYED).
export interface ViewToken {
  id: string;
  kind: "totem";
  owner: PlayerId;
  space: SpaceId;
}

export interface ViewSelf {
  id: PlayerId;
  heroId: string;
  hand: CardInstanceId[];
  deckCount: number;
  discard: CardInstanceId[];
  committedCard: CardInstanceId | null; // own face-down commit (visible to self)
  counters: Record<string, number>;
  flags?: Record<string, boolean>; // public per-player flags (see ViewPlayer.flags)
}

export interface ViewOpponent {
  id: PlayerId;
  heroId: string;
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[]; // discard is public
  hasCommitted: boolean; // face-down commit exists, identity hidden
  counters: Record<string, number>; // counters are public
  flags?: Record<string, boolean>; // public per-player flags (see ViewPlayer.flags)
}

export interface ViewPlayer {
  id: PlayerId;
  heroId: string;
  you: boolean;
  hand?: CardInstanceId[]; // present only for the receiving player's own seat
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[];
  committedCard?: CardInstanceId | null; // own face-down commit, present only for self
  hasCommitted: boolean;
  counters: Record<string, number>;
  // Team affiliation (public info the engine knows via the setup plan). Emitted
  // UNIFORMLY in every format — teammates share a value; in duel/ffa each seat is
  // its own singleton team. Identical for every viewer (no per-viewer variance).
  // ADDITIVE + OPTIONAL: an older server (pre-team) omits it, and the client then
  // renders exactly as before (no team chrome). Mirrors unbrewed-engine PR #101
  // (`team` on ViewPlayer + ReplayStepPlayer) — no PROTOCOL_VERSION bump.
  team?: TeamId;
  // Public per-player flags, mirroring `counters` (ALL flags are public info the
  // opponent must play around — Thetis/thetis-spice run EBB AND FLOW on a
  // `HIGH_TIDE` flag; LOW TIDE = the flag's absence). A set flag is `true`; an
  // absent flag reads as `false`/undefined. Rendered as a HUD state pill via the
  // FLAG_HUD_CHIPS registry in lib/pro/useProCardArt.ts.
  //
  // ADDITIVE + OPTIONAL, so an older server (pre-flags) omits it and the client
  // renders exactly as before (no tide chip). Mirrors unbrewed-engine #132
  // (`flags` on the redacted PlayerView). Kept at the current PROTOCOL_VERSION
  // per the `team` precedent above; sync the bump here when #132 lands and
  // formalizes the accepted-version set.
  flags?: Record<string, boolean>;
}

export interface ViewCombatCard {
  instance: CardInstanceId;
  role: "ATTACK" | "DEFENSE";
  boosts: CardInstanceId[]; // attached boost cards (public once attached)
  effectiveValue: number; // server-computed running value (printed ± effects + boosts)
}

export interface ViewCombat {
  attackerPlayer: PlayerId;
  defenderPlayer: PlayerId;
  attacker: FighterId;
  target: FighterId;
  stage:
    | "COMMIT_ATTACK"
    | "COMMIT_DEFENSE"
    | "IMMEDIATELY"
    | "DURING"
    | "DAMAGE"
    | "AFTER"
    | "HERO_POST"
    | "CLEANUP";
  // Revealed cards only — null before reveal / if defender declined.
  attackerCard: ViewCombatCard | null;
  defenderCard: ViewCombatCard | null;
  outcome: CombatOutcome | null;
  attackDamageDealt: number | null;
}

export interface PlayerView {
  you: PlayerId;
  phase: "SETUP" | "PLAY" | "GAME_OVER";
  turnNumber: number;
  activePlayer: PlayerId;
  actionsRemaining: number;
  turnPhase: "ACTION_SELECT" | "MANEUVER_MOVE" | "DISCARD_TO_LIMIT" | null;
  // Non-null only during MANEUVER_MOVE (which fighters already moved, boost applied).
  maneuver: { boostApplied: number; boosted: boolean; moved: FighterId[] } | null;
  map: ProMapDef;
  catalog: Record<CardDefId, CardMeta>;
  fighters: ViewFighter[];
  tokens: ViewToken[]; // neutral board tokens (totems); public to both players
  self: ViewSelf;
  // Duel compatibility alias: the first non-self player in runtime order, or null
  // in malformed/spectator-free states. New multiplayer clients should use players[].
  opponent: ViewOpponent | null;
  players: ViewPlayer[];
  combat: ViewCombat | null;
  prompt: ViewPrompt | null;
  // Regions currently OUT OF PLAY (v0.12.0 — a closed Hut). Public info (no
  // redaction); the client greys out the region's inset panel. Absent/[] = none.
  closedRegions?: string[];
  // v11: true iff THIS viewer has an eligible last discrete move to undo right now
  // (there is a clean cut boundary the server would rewind to). Recomputed on every
  // STATE broadcast per-viewer; the client gates its Undo button entirely on this.
  // Absent/false = nothing to undo (not this viewer's move, mid-combat, no prior
  // action, or the game is over).
  canUndo?: boolean;
  winner: PlayerId | null;
}

// ---------------------------------------------------------------------------
// Replay bundles (v7) — a portable, self-contained artifact for the /pro/replays
// scrubber. Because the engine is deterministic, storing DECISIONS (config +
// actionLog) re-derives every board state; we never ship board snapshots.
//
// `config.players[pid].hero`/`cards` are the engine's HeroDef/CardDef, opaque to
// the client (typed `Json` so protocol.ts stays import-free) — the client stores
// and forwards them verbatim; only the server (which owns the engine) reads them.
// ---------------------------------------------------------------------------

export interface ReplayPlayerSetup {
  heroId: string;
  hero: Json; // engine HeroDef — opaque to the client
  cards: Json; // engine CardDef[] — opaque to the client
}

// A complete engine InitConfig plus the resolved board graph, so a bundle
// reproduces anywhere without a server-side content lookup.
export interface ReplayConfig {
  seed: number;
  mapId?: string;
  options?: { allowNonstandardDeck?: boolean; startingHandSize?: number };
  players: { p1: ReplayPlayerSetup; p2: ReplayPlayerSetup } & Partial<Record<PlayerId, ReplayPlayerSetup>>;
  formatId?: string;
  map: ProMapDef;
}

// Denormalized summary for the list UI + a Discord preview — readable without
// expanding the whole log.
export interface ReplayMeta {
  winner: PlayerId | null;
  heroes: Partial<Record<PlayerId, string>>; // hero id by runtime player id
  turns: number;
  endedAt: number; // epoch ms
  mapTitle: string;
}

export interface ReplayBundle {
  v: 1;
  engine: { schemaVersion: number; dslVersion: string };
  config: ReplayConfig;
  actionLog: Action[];
  meta: ReplayMeta;
}

// One player's full (unredacted) per-step state in a God-view replay.
export interface ReplayStepPlayer {
  heroId: string;
  hand: CardInstanceId[];
  deckCount: number;
  discard: CardInstanceId[];
  committedCard: CardInstanceId | null;
  counters: Record<string, number>;
  // Team affiliation in god-view/replay steps (mirrors unbrewed-engine PR #101 —
  // ReplayStepPlayer carries `team` too, so replay UIs can show teams). Additive
  // optional; a bundle from an older engine omits it.
  team?: TeamId;
}

// One scrubber frame: the board plus BOTH players face-up. `index` 0 is the
// initial state (post-startGame, before any action); index k is the state after
// applying actionLog[k-1], so steps.length === actionLog.length + 1.
export interface ReplayStep {
  index: number;
  phase: "SETUP" | "PLAY" | "GAME_OVER";
  turnNumber: number;
  activePlayer: PlayerId;
  actionsRemaining: number;
  turnPhase: "ACTION_SELECT" | "MANEUVER_MOVE" | "DISCARD_TO_LIMIT" | null;
  maneuver: { boostApplied: number; boosted: boolean; moved: FighterId[] } | null;
  fighters: ViewFighter[];
  tokens: ViewToken[];
  combat: ViewCombat | null;
  // The choosing player's full option set (God-view sees every option); null when
  // no prompt is open.
  prompt: ViewPrompt | null;
  winner: PlayerId | null;
  players: { p1: ReplayStepPlayer; p2: ReplayStepPlayer } & Partial<Record<PlayerId, ReplayStepPlayer>>;
}

// `POST /replay` success — map + catalog + heroes are hoisted (static across the
// match) so the per-step frames stay small.
export interface ReplayExpansion {
  ok: true;
  engine: { schemaVersion: number; dslVersion: string };
  meta: ReplayMeta;
  map: ProMapDef;
  catalog: Record<CardDefId, CardMeta>;
  heroes: Partial<Record<PlayerId, string>>;
  steps: ReplayStep[];
  finalHash: string; // FNV-1a of the final state — pins the exact game
}

export type ReplayErrorCode =
  | "BAD_BUNDLE" // malformed JSON / missing required fields
  | "TOO_LARGE" // actionLog exceeds the server cap
  | "VERSION_MISMATCH" // schemaVersion/dslVersion differs from this engine
  | "ILLEGAL_ACTION"; // the reducer rejected an action in the log

export interface ReplayError {
  ok: false;
  code: ReplayErrorCode;
  message: string;
}

export type ReplayResponse = ReplayExpansion | ReplayError;

// ---------------------------------------------------------------------------
// Wire envelope. Every message carries `v`; on mismatch the server answers
// ERROR{code:'VERSION'} and the client shows "refresh".
// ---------------------------------------------------------------------------

// A hero's visibility class (#107 Phase 1). `reflavored` decks are hidden from
// the public roster and random bot rotation unless the request carries
// `debug: true`; `spice` are their public replacements; `community` heroes are
// always visible (no reflavor exists yet).
export type HeroTier = "reflavored" | "spice" | "community";

export interface HeroListing {
  heroId: string;
  name: string;
  hp: number;
  move: number;
  reach: "MELEE" | "RANGED";
  tier: HeroTier;
}

// One seat in a live ROOM_STATUS broadcast (v15). Public pre-game info only —
// the hero pick is public before the game starts, so the waiting room can name
// who has joined. `bot` is the seat's AI difficulty (a server-filled AI seat) or
// null for a human seat; `connected` reflects the seat's socket (a seated human
// can briefly show disconnected during a waiting-room reconnect before its grace
// timer releases the seat).
export interface RoomStatusSeat {
  player: PlayerId;
  heroId: string;
  connected: boolean;
  bot: BotDifficulty | null;
}

// A public room waiting for a second player (LIST_LOBBIES result row).
export interface LobbyListing {
  roomId: string;
  heroId: string;
  heroName: string;
  ageMs: number; // time the lobby has been waiting (now − room creation); NOT reset by a visibility toggle
}

// A single rewound action, summarized for the UNDO_REQUESTED prompt (v11). Only
// the acting player + the action TYPE are exposed — never card ids — so surfacing
// the rewind list to the opponent BEFORE they consent leaks no hidden identity.
export interface UndoActionSummary {
  player: PlayerId;
  action: Action["type"];
}

export type ClientMsg =
  // `debug` (v15): true includes `tier: 'reflavored'` heroes in the HEROES
  // listing. Absent/false = hidden. See the v15 note above.
  | { v: number; type: "LIST_HEROES"; debug?: boolean }
  | { v: number; type: "LIST_LOBBIES" }
  // `customMap` (v4): playtest an unpublished board — the server validates it
  // and uses it for this room only. Composes with `bot`. Omit for the default map.
  // `seed` (dev-only): overrides the server-picked game seed so a whole match —
  // hands included — reproduces from {seed, actionLog}. HONORED ONLY when the
  // server enables it (PRO_ALLOW_DEV_SEED=1); production ignores it. Additive and
  // never sent by the real client, so it needs no client-side protocol sync.
  // `debug` (v15): true includes `tier: 'reflavored'` heroes in the random pool
  // a server-picked `bot.heroId`/`botSeats[].heroId` draws from. Absent/false =
  // excluded. Never gates an explicitly named heroId. See the v15 note above.
  | { v: number; type: "CREATE_ROOM"; heroId: string; formatId?: string; seed?: number; bot?: { difficulty: BotDifficulty; heroId?: string }; botSeats?: BotSeatFill[]; customMap?: ProMapDef; debug?: boolean }
  | { v: number; type: "JOIN_ROOM"; roomId: string; heroId: string }
  | { v: number; type: "SET_VISIBILITY"; roomId: string; public: boolean }
  | { v: number; type: "RECONNECT"; roomId: string; token: string }
  // v7: revive an in-memory room lost to a redeploy/crash. `token` is the opaque
  // encrypted blob the server last pushed via RESUME_TOKEN (client localStorage).
  | { v: number; type: "RESUME_ROOM"; token: string }
  // v11: pro undo. UNDO_REQUEST asks to undo your OWN last discrete move; the server
  // pushes UNDO_REQUESTED to the opponent. UNDO_RESPONSE carries the opponent's
  // accept/reject. Neither is an `Action` — undo never enters the replay log.
  | { v: number; type: "UNDO_REQUEST"; roomId: string }
  | { v: number; type: "UNDO_RESPONSE"; roomId: string; accept: boolean }
  | { v: number; type: "ACTION"; roomId: string; action: Action };

export type ServerMsg =
  | { v: number; type: "HEROES"; heroes: HeroListing[] }
  | { v: number; type: "LOBBIES"; lobbies: LobbyListing[] }
  | { v: number; type: "ROOM_CREATED"; roomId: string; token: string; you: PlayerId; formatId?: string; seats?: PlayerId[]; requiredPlayers?: number }
  | { v: number; type: "ROOM_JOINED"; roomId: string; token: string; you: PlayerId; formatId?: string; seats?: PlayerId[]; requiredPlayers?: number }
  | { v: number; type: "VISIBILITY"; roomId: string; public: boolean } // ack to SET_VISIBILITY
  | {
      v: number;
      type: "STATE";
      view: PlayerView;
      legalActions: Action[];
      /**
       * Events produced by the action that triggered THIS broadcast, redacted
       * for the receiving player. Omitted on join/reconnect/resume broadcasts
       * (never replayed) — clients append these to their activity feed. A client
       * that ignores this field is unaffected.
       */
      events?: GameEvent[];
    }
  // Sent to BOTH seats once the game reaches GAME_OVER (v7). Unredacted +
  // self-contained; the client saves it for the /pro/replays scrubber.
  | { v: number; type: "REPLAY_BUNDLE"; bundle: ReplayBundle }
  // v15: `player` identifies WHICH seat this is about (omitted by older/duel
  // servers — the client then treats it as the coarse opponent signal). While a
  // non-bot seat is disconnected mid-game in a MULTIPLAYER format, `autoForfeitAt`
  // carries the epoch-ms server deadline for a non-drifting countdown; the
  // all-clear (`connected: true`) omits it. See the v15 doc block.
  | { v: number; type: "OPPONENT_STATUS"; connected: boolean; player?: PlayerId; autoForfeitAt?: number }
  // v15: live waiting-room fill (seats/heroes/connectedness). Broadcast to every
  // seated player on join, pre-game seat release (count may DROP), and
  // waiting-room reconnect/disconnect. See RoomStatusSeat + the v15 doc block.
  | { v: number; type: "ROOM_STATUS"; roomId: string; formatId: string; requiredPlayers: number; seats: RoomStatusSeat[] }
  // v7: the old instance is about to stop (SIGTERM). Show "server updating" and
  // let the reconnect loop take over — a valid RESUME_TOKEN revives the game.
  | { v: number; type: "SERVER_RESTARTING" }
  // v7: opaque, encrypted+authenticated resume blob for THIS seat. Store it
  // (localStorage) and send it back in RESUME_ROOM to revive after a redeploy.
  | { v: number; type: "RESUME_TOKEN"; roomId: string; token: string }
  // v11: pushed to the OPPONENT when a player requests an undo. `requester` is who
  // asked (so the prompt can name them); `rewindActions` summarizes every action the
  // accepted rewind would remove (including the opponent's own), so consent is
  // informed. The opponent answers UNDO_RESPONSE.
  | { v: number; type: "UNDO_REQUESTED"; requester: PlayerId; rewindActions: UndoActionSummary[] }
  // v11: pushed to the REQUESTER when their undo is declined, superseded, or stale.
  | { v: number; type: "UNDO_REJECTED" }
  | { v: number; type: "ERROR"; code: ErrorCode; message: string };

export type ErrorCode =
  | "VERSION" // protocol mismatch — client should refresh
  | "BAD_MESSAGE" // unparseable / unknown type
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "BAD_TOKEN"
  | "NOT_YOUR_SEAT" // action.player !== your seat
  | "ILLEGAL_ACTION" // reducer rejected it (client bug or stale view)
  | "UNKNOWN_HERO"
  | "BAD_MAP" // CREATE_ROOM.customMap failed validation (message lists violations)
  | "RESUME_FAILED" // RESUME_ROOM replay diverged / resume disabled (see message)
  | "UNDO_UNAVAILABLE" // UNDO_REQUEST with nothing to undo, or one already pending
  // Additive (2026-07-11, unbrewed-engine PR #103) — mirrored VERBATIM from the
  // engine's protocol.ts ErrorCode. Both are NON-FATAL and DO NOT bump
  // PROTOCOL_VERSION (older clients see them as an unknown code and fall back to
  // the generic error path; new clients render friendly, actionable copy).
  | "ROOM_LIMIT" // server is at its global room cap — retry shortly (create/join)
  | "RATE_LIMITED" // client is sending too fast; the socket stays open, but a
                   // repeated breach makes the server close it (reconnect backs off)
  | "SERVER_ERROR";
