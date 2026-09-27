/**
 * Types for the stats dashboard train (issue #935 and the page tickets that
 * build on it). The contract is `.grove/stats-dashboard/contract.md` (mirrored
 * in JollyGrin/unbrewed-api#54); every field name below is spelled as it is
 * there. Two families live side by side:
 *
 * - `*Wire` — what unbrewed-api sends, verbatim from contract §2. The fixtures
 *   in `./fixtures` are typed against these, so a fixture that drifts from the
 *   contract fails `tsc` rather than quietly rendering.
 * - the plain names — what the normalisers in `./normalize` hand the pages.
 *   Every section the contract ADDS is `| null` here: `null` means "this API
 *   didn't send it" (today's prod sends none of it), and a `null` section
 *   renders nothing — the same rule `AccountStats.tsx` already keeps.
 */
import type { LeaderboardRow } from "@/lib/account/leaderboard";
import type { PublicProfile } from "@/lib/account/publicProfile";
import type { FormResult } from "@/lib/account/stats";

export type { FormResult };

/** `window=all` (default) or `window=month` (current UTC calendar month). */
export type StatsWindow = "all" | "month";

/** The three opponent kinds of contract §0, in reading order. */
export type OpponentKind = "human" | "hardExpert" | "casual";
export const OPPONENT_KINDS: readonly OpponentKind[] = [
  "human",
  "hardExpert",
  "casual",
];

// --- wire shapes (contract §1/§2, verbatim) ----------------------------------

export interface CommunityKindCountsWire {
  human: number;
  hardExpert: number;
  casual: number;
}

export interface CommunityWeekWire extends CommunityKindCountsWire {
  /** YYYY-MM-DD, the Monday of the ISO week, UTC. */
  weekStart: string;
}

/** A crown/pilot once the api has swapped `playerId` for a username (§2a/§2b). */
export interface CrownWire {
  username: string;
  avatarUrl: string | null;
  wins: number;
  games: number;
}

export interface CommunityHeroWire {
  heroId: string;
  heroName: string | null;
  games: number;
  wins: number;
  draws: number;
  crown: CrownWire | null;
}

export interface MatchupWire {
  heroId: string;
  opponentHeroId: string;
  games: number;
  wins: number;
  draws: number;
}

/** `GET /community?window=` (§2a). */
export interface CommunityWire {
  window: StatsWindow;
  windowStart: string | null;
  generatedAt: string;
  totals: CommunityKindCountsWire & {
    games: number;
    humanVsExpert: { games: number; wins: number };
  };
  weekly: CommunityWeekWire[];
  heroes: CommunityHeroWire[];
  matchups: MatchupWire[];
  playersRanked: number;
}

export interface HeroPilotWire {
  username: string;
  avatarUrl: string | null;
  games: number;
  wins: number;
  draws: number;
}

export interface HeroMatchupWire {
  opponentHeroId: string;
  opponentHeroName: string | null;
  games: number;
  wins: number;
  draws: number;
}

/** `GET /heroes?h=&window=` (§2b). */
export interface HeroWire {
  heroId: string;
  heroName: string | null;
  window: StatsWindow;
  windowStart: string | null;
  generatedAt: string;
  games: number;
  wins: number;
  draws: number;
  totalHumanSeatGames: number;
  pilotCount: number;
  pilots: HeroPilotWire[];
  crown: HeroPilotWire | null;
  matchups: HeroMatchupWire[];
  byOpponentKind: CommunityKindCountsWire;
}

/** One `GET /leaderboard` row: today's fields plus §2c's additions. */
export interface LeaderboardRowWire {
  rank: number;
  username: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  selectedBadges: string[];
  gamesPlayed: number;
  wins: number;
  mainHeroId: string | null;
  mainHeroName: string | null;
  recentForm: FormResult[];
  currentStreak: number;
  /** Only on `window=month`. */
  monthGames?: number;
  monthWins?: number;
}

export interface LeaderboardWire {
  generatedAt: string;
  total: number;
  players: LeaderboardRowWire[];
}

export interface StatSplitWire {
  games: number;
  wins: number;
  draws?: number;
}

export interface HeroStatWire extends StatSplitWire {
  heroId: string | null;
  heroName: string | null;
}

/** Telemetry's `PlayerStats` (see lib/account/stats.ts) plus §1c's two fields. */
export interface PlayerStatsWire {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  firstGameAt: string | null;
  lastGameAt: string | null;
  byHero: HeroStatWire[];
  level?: number;
  xp?: number;
  xpForNext?: number;
  avgDurationSeconds?: number | null;
  avgTurns?: number | null;
  streaks?: { current: number; best: number };
  recentForm?: FormResult[];
  byOpponentHero?: HeroStatWire[];
  byMap?: (StatSplitWire & { map: string })[];
  byOpponentKind?: {
    human: StatSplitWire | null;
    bots: (StatSplitWire & { difficulty: string })[];
  };
  firstPlayer?: { first: StatSplitWire; second: StatSplitWire };
  calendar: CalendarDayWire[];
  byHeroOpponentHero: HeroOpponentHeroWire[];
}

