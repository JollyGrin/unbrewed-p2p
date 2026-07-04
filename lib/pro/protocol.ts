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
 */

export const PROTOCOL_VERSION = 3;

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
// never constructs an action the server didn't offer (exception: MOVE_FIGHTER
// may carry any legal path to an offered destination).
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
  | { type: "RESPOND_PROMPT"; player: PlayerId; promptId: string; optionId: string };

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

export interface ProMapSpace {
  id: SpaceId;
  x: number; // normalized 0–1 fraction of image width
  y: number; // normalized 0–1 fraction of image height
  zones: string[]; // SET semantics — multi-zone spaces list every zone
  adjacentTo: SpaceId[]; // undirected, stored symmetrically
  oneWayTo?: SpaceId[]; // directed MOVEMENT-ONLY edges (e.g. Drum stairs)
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
  winner: PlayerId | null;
}

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

/** A public room waiting for an opponent, as shown in the lobby browser. */
export interface LobbyListing {
  roomId: string;
  heroId: string;
  heroName: string;
  ageMs: number; // how long the lobby has been waiting (server clock)
}

export type ClientMsg =
  | { v: number; type: "LIST_HEROES" }
  | { v: number; type: "CREATE_ROOM"; heroId: string }
  | { v: number; type: "JOIN_ROOM"; roomId: string; heroId: string }
  | { v: number; type: "RECONNECT"; roomId: string; token: string }
  | { v: number; type: "ACTION"; roomId: string; action: Action }
  | { v: number; type: "LIST_LOBBIES" }
  | { v: number; type: "SET_VISIBILITY"; roomId: string; public: boolean };

export type ServerMsg =
  | { v: number; type: "HEROES"; heroes: HeroListing[] }
  | { v: number; type: "ROOM_CREATED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "ROOM_JOINED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "STATE"; view: PlayerView; legalActions: Action[] }
  | { v: number; type: "OPPONENT_STATUS"; connected: boolean }
  | { v: number; type: "LOBBIES"; lobbies: LobbyListing[] }
  | { v: number; type: "VISIBILITY"; roomId: string; public: boolean } // ack to the setter
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
  | "SERVER_ERROR";
