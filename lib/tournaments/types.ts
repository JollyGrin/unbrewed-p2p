/**
 * Wire shapes for the tournaments API (unbrewed-api `docs/tournaments-api.md`,
 * epic #1196). Mirrors the api's documented JSON; nothing here is computed.
 *
 * Extensibility rules (binding, #1196 2026-10-05): a match has `firstTo` and an
 * ordered `games[]` — never a single game-id field — and a game's heroes/map
 * come from ONE function, `assignment()` in ./matchup.
 */

export interface Person {
  userId: string;
  username: string | null;
  avatarUrl: string;
}

export type MapRef = { kind: "catalog" | "custom"; id: string };

export type MatchupMode = "free" | "fixed" | "map" | "pool" | "draft";

export interface MatchupRule {
  mode: MatchupMode;
  heroes?: { a?: string; b?: string };
  map?: MapRef;
  swapEachGame?: boolean;
}

export type TournamentStatus =
  | "draft"
  | "signup"
  | "running"
  | "complete"
  | "cancelled";

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  organizer: Person;
  format: "single_elim" | "round_robin";
  size: number;
  firstTo: number;
  matchWindowHours: number;
  matchupRule: MatchupRule;
  roundMaps: Record<string, MapRef> | null;
  status: TournamentStatus;
  signupClosesAt: string | null;
  startsAt: string | null;
  createdAt: string;
  settings: Record<string, unknown>;
  entryCount: number;
  signupOpen: boolean;
  latestPossibleFinal: string | null;
  /** Only on `/me/tournaments` rows. */
  isOrganizer?: boolean;
  myEntryId?: string | null;
}

export interface Entry {
  id: string;
  userId: string;
  username: string | null;
  avatarUrl: string;
  seed: number | null;
  joinedAt: string;
  leftAt: string | null;
}

/** The body `POST /tournaments` takes. Presets are a client concern. */
export interface CreateTournamentBody {
  name: string;
  format: "single_elim";
  size: number;
  matchWindowHours: number;
  matchupRule: MatchupRule;
  roundMaps?: Record<string, MapRef>;
  signupClosesAt: string;
  status: "draft" | "signup";
  settings?: Record<string, unknown>;
}

/** `assignment(matchupRule, gameIndex)`'s output (see ./matchup). */
export interface Assignment {
  heroes: { a: string | null; b: string | null };
  map: MapRef | null;
}

export interface Game {
  gameIndex: number;
  roomId: string | null;
  /** Telemetry id, null until the game finishes. */
  gameId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  winnerEntry: string | null;
  source: "tagged" | "untagged";
  verified: boolean;
  /** Set when the organizer rejected this unverified result: never a win, never a result. */
  rejectedAt?: string | null;
  assignment: Assignment;
  /**
   * The api's replay route lands at the end of the epic (#1196): until it says
   * `true` the match page shows no Replay chip. Absent = false.
   */
  replayAvailable?: boolean;
}

export type MatchStatus = "pending" | "open" | "in_play" | "decided";

export type DecidedBy =
  | "result"
  | "deadline_ready_check"
  | "deadline_higher_seed"
  | "organizer"
  | "bye"
  | "unverified_confirmed";

/**
 * One bracket match. Slots and `winner` are ENTRY ids. `games[]` is ordered and
 * always an array — there is never a single game-id field on a match.
 */
export interface Match {
  id: string;
  /** 1-based; the final is round log2(size). */
  round: number;
  /** 0-based, top to bottom within the round. */
  position: number;
  slotA: string | null;
  slotB: string | null;
  winner: string | null;
  firstTo: number;
  status: MatchStatus;
  decidedBy: DecidedBy | null;
  inPlay: boolean;
  opensAt: string | null;
  deadlineAt: string | null;
  nextMatchId: string | null;
  nextSlot: "a" | "b" | null;
  matchupRule: MatchupRule;
  matchupOverride: boolean;
  matchup: Assignment;
  games: Game[];
}

/** A match side on the single-match route: the entry plus when they were last seen. */
export type MatchPlayer = Entry & { lastActiveAt: string | null };

/** One press of "I'm ready" (15-minute seat hold). */
export interface ReadyCheck {
  id: string;
  gameIndex: number;
  entryId: string;
  createdAt: string;
  expiresAt: string;
  roomId: string | null;
  outcome: "pending" | "answered" | "unanswered";
  role: "create" | "join";
}

/** A player's tagged room, open and waiting for the other seat. */
export interface LiveRoom {
  gameIndex: number;
  roomId: string | null;
  readyEntryId: string;
  expiresAt: string;
}

/** `GET /tournaments/:slug/matches/:id`. */
export interface MatchDetail {
  match: Match;
  tournament: Pick<Tournament, "id" | "slug" | "name" | "status"> &
    Partial<Pick<Tournament, "size" | "latestPossibleFinal" | "organizer">>;
  players: { a: MatchPlayer | null; b: MatchPlayer | null };
  readyChecks: ReadyCheck[];
  liveRoom: LiveRoom | null;
}

/**
 * `POST …/ready` and `GET …/ticket`: a signed, opaque join ticket (15 min) and
 * what to do with it. `join` with `roomId: null` = the other room is still
 * opening; poll `…/ticket` until it has an id.
 */
export interface TicketGrant {
  action: "create" | "join";
  ticket: string;
  gameIndex: number;
  slot: "a" | "b";
  heroId: string | null;
  map: MapRef | null;
  ticketExpiresAt: string;
  roomId: string | null;
}

/**
 * `GET /me/tournaments` → `nextMatch`: the caller's open (or in-play) match with
 * the soonest deadline, for the /pro banner. `null` = nothing to play.
 */
export interface NextMatch {
  tournament: Pick<Tournament, "id" | "slug" | "name"> &
    Partial<Pick<Tournament, "size">>;
  match: Match;
  myEntryId: string;
  opponent: Entry | null;
}

export interface MyTournaments {
  tournaments: Tournament[];
  nextMatch: NextMatch | null;
}
