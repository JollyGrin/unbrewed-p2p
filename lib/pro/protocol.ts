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
 */

/**
 * ## v10 (2026-07-08): prompt attribution (issue #35)
 * `ViewPrompt` gained optional `source` — WHAT opened the prompt, so the client
 * can label a choice with the card/ability asking (players were guessing; see
 * unbrewed-p2p#147/#151). Projected in redactFor from the parked effect run's
 * scope.source: a resolving card's instance → `{ card }`, a hero ability →
 * `{ hero }`, and system prompts with no effect run (combat commit, sidekick
 * placement, maneuver, maneuver-boost) → `null`. Hidden-info guarded: a card
 * instance is named ONLY when its face is public to BOTH players (a scheme in
 * discard, a revealed combat card); a still-hidden face sends `null` instead, so
 * `source` never leaks an identity `redactFor` otherwise strips.
 */
export const PROTOCOL_VERSION = 10;

/** Scripted-AI strength preset (server-side budgets; client treats as opaque). */
export type BotDifficulty = "easy" | "medium" | "hard";

// ---------------------------------------------------------------------------
// Shared primitives (mirror engine/types.ts — keep in lockstep)
// ---------------------------------------------------------------------------

export type PlayerId = "p1" | "p2";
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
  | { type: "FORFEIT"; player: PlayerId };

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
}

export interface ViewOpponent {
  id: PlayerId;
  heroId: string;
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[]; // discard is public
  hasCommitted: boolean; // face-down commit exists, identity hidden
  counters: Record<string, number>; // counters are public
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
  opponent: ViewOpponent;
  combat: ViewCombat | null;
  prompt: ViewPrompt | null;
  // Regions currently OUT OF PLAY (v0.12.0 — a closed Hut). Public info (no
  // redaction); the client greys out the region's inset panel. Absent/[] = none.
  closedRegions?: string[];
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
  players: { p1: ReplayPlayerSetup; p2: ReplayPlayerSetup };
  map: ProMapDef;
}

// Denormalized summary for the list UI + a Discord preview — readable without
// expanding the whole log.
export interface ReplayMeta {
  winner: PlayerId | null;
  heroes: [string, string]; // [p1 heroId, p2 heroId]
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
  players: { p1: ReplayStepPlayer; p2: ReplayStepPlayer };
}

// `POST /replay` success — map + catalog + heroes are hoisted (static across the
// match) so the per-step frames stay small.
export interface ReplayExpansion {
  ok: true;
  engine: { schemaVersion: number; dslVersion: string };
  meta: ReplayMeta;
  map: ProMapDef;
  catalog: Record<CardDefId, CardMeta>;
  heroes: { p1: string; p2: string };
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

export interface HeroListing {
  heroId: string;
  name: string;
  hp: number;
  move: number;
  reach: "MELEE" | "RANGED";
}

// A public room waiting for a second player (LIST_LOBBIES result row).
export interface LobbyListing {
  roomId: string;
  heroId: string;
  heroName: string;
  ageMs: number; // time the lobby has been waiting (now − room creation); NOT reset by a visibility toggle
}

export type ClientMsg =
  | { v: number; type: "LIST_HEROES" }
  | { v: number; type: "LIST_LOBBIES" }
  // `customMap` (v4): playtest an unpublished board — the server validates it
  // and uses it for this room only. Composes with `bot`. Omit for the default map.
  | { v: number; type: "CREATE_ROOM"; heroId: string; bot?: { difficulty: BotDifficulty; heroId?: string }; customMap?: ProMapDef }
  | { v: number; type: "JOIN_ROOM"; roomId: string; heroId: string }
  | { v: number; type: "SET_VISIBILITY"; roomId: string; public: boolean }
  | { v: number; type: "RECONNECT"; roomId: string; token: string }
  // v7: revive an in-memory room lost to a redeploy/crash. `token` is the opaque
  // encrypted blob the server last pushed via RESUME_TOKEN (client localStorage).
  | { v: number; type: "RESUME_ROOM"; token: string }
  | { v: number; type: "ACTION"; roomId: string; action: Action };

export type ServerMsg =
  | { v: number; type: "HEROES"; heroes: HeroListing[] }
  | { v: number; type: "LOBBIES"; lobbies: LobbyListing[] }
  | { v: number; type: "ROOM_CREATED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "ROOM_JOINED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "VISIBILITY"; roomId: string; public: boolean } // ack to SET_VISIBILITY
  | { v: number; type: "STATE"; view: PlayerView; legalActions: Action[] }
  // Sent to BOTH seats once the game reaches GAME_OVER (v7). Unredacted +
  // self-contained; the client saves it for the /pro/replays scrubber.
  | { v: number; type: "REPLAY_BUNDLE"; bundle: ReplayBundle }
  | { v: number; type: "OPPONENT_STATUS"; connected: boolean }
  // v7: the old instance is about to stop (SIGTERM). Show "server updating" and
  // let the reconnect loop take over — a valid RESUME_TOKEN revives the game.
  | { v: number; type: "SERVER_RESTARTING" }
  // v7: opaque, encrypted+authenticated resume blob for THIS seat. Store it
  // (localStorage) and send it back in RESUME_ROOM to revive after a redeploy.
  | { v: number; type: "RESUME_TOKEN"; roomId: string; token: string }
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
  | "SERVER_ERROR";
