/**
 * Pro protocol — CLIENT COPY (DRAFT).
 *
 * ⚠ SOURCE OF TRUTH is unbrewed-pro-server/protocol/protocol.ts. That file did
 * not exist yet when this draft was written (2026-07-04, overnight prep); this
 * mirrors the engine's committed types (engine/types.ts, engine/map.ts) plus a
 * proposed room envelope. FIRST TASK when wiring the live server: diff this
 * against the server's protocol.ts and make this file an exact copy.
 *
 * The client contains ZERO rules logic. It renders `view`, offers
 * `legalActions` as UI affordances, and answers `prompt`s. Everything here is
 * plain JSON-serializable data.
 */

export const PROTOCOL_VERSION = 0; // 0 = draft; server bumps to 1 when frozen

// ---------------------------------------------------------------------------
// Shared primitives (mirror engine/types.ts)
// ---------------------------------------------------------------------------

export type PlayerId = "p1" | "p2";
export type FighterId = string; // '<playerId>/hero' | '<playerId>/sidekick-<n>'
export type CardInstanceId = string; // '<cardDefId>#<n>'
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
// never constructs an action the server didn't offer.
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
  | { type: "DISCARD_TO_LIMIT"; player: PlayerId; card: CardInstanceId };

export type LegalOption = { id: string; label: string; data?: Json };

export interface PendingPrompt {
  promptId: string;
  player: PlayerId;
  kind:
    | "CHOOSE_TARGET"
    | "CHOOSE_SPACE"
    | "YES_NO"
    | "CHOOSE_OPTION"
    | "COMMIT_COMBAT_CARD"
    | "PAY_COST";
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
  oneWayTo?: SpaceId[]; // directed movement-only edges (e.g. Drum stairs)
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
// Per-player redacted view. The server strips the opponent's PlayerSecret and
// replaces it with counts; own secret arrives in full.
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

export interface ViewSelf {
  id: PlayerId;
  heroId: string;
  hand: CardInstanceId[];
  deckCount: number;
  discard: CardInstanceId[];
  committedCard: CardInstanceId | null; // own face-down commit (visible to self)
}

export interface ViewOpponent {
  id: PlayerId;
  heroId: string;
  handCount: number;
  deckCount: number;
  discard: CardInstanceId[]; // discard is public
  hasCommitted: boolean; // face-down commit exists, identity hidden
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
  attackerCard: CardInstanceId | null;
  defenderCard: CardInstanceId | null;
  outcome: CombatOutcome | null;
}

export interface PlayerView {
  you: PlayerId;
  phase: "SETUP" | "PLAY" | "GAME_OVER";
  turnNumber: number;
  activePlayer: PlayerId;
  actionsRemaining: number;
  turnPhase: "ACTION_SELECT" | "MANEUVER_MOVE" | "DISCARD_TO_LIMIT" | null;
  map: ProMapDef;
  fighters: ViewFighter[];
  self: ViewSelf;
  opponent: ViewOpponent;
  combat: ViewCombat | null;
  winner: PlayerId | null;
}

// ---------------------------------------------------------------------------
// Wire envelope (proposed — reconcile with server repo)
// ---------------------------------------------------------------------------

export type ClientMsg =
  | { v: number; type: "CREATE_ROOM"; heroId: string }
  | { v: number; type: "JOIN_ROOM"; roomId: string; heroId: string }
  | { v: number; type: "RECONNECT"; roomId: string; token: string }
  | { v: number; type: "ACTION"; roomId: string; action: Action }
  | { v: number; type: "PROMPT_RESPONSE"; roomId: string; promptId: string; optionId: string };

export type ServerMsg =
  | { v: number; type: "ROOM_CREATED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "ROOM_JOINED"; roomId: string; token: string; you: PlayerId }
  | { v: number; type: "STATE"; view: PlayerView; legalActions: Action[]; prompt: PendingPrompt | null }
  | { v: number; type: "OPPONENT_STATUS"; connected: boolean }
  | { v: number; type: "ERROR"; code: string; message: string };
