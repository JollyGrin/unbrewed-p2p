/**
 * Pure derivations for the /leaderboard community dashboard (issue #936,
 * Main.dc.html). Everything the page decides — which window, who stands on
 * the podium, how far each chaser is behind, which heroes and pairs the cards
 * feature — lives here so it is testable without a DOM. The page file only
 * lays these out.
 *
 * Every function takes the normalised shapes from ./types and treats a `null`
 * section as "the api didn't send it": the answer is then `null` too, and the
 * page renders nothing for it.
 */
import { isRosterHero } from "./roster";
import type {
  Community,
  CommunityHero,
  Matchup,
  StatsLeaderboard,
  StatsLeaderboardRow,
  StatsWindow,
} from "./types";

/** Rows asked for: the api's cap (contract §2c). */
export const DASHBOARD_BOARD_LIMIT = 200;
/** Chase-pack rows shown before "Show all". */
export const CHASE_PACK_PREVIEW = 9;
/** Heroes on the "Heroes in play" card. */
export const HERO_TILE_COUNT = 12;
/** Heroes down each side of the match grid. */
export const GRID_HERO_COUNT = 10;
/** The expert-bot line needs at least this many games to say anything. */
export const MIN_HUMAN_VS_EXPERT_GAMES = 10;

/** `?window=all` → all time; anything else (incl. absent) → this month. */
export const parseWindow = (raw: unknown): StatsWindow =>
  (Array.isArray(raw) ? raw[0] : raw) === "all" ? "all" : "month";

/** The query to shallow-route to: month is the default, so it drops the key. */
export const windowQuery = (window: StatsWindow): Record<string, string> =>
  window === "all" ? { window: "all" } : {};

/**
 * The number a row is ranked by in this window: all-time XP, or wins this
 * month on the month board (contract §2c ranks month by `monthWins`).
 */
export const rankValue = (row: StatsLeaderboardRow, window: StatsWindow): number =>
  window === "month" ? row.monthWins ?? 0 : row.xp;

/** Wins shown for a row: this month's on the month board, else all-time. */
export const winsFor = (row: StatsLeaderboardRow, window: StatsWindow): number =>
  window === "month" ? row.monthWins ?? row.wins : row.wins;

export interface ChaseRow {
  row: StatsLeaderboardRow;
  /** The row directly above (by api order); null for the very first row. */
  above: StatsLeaderboardRow | null;
  /** Gap to `above` in this window's unit (XP, or month wins). ≥ 0. */
  gap: number;
  /** How close to catching `above`, 0–1 (1 = level with them). */
  progress: number;
}

/**
 * Every row with its gap to the row above, in the api's order (never
 * re-sorted: the rank printed beside a player is the api's).
 */
export const chaseRows = (
  players: readonly StatsLeaderboardRow[],
  window: StatsWindow,
): ChaseRow[] =>
  players.map((row, i) => {
    const above = i > 0 ? players[i - 1] : null;
    const mine = rankValue(row, window);
    const theirs = above ? rankValue(above, window) : mine;
    return {
      row,
      above,
      gap: Math.max(0, theirs - mine),
      progress: theirs > 0 ? Math.min(1, mine / theirs) : 1,
    };
  });

/** "1,240 behind #5", or "level with #5" on a tie. */
export const gapPhrase = (chase: ChaseRow): string | null => {
  if (!chase.above) return null;
  return chase.gap === 0
    ? `level with #${chase.above.rank}`
    : `${chase.gap.toLocaleString("en-US")} behind #${chase.above.rank}`;
};

/** The meter's caption: "13,480 XP · 640 behind #3" / "44 wins this month · …". */
export const chaseCaption = (chase: ChaseRow, window: StatsWindow): string => {
  const own =
    window === "month"
      ? `${(chase.row.monthWins ?? 0).toLocaleString("en-US")} ${chase.row.monthWins === 1 ? "win" : "wins"} this month`
      : `${chase.row.xp.toLocaleString("en-US")} XP`;
  const gap = gapPhrase(chase);
  return gap ? `${own} · ${gap}` : own;
};

/**
 * Podium in display order. Desktop reads 2 · 1 · 3 (the mockup); a phone
 * stacks 1 · 2 · 3, which the page gets from CSS `order`, so this returns the
 * plain top three plus each one's desktop slot.
 */
export const podium = (
  players: readonly StatsLeaderboardRow[],
): { row: StatsLeaderboardRow; place: 1 | 2 | 3; desktopOrder: number }[] =>
  players.slice(0, 3).map((row, i) => ({
    row,
    place: (i + 1) as 1 | 2 | 3,
    desktopOrder: [2, 1, 3][i],
  }));

/**
 * "Players ranked": the api's `playersRanked`, else the board's `total`, else
 * — for an api that sends neither — the row count, but only when the board
 * came back shorter than asked (so it IS the whole board). Otherwise null.
 */
