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