export interface CalendarDayWire {
  /** YYYY-MM-DD, UTC. */
  date: string;
  games: number;
}

export interface HeroOpponentHeroWire {
  heroId: string | null;
  heroName: string | null;
  opponentHeroId: string | null;
  opponentHeroName: string | null;
  games: number;
  wins: number;
  draws: number;
}

export interface BadgeWire {
  id: string;
  name: string;
  blurb: string;
  unlocked: boolean;
  unlockedWhy: string;
  /** §2e: only for plain-count badges. */
  progress?: { current: number; target: number };
}

export interface LeaderboardPositionWire {
  rank: number;
  of: number;
  next: { username: string; rank: number; xpGap: number } | null;
}

export interface XpPerWinWire {
  human: number;
  expert: number;
  hard: number;
}

/** `GET /players?u=` (today's shape plus §2d). */
export interface PlayerWire {
  user: { username: string; avatarUrl: string | null };
  level: number;
  xp: number;
  xpForNext: number;
  selectedBadges: string[];
  badges: BadgeWire[];
  stats: PlayerStatsWire;
  leaderboard: LeaderboardPositionWire | null;
  xpPerWin: XpPerWinWire;
}

// --- normalised shapes (what the pages read) ---------------------------------

export type KindCounts = Record<OpponentKind, number>;

export interface CommunityWeek extends KindCounts {
  weekStart: string;
}

export interface Crown {
  username: string;
  avatarUrl: string | null;
  wins: number;
  games: number;
}

export interface CommunityHero {
  heroId: string;
  heroName: string | null;
  games: number;
  wins: number;
  draws: number;
  /** `null` = unclaimed (no signed-in winner, or a holder with no username). */
  crown: Crown | null;
}

export interface Matchup {
  heroId: string;
  opponentHeroId: string;
  games: number;
  wins: number;
  draws: number;
}

export interface CommunityTotals extends KindCounts {
  games: number;
  humanVsExpert: { games: number; wins: number } | null;
}

export interface Community {
  window: StatsWindow;
  windowStart: string | null;
  generatedAt: string | null;
  totals: CommunityTotals | null;
  weekly: CommunityWeek[] | null;
  heroes: CommunityHero[] | null;
  matchups: Matchup[] | null;
  playersRanked: number | null;
}

export interface HeroPilot {
  username: string;
  avatarUrl: string | null;
  games: number;
  wins: number;
  draws: number;
}

export interface HeroMatchup {
  opponentHeroId: string;
  opponentHeroName: string | null;
  games: number;
  wins: number;
  draws: number;
}

export interface HeroStats {
  heroId: string;
  heroName: string | null;
  window: StatsWindow;
  windowStart: string | null;
  generatedAt: string | null;
  games: number;
  wins: number;
  draws: number;
  totalHumanSeatGames: number | null;
  pilotCount: number | null;
  pilots: HeroPilot[] | null;
  crown: HeroPilot | null;
  matchups: HeroMatchup[] | null;
  byOpponentKind: KindCounts | null;
}

export interface StatsLeaderboardRow extends LeaderboardRow {
  mainHeroId: string | null;
  mainHeroName: string | null;
  /** Newest first, at most 5. `null` = not sent. */
  recentForm: FormResult[] | null;
  currentStreak: number | null;
  /** `window=month` only; `null` on `window=all` or an older api. */
  monthGames: number | null;
  monthWins: number | null;
}

export interface StatsLeaderboard {
  window: StatsWindow;
  generatedAt: string | null;
  /** Players on the full board before `limit`. `null` = not sent. */
  total: number | null;
  players: StatsLeaderboardRow[];
}

export type CalendarDay = CalendarDayWire;
export type HeroOpponentHero = HeroOpponentHeroWire;
export type LeaderboardPosition = LeaderboardPositionWire;
export type XpPerWin = XpPerWinWire;

export interface BadgeProgress {
  current: number;
  target: number;
}

/** A public profile (lib/account) plus the train's additions, each nullable. */
export interface StatsPlayer extends PublicProfile {
  calendar: CalendarDay[] | null;
  byHeroOpponentHero: HeroOpponentHero[] | null;
  leaderboard: LeaderboardPosition | null;
  xpPerWin: XpPerWin | null;
  /** badge id → progress, for the plain-count badges only (§2e). */
  badgeProgress: Record<string, BadgeProgress> | null;
}

// --- results -----------------------------------------------------------------

/**
 * Why a stats read didn't arrive.
 * - `not_found`    — `/players?u=` names nobody (a calm empty state)
 * - `rate_limited` — 429 on the shared public bucket
 * - `unavailable`  — everything else, INCLUDING a 404 from an api that
 *                    predates the route (today's prod) → a quiet state
 */
export type StatsFailure = "not_found" | "rate_limited" | "unavailable";

export type StatsResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: StatsFailure };
