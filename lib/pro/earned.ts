/**
 * "What you earned" — the pure half (p2p #1399, feature/end-screen part 3).
 *
 * The one engineering fact that shapes all of this: NOTHING is granted at game
 * end. XP, cosmetic points and badges are pure functions of telemetry history,
 * computed by the accounts api (`/me/stats`, `/me/cosmetics`, `/me/badges`).
 * The engine submits telemetry when the game ends and the api reads it live,
 * behind a ~60 s cache on `/me/stats`. So everything on the card is a
 * CLIENT-SIDE DELTA: a snapshot of what the page already held before the game
 * ended, against a refetch that has visibly caught up (the game has "landed"
 * when `totalGames` ticks past the snapshot's). No number on the card is ever
 * guessed or computed locally from a formula — until the refetch lands, the
 * card says it is counting, and if the poll gives up it says the profile will
 * catch up. Both of those are calm states, not errors.
 *
 * This module is the arithmetic and the classification; the poll lives in
 * `useGameEarned`, the paint in `ProPostGameEarned`.
 */
import type { AccountStats } from "@/lib/account/stats";
import { CASUAL_TIERS, levelProgress } from "@/lib/account/stats";
import type { Badge } from "@/lib/account/badges";
import type { HeroCosmetics } from "@/lib/account/cosmetics";
import { rimProgress } from "@/lib/account/cosmetics";

import type { GameEndReason, GameResult } from "./postGame";
import type { RoomBots } from "./rematch";
import type { PlayerView } from "./protocol";

// --- the snapshot ------------------------------------------------------------

/** The slice of `/me/stats` the card compares. Null fields = the api didn't send progression. */
export interface EarnedStats {
  totalGames: number;
  level: number | null;
  xp: number | null;
  xpForNext: number | null;
  /** `streaks.current`; null when the api didn't send the section. */
  streak: number | null;
  /** `streaks.best`, for the streak tile's caption. */
  streakBest: number | null;
}

/** What the page held the moment the game ended — the baseline every delta is against. */
export interface EarnedSnapshot {
  stats: EarnedStats;
  /** The hero you played, for the points tile and the cosmetics refetch. */
  heroId: string;
  /** `HeroCosmetics.earned` for that hero; null while the api couldn't say. */
  heroPoints: number | null;
  /** Ids of the badges already unlocked. */
  unlocked: string[];
}

export const earnedStatsOf = (stats: AccountStats): EarnedStats => ({
  totalGames: stats.totalGames,
  level: stats.level,
  xp: stats.xp,
  xpForNext: stats.xpForNext,
  streak: stats.streaks?.current ?? null,
  streakBest: stats.streaks?.best ?? null,
});

export const unlockedBadgeIds = (badges: readonly Badge[]): string[] =>
  badges.filter((b) => b.unlocked).map((b) => b.id);

/**
 * The pre-game baseline, or null when there is nothing to compare against —
 * the stats never arrived (api offline, 503, still loading when the game
 * ended). Without `totalGames` there is no way to tell a landed refetch from
 * a cached one, so the card degrades to a one-line "your profile will catch
 * up" rather than polling for a change it could never recognise.
 */
export const takeEarnedSnapshot = (
  stats: AccountStats | null,
  heroId: string | null,
  hero: HeroCosmetics | null,
  badges: readonly Badge[],
): EarnedSnapshot | null => {
  if (!stats || !heroId) return null;
  return {
    stats: earnedStatsOf(stats),
    heroId,
    heroPoints: hero?.earned ?? null,
    unlocked: unlockedBadgeIds(badges),
  };
};

// --- landing -----------------------------------------------------------------

/**
 * The refetch reflects this game once the api has counted one more game than
 * the snapshot did. Strictly more: the ~60 s cache hands back the pre-game
 * aggregate verbatim for a while, and that must read as "not yet".
 */
export const gameHasLanded = (before: Pick<EarnedStats, "totalGames">, after: Pick<EarnedStats, "totalGames">): boolean =>
  after.totalGames > before.totalGames;

// --- the delta ---------------------------------------------------------------

export interface EarnedDelta {
  /** XP gained; null when either side lacks the progression block. */
  xp: number | null;
  /** The level after the game, and whether it moved. */
  level: number | null;
  levelUp: boolean;
  /** Cosmetic points gained on the hero; null when either side was unknown. */
  points: number | null;
  /** The hero's earned total after the game, for "· 260, rim at 300". */
  heroPoints: number | null;
  /** Streak before → after; null when the api never sent streaks. */
  streak: { from: number; to: number } | null;
  /** Badge ids unlocked by this game: in `after`, not in `before`. */
  newBadges: string[];
}

const diffOrNull = (after: number | null, before: number | null): number | null =>
  after === null || before === null ? null : Math.max(0, after - before);

export const earnedDelta = (
  before: EarnedSnapshot,
  after: { stats: EarnedStats; heroPoints: number | null; unlocked: readonly string[] },
): EarnedDelta => {
  const wasUnlocked = new Set(before.unlocked);
  return {
    xp: diffOrNull(after.stats.xp, before.stats.xp),
    level: after.stats.level,
    levelUp: after.stats.level !== null && before.stats.level !== null && after.stats.level > before.stats.level,
    points: diffOrNull(after.heroPoints, before.heroPoints),
    heroPoints: after.heroPoints,
    streak:
      before.stats.streak !== null && after.stats.streak !== null
        ? { from: before.stats.streak, to: after.stats.streak }
        : null,
    newBadges: after.unlocked.filter((id) => !wasUnlocked.has(id)),
  };
};