export const playersRankedValue = (
  community: Community | null,
  board: StatsLeaderboard | null,
  limit: number = DASHBOARD_BOARD_LIMIT,
): number | null => {
  if (community?.playersRanked != null) return community.playersRanked;
  if (!board) return null;
  if (board.total !== null) return board.total;
  return board.players.length < limit ? board.players.length : null;
};

/** Distinct PUBLIC-roster heroes with games in the window (hidden ids don't count). */
export const heroesInPlayCount = (heroes: readonly CommunityHero[] | null): number | null =>
  heroes ? heroes.filter((h) => isRosterHero(h.heroId)).length : null;

/** Most-played heroes, games desc then id (the api's order, re-asserted). */
export const topHeroes = (
  heroes: readonly CommunityHero[] | null,
  count: number,
): CommunityHero[] =>
  heroes
    ? [...heroes]
        .filter((h) => h.games > 0)
        .sort((a, b) => b.games - a.games || a.heroId.localeCompare(b.heroId))
        .slice(0, count)
    : [];

/** Whole-percent win rate; 0 with no games. */
export const winPercent = (wins: number, games: number): number =>
  games > 0 ? Math.round((wins / games) * 100) : 0;

/**
 * "Humans beat the expert bot in 70% of games this month." — or null when the
 * api didn't send the split or there are too few games to say it honestly.
 */
export const humanVsExpertLine = (
  community: Community | null,
  window: StatsWindow,
): string | null => {
  const split = community?.totals?.humanVsExpert;
  if (!split || split.games < MIN_HUMAN_VS_EXPERT_GAMES) return null;
  const when = window === "month" ? "this month" : "all time";
  return `Humans beat the expert bot in ${winPercent(split.wins, split.games)}% of games ${when}.`;
};

export interface PairPick {
  a: CommunityHero;
  b: CommunityHero;
  games: number;
  /** `a`'s wins over `b`, and `b`'s over `a`. */
  winsA: number;
  winsB: number;
  draws: number;
}

const pairKey = (a: string, b: string) => `${a}|${b}`;

const matchupMap = (matchups: readonly Matchup[]) => {
  const map = new Map<string, Matchup>();
  for (const m of matchups) map.set(pairKey(m.heroId, m.opponentHeroId), m);
  return map;
};

/** Each unordered pair of `heroes` once, in grid reading order (row-major, i < j). */
const pairs = (heroes: readonly CommunityHero[]) => {
  const out: [CommunityHero, CommunityHero][] = [];
  for (let i = 0; i < heroes.length; i++)
    for (let j = i + 1; j < heroes.length; j++) out.push([heroes[i], heroes[j]]);
  return out;
};

/** The pair among `heroes` that has met most often; null when none has met. */
export const mostPlayedPair = (
  heroes: readonly CommunityHero[],
  matchups: readonly Matchup[],
): PairPick | null => {
  const map = matchupMap(matchups);
  let best: PairPick | null = null;
  for (const [a, b] of pairs(heroes)) {
    const ab = map.get(pairKey(a.heroId, b.heroId));
    const ba = map.get(pairKey(b.heroId, a.heroId));
    const games = ab?.games ?? ba?.games ?? 0;
    if (games === 0 || (best && games <= best.games)) continue;
    // Either orientation alone is enough: A|B.wins is A's wins, B|A.wins B's.
    const winsA = ab?.wins ?? (ba ? games - ba.wins - ba.draws : 0);
    const winsB = ba?.wins ?? (ab ? games - ab.wins - ab.draws : 0);
    best = { a, b, games, winsA, winsB, draws: ab?.draws ?? ba?.draws ?? 0 };
  }
  return best;
};

/** "64 games, split 33 to 31" (+ ", 2 drawn"). */
export const pairSplitPhrase = (pick: PairPick): string =>
  `${pick.games.toLocaleString("en-US")} ${pick.games === 1 ? "game" : "games"}, split ${pick.winsA} to ${pick.winsB}` +
  (pick.draws > 0 ? `, ${pick.draws} drawn` : "");

/** The first pair among `heroes` (grid reading order) that has never met. */
export const neverPlayedPair = (
  heroes: readonly CommunityHero[],
  matchups: readonly Matchup[],
): [CommunityHero, CommunityHero] | null => {
  const map = matchupMap(matchups);
  for (const [a, b] of pairs(heroes)) {
    const games =
      map.get(pairKey(a.heroId, b.heroId))?.games ?? map.get(pairKey(b.heroId, a.heroId))?.games ?? 0;
    if (games === 0) return [a, b];
  }
  return null;
};

/** `/heroes?h=` — the hero page (issue #938). */
export const heroHref = (heroId: string): string => `/heroes?h=${encodeURIComponent(heroId)}`;