// --- the level bar -----------------------------------------------------------

/**
 * The three widths the bar is drawn from, as whole percents of the track.
 *
 * - `base`: the pre-game fill — stays put while counting, and is the bar
 *   that "wraps" on a level-up (the new level's bar starts from 0).
 * - `delta`: the gold segment, this game's XP once it is real; 0 before.
 * - `placeholder`: the hatched segment drawn while counting, a fixed sliver
 *   capped at whatever room the track has left — a SHAPE, never a number.
 *
 * `null` when the api sent no progression block at all: the whole bar hides,
 * the same contract the /account level bar keeps.
 */
export interface LevelBar {
  level: number;
  /** Lifetime XP shown in "x / y to level L+1". */
  xp: number;
  next: number;
  base: number;
  delta: number;
  placeholder: number;
}

/** Width of the hatched sliver while the game is still counting. */
export const PLACEHOLDER_PERCENT = 6;

const progressOf = (stats: EarnedStats) =>
  levelProgress({ level: stats.level, xp: stats.xp, xpForNext: stats.xpForNext } as AccountStats);

/** The bar before the game landed: pre-game fill plus the hatched placeholder. */
export const waitingLevelBar = (before: EarnedStats): LevelBar | null => {
  const p = progressOf(before);
  if (!p) return null;
  return {
    level: p.level,
    xp: p.xp,
    next: p.next,
    base: p.percent,
    delta: 0,
    placeholder: Math.min(PLACEHOLDER_PERCENT, 100 - p.percent),
  };
};

/**
 * The bar once the game landed. Same level: the gold segment runs from the
 * old fill to the new. New level: the bar wraps — the title reads the new
 * level and the gold segment is everything from 0 to the new fill, which is
 * what "the bar moved" looks like after crossing the line.
 */
export const landedLevelBar = (before: EarnedStats, after: EarnedStats): LevelBar | null => {
  const now = progressOf(after);
  if (!now) return null;
  const then = progressOf(before);
  const sameLevel = !!then && then.level === now.level;
  const base = sameLevel ? Math.min(then.percent, now.percent) : 0;
  return {
    level: now.level,
    xp: now.xp,
    next: now.next,
    base,
    delta: Math.max(0, now.percent - base),
    placeholder: 0,
  };
};

// --- classification ----------------------------------------------------------

/**
 * Which card this game gets:
 *
 * - `casual`: every opponent was an easy/medium bot — practice, no XP, no
 *   points, not in your record (#592). The card says so instead of counting.
 * - `counted`: everything else. `forfeit` is set when YOU gave the game up:
 *   XP still lands, cosmetic points don't (#636), and the points tile says so.
 */
export type EarnedKind = { kind: "casual" } | { kind: "counted"; forfeit: boolean };

export const earnedKindOf = (
  view: Pick<PlayerView, "players" | "you">,
  bots: RoomBots | null,
  result: GameResult,
  endReason: GameEndReason | null,
  iForfeited: boolean,
): EarnedKind => {
  const opponents = view.players.filter((p) => p.id !== view.you);
  const casual = opponents.length > 0 && opponents.every((p) => {
    const tier = bots?.[p.id];
    return !!tier && CASUAL_TIERS.has(tier);
  });
  if (casual) return { kind: "casual" };
  // In a duel the only FORFEIT that ends the game with you losing is yours;
  // `iForfeited` is the page's own memory of the confirm, which also covers
  // the team/ffa case where the reason alone can't say whose seat it was.
  const forfeit = iForfeited || (opponents.length === 1 && endReason === "FORFEIT" && result === "defeat");
  return { kind: "counted", forfeit };
};

// --- copy --------------------------------------------------------------------

export const EARNED_WAITING_CAPTION = "stats land once the game is recorded, usually under a minute";
export const EARNED_TIMEOUT_CAPTION = "Still recording — your profile will catch up";
export const EARNED_NO_BASELINE_LINE = "Your profile catches up once this game is recorded.";

/** "+40 pts · Hollow Oak cosmetics · 260, rim at 300" — the points tile's caption. */
export const pointsCaption = (heroName: string, heroPoints: number | null, thresholds: number[]): string => {
  if (heroPoints === null) return `${heroName} cosmetics`;
  const rim = rimProgress(heroPoints, thresholds);
  const total = heroPoints.toLocaleString();
  return rim.nextThreshold === null
    ? `${heroName} cosmetics · ${total}, every rim earned`
    : `${heroName} cosmetics · ${total}, rim at ${rim.nextThreshold.toLocaleString()}`;
};

/** "Streak 3 → 4" / "Streak ends" (dropped to 0) / "Streak 4" (unchanged). */
export const streakLabel = (streak: { from: number; to: number }): string => {
  if (streak.to === 0 && streak.from > 0) return "Streak ends";
  if (streak.to === streak.from) return `Streak ${streak.to}`;
  return `Streak ${streak.from} → ${streak.to}`;
};

/** "1,280 / 1,400 to level 8" */
export const xpLine = (bar: Pick<LevelBar, "xp" | "next" | "level">): string =>
  `${bar.xp.toLocaleString()} / ${bar.next.toLocaleString()} to level ${bar.level + 1}`;
