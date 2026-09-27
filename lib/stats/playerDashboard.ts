/**
 * Pure derivations for the `/stats?u=` player dashboard (issue #937,
 * Player.dc.html). Everything the page shows that is more than a field read
 * lives here, so each rule is testable without a DOM: the "Next up" gap, the
 * 26-week calendar, the roster fill, the match grid's axes and nemesis, the
 * opposition bars and the badge chase.
 *
 * The record semantics are NOT re-derived: every headline number goes through
 * lib/account/stats (`headlineRecord`, `headlineWinRate`, `countedRecord`, …),
 * so this page and `/account` can never disagree about what counts.
 *
 * Every function returns `null` (or an empty list) when its input section is
 * absent, which is how a section hides against today's prod api.
 */
import type { Badge } from "@/lib/account/badges";
import {
  AccountStats,
  headlineRecord,
  headlineWinRate,
  isCasualBot,
  MIN_WIN_RATE_GAMES,
  StatSplit,
  formatClock,
  monthLabel,
  splitDraws,
  winPercent,
} from "@/lib/account/stats";

import { heroDisplayName, PUBLIC_ROSTER } from "./roster";
import type {
  BadgeProgress,
  CalendarDay,
  HeroOpponentHero,
  LeaderboardPosition,
  OpponentKind,
  XpPerWin,
} from "./types";

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

// --- header: Next up ---------------------------------------------------------

export interface NextUp {
  headline: string;
  /** The "that is N wins" line; null at #1 or without `xpPerWin`. */
  detail: string | null;
}

/**
 * The "Next up" card from `leaderboard.next` (contract §2d). Neutral copy — it
 * reads the same whether or not the viewer is this player. `null` hides the
 * card (no `leaderboard` block: an older api, or a player off the board).
 */
export const nextUpCopy = (
  position: LeaderboardPosition | null,
  xpPerWin: XpPerWin | null,
): NextUp | null => {
  if (!position) return null;
  const next = position.next;
  if (!next) return { headline: "Top of the leaderboard.", detail: null };
  const target = next.rank <= 3 ? "for the podium" : `for #${next.rank}`;
  const headline = `${next.xpGap} XP behind ${next.username} ${target}`;
  if (!xpPerWin || xpPerWin.human <= 0 || xpPerWin.expert <= 0) return { headline, detail: null };
  const human = Math.ceil(next.xpGap / xpPerWin.human);
  const expert = Math.ceil(next.xpGap / xpPerWin.expert);
  return {
    headline,
    detail: `That is ${plural(human, "win", "wins")} against humans, or ${expert} against the expert bot.`,
  };
};

// --- the six tiles -----------------------------------------------------------

export interface TileValue {
  key: string;
  label: string;
  value: string;
  sub: string | null;
}

/** "Jul '26" — `monthLabel` squeezed for a 52px League Gothic tile. */
export const shortMonth = (iso: string | null): string | null => {
  const label = monthLabel(iso);
  return label ? label.replace(/ \d\d(\d\d)$/, " '$1") : null;
};

/**
 * Games, Win rate, Record, Win streak, Game length, Playing since — today's
 * semantics (components/Account/AccountStats `Tiles`), each dropped when its
 * field is absent. The record and win rate are the COUNTED games.
 */
export const playerTiles = (stats: AccountStats, now = Date.now()): TileValue[] => {
  const tiles: TileValue[] = [];
  const record = headlineRecord(stats);
  const last = monthLabel(stats.lastGameAt);
  tiles.push({
    key: "games",
    label: "Games",
    value: String(stats.totalGames),
    sub: last ? `last played ${last}` : null,
  });
  tiles.push({
    key: "winRate",
    label: "Win rate",
    value: headlineWinRate(stats),
    sub:
      record.games < MIN_WIN_RATE_GAMES
        ? `after ${MIN_WIN_RATE_GAMES} games`
        : plural(record.wins, "win", "wins"),
  });
  tiles.push({
    key: "record",
    label: "Record",
    value:
      record.draws > 0
        ? `${record.wins}–${record.losses}–${record.draws}`
        : `${record.wins}–${record.losses}`,
    sub: record.draws > 0 ? "win–loss–draw" : "no draws",
  });
  if (stats.streaks) {
    tiles.push({
      key: "streak",
      label: "Win streak",
      value: String(stats.streaks.current),
      sub: `best ${stats.streaks.best}`,
    });
  }
  const clock = formatClock(stats.avgDurationSeconds);
  if (clock) {
    tiles.push({
      key: "length",
      label: "Game length",
      value: clock,
      sub: stats.avgTurns !== null ? `${Math.round(stats.avgTurns)} turns on average` : null,
    });
  }
  const since = shortMonth(stats.firstGameAt);
  if (since && stats.firstGameAt) {
    const weeks = Math.max(1, Math.floor((now - Date.parse(stats.firstGameAt)) / (7 * DAY_MS)));
    tiles.push({
      key: "since",
      label: "Playing since",
      value: since,
      sub: `${plural(weeks, "week", "weeks")} at the table`,
    });
  }
  return tiles;
};

// --- Table time --------------------------------------------------------------

export const CALENDAR_WEEKS = 26;

/** Cell colour: the mockup's alpha scale of the site purple. */
export const calendarColor = (games: number): string =>
  games <= 0 ? "rgba(72,40,79,0.07)" : `rgba(72,40,79,${Math.min(0.9, 0.2 + games * 0.07).toFixed(2)})`;

export interface CalendarCell {
  date: string;
  games: number;
  /** A day after today in the current week: drawn blank. */
  future: boolean;
  bg: string;
  tip: string;
}

const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** "Aug 22" in UTC. */
export const dayLabel = (iso: string): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
};

/**
 * 26 week columns × 7 day rows, Monday first, UTC. The last column is the
 * current week, so the grid always ends on today; its later days are `future`.
 */
export const calendarWeeks = (calendar: readonly CalendarDay[], now = Date.now()): CalendarCell[][] => {
  const counts = new Map<string, number>();
  for (const day of calendar) counts.set(day.date, (counts.get(day.date) ?? 0) + day.games);
  const today = Date.parse(isoDay(now));
  const mondayOffset = (new Date(today).getUTCDay() + 6) % 7;
  const start = today - (mondayOffset + (CALENDAR_WEEKS - 1) * 7) * DAY_MS;
  const weeks: CalendarCell[][] = [];
  for (let w = 0; w < CALENDAR_WEEKS; w++) {
    const days: CalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const at = start + (w * 7 + d) * DAY_MS;
      const date = isoDay(at);
      const games = counts.get(date) ?? 0;
      const future = at > today;
      days.push({
        date,
        games,
        future,
        bg: future ? "transparent" : calendarColor(games),
        tip: future ? "" : `${dayLabel(date)}: ${plural(games, "game", "games")}`,
      });
    }
    weeks.push(days);
  }
  return weeks;
};

export interface CalendarSummary {
  busiest: { date: string; games: number } | null;
  /** Longest run of consecutive days with at least one game. */
  longestRun: number;
}

/** Busiest day (latest wins a tie) and the longest daily run, from the api's days. */
export const calendarSummary = (calendar: readonly CalendarDay[]): CalendarSummary => {
  const days = [...calendar].filter((d) => d.games > 0).sort((a, b) => a.date.localeCompare(b.date));
  let busiest: CalendarSummary["busiest"] = null;
  let longestRun = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of days) {
    if (!busiest || day.games >= busiest.games) busiest = { date: day.date, games: day.games };
    const at = Date.parse(`${day.date}T00:00:00Z`);
    run = prev !== null && at - prev === DAY_MS ? run + 1 : at === prev ? run : 1;
    prev = at;
    longestRun = Math.max(longestRun, run);
  }
  return { busiest, longestRun };
};

/** "Busiest day: 14 games on Aug 22 · Longest run: 9 days in a row" */
export const calendarFooter = (summary: CalendarSummary): string | null => {
  if (!summary.busiest) return null;
  const busiest = `Busiest day: ${plural(summary.busiest.games, "game", "games")} on ${dayLabel(summary.busiest.date)}`;
  const run =
    summary.longestRun > 1
      ? `Longest run: ${summary.longestRun} days in a row`
      : "Longest run: 1 day";
  return `${busiest} · ${run}`;
};

// --- Roster ------------------------------------------------------------------

export interface RosterEntry {
  heroId: string;
  name: string;
  games: number;
}

/** Games per hero id, summed (a payload may repeat an id). */
const gamesByHero = (stats: AccountStats): Map<string, { games: number; wins: number; name: string | null }> => {
  const out = new Map<string, { games: number; wins: number; name: string | null }>();
  for (const row of stats.byHero) {
    if (!row.heroId) continue;
    const prev = out.get(row.heroId);
    out.set(row.heroId, {
      games: (prev?.games ?? 0) + row.games,
      wins: (prev?.wins ?? 0) + row.wins,
      name: prev?.name ?? row.heroName,
    });
  }
  return out;
};

/**
 * Every public roster hero: played first (games desc, then roster order), then
 * the unplayed in roster order. Only public roster ids count towards "N of 33".
 */
export const rosterEntries = (stats: AccountStats): { entries: RosterEntry[]; played: number } => {
  const byHero = gamesByHero(stats);
  const entries = PUBLIC_ROSTER.map((hero, i) => ({
    heroId: hero.heroId,
    name: hero.name,
    games: byHero.get(hero.heroId)?.games ?? 0,
    i,
  }))
    .sort((a, b) => {
      if ((a.games > 0) !== (b.games > 0)) return a.games > 0 ? -1 : 1;
      return b.games - a.games || a.i - b.i;
    })
    .map(({ heroId, name, games }) => ({ heroId, name, games }));
  return { entries, played: entries.filter((e) => e.games > 0).length };
};

/**
 * "4 to Generalist badge" — from the badge's own §2e progress. `null` when the
 * badge is unlocked, absent, or carries no progress (today's prod).
 */
export const generalistToGo = (
  badges: readonly Badge[],
  progress: Record<string, BadgeProgress> | null,
): string | null => {
  const badge = badges.find((b) => b.id === "generalist");
  const p = progress?.generalist;
  if (!badge || badge.unlocked || !p) return null;
  const left = p.target - p.current;
  return left > 0 ? `${left} to ${badge.name} badge` : null;
};

export interface MainHero {
  heroId: string;
  heroName: string | null;
  games: number;
  wins: number;
  /** Whole percent; null with no games. */
  winPercent: number | null;
}

/** Most games in `byHero`; ties → most wins, then heroId asc (the api's rule). */
export const mainHero = (stats: AccountStats): MainHero | null => {
  let best: MainHero | null = null;
  gamesByHero(stats).forEach((row, heroId) => {
    if (row.games <= 0) return;
    const better =
      !best ||
      row.games > best.games ||
      (row.games === best.games && (row.wins > best.wins || (row.wins === best.wins && heroId < best.heroId)));
    if (better) {
      best = {
        heroId,
        heroName: row.name,
        games: row.games,
        wins: row.wins,
        winPercent: winPercent({ games: row.games, wins: row.wins }),
      };
    }
  });
  return best;
};

// --- Match grid --------------------------------------------------------------

export const GRID_ROWS = 5;
export const GRID_COLS = 8;
export const NEMESIS_MIN_GAMES = 5;

interface AxisHero {
  heroId: string;
  heroName: string | null;
}

const topBy = (
  rows: readonly HeroOpponentHero[],
  pick: (r: HeroOpponentHero) => { id: string | null; name: string | null },
  limit: number,
): AxisHero[] => {
  const totals = new Map<string, { games: number; name: string | null }>();
  for (const r of rows) {
    const { id, name } = pick(r);
    if (!id) continue;
    const prev = totals.get(id);
    totals.set(id, { games: (prev?.games ?? 0) + r.games, name: prev?.name ?? name });
  }
  return [...totals.entries()]
    .filter(([, v]) => v.games > 0)
    .sort((a, b) => b[1].games - a[1].games || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([heroId, v]) => ({ heroId, heroName: v.name }));
};

/** Rows = the player's top 5 heroes, cols = the top 8 opposing heroes, by games. */
export const matchGridAxes = (
  cells: readonly HeroOpponentHero[],
): { rows: AxisHero[]; cols: AxisHero[] } => ({
  rows: topBy(cells, (r) => ({ id: r.heroId, name: r.heroName }), GRID_ROWS),
  cols: topBy(cells, (r) => ({ id: r.opponentHeroId, name: r.opponentHeroName }), GRID_COLS),
});

export interface Nemesis {
  heroId: string;
  opponentHeroId: string;
  opponentName: string;
  wins: number;
  losses: number;
  games: number;
  line: string;
}

/**
 * The worst matchup: among (own hero, opposing hero) cells with ≥ 5 games and
 * a win rate below 50%, the lowest win rate; ties → more games, then ids asc.
 * Mirror cells never count. `null` when nothing qualifies.
 */
export const nemesis = (cells: readonly HeroOpponentHero[]): Nemesis | null => {
  const merged = new Map<string, HeroOpponentHero>();
  for (const c of cells) {
    if (!c.heroId || !c.opponentHeroId || c.heroId === c.opponentHeroId) continue;
    const key = `${c.heroId}|${c.opponentHeroId}`;
    const prev = merged.get(key);
    merged.set(
      key,
      prev ? { ...prev, games: prev.games + c.games, wins: prev.wins + c.wins, draws: prev.draws + c.draws } : { ...c },
    );
  }
  let worst: HeroOpponentHero | null = null;
  const rate = (c: HeroOpponentHero) => c.wins / c.games;
  merged.forEach((c) => {
    if (c.games < NEMESIS_MIN_GAMES || rate(c) >= 0.5) return;
    if (
      !worst ||
      rate(c) < rate(worst) ||
      (rate(c) === rate(worst) &&
        (c.games > worst.games ||
          (c.games === worst.games &&
            `${c.opponentHeroId}|${c.heroId}` < `${worst.opponentHeroId}|${worst.heroId}`)))
    ) {
      worst = c;
    }
  });
  if (!worst) return null;
  const w: HeroOpponentHero = worst;
  const opp = heroDisplayName(w.opponentHeroId, w.opponentHeroName);
  const own = heroDisplayName(w.heroId, w.heroName);
  const losses = Math.max(0, w.games - w.wins - w.draws);
  return {
    heroId: w.heroId as string,
    opponentHeroId: w.opponentHeroId as string,
    opponentName: opp,
    wins: w.wins,
    losses,
    games: w.games,
    line: `${w.wins} and ${losses} against ${opp} with ${own}.`,
  };
};

// --- Who you play ------------------------------------------------------------

export interface OpponentBar {
  key: "human" | "expert" | "hard" | "casual";
  label: string;
  kind: OpponentKind;
  games: number;
  /** "58%" for counted rows; the win count for casual ("3 wins"). */
  detail: string;
  /** Share of all games, 0–1 (the bar's width). */
  share: number;
}

const sumSplits = (splits: readonly StatSplit[]): StatSplit =>
  splits.reduce<StatSplit>(
    (acc, s) => ({ games: acc.games + s.games, wins: acc.wins + s.wins, draws: splitDraws(acc) + splitDraws(s) }),
    { games: 0, wins: 0, draws: 0 },
  );

/**
 * Humans, Expert bot, Hard bot (with `unknown` folded in — the api prices an
 * unknown tier as hard), Casual bots. Rows with no games are dropped; `null`
 * when `byOpponentKind` is absent or empty.
 */
export const opponentBars = (stats: AccountStats): OpponentBar[] | null => {
  const kind = stats.byOpponentKind;
  if (!kind) return null;
  const expert = sumSplits(kind.bots.filter((b) => b.difficulty === "expert"));
  const hard = sumSplits(kind.bots.filter((b) => !isCasualBot(b) && b.difficulty !== "expert"));
  const casual = sumSplits(kind.bots.filter(isCasualBot));
  const human = kind.human ?? { games: 0, wins: 0 };
  const total = human.games + expert.games + hard.games + casual.games;
  if (total <= 0) return null;
  const pct = (s: StatSplit) => `${winPercent(s) ?? 0}% wins`;
  const bars: OpponentBar[] = [
    { key: "human", label: "Humans", kind: "human", games: human.games, detail: pct(human), share: human.games / total },
    { key: "expert", label: "Expert bot", kind: "hardExpert", games: expert.games, detail: pct(expert), share: expert.games / total },
    { key: "hard", label: "Hard bot", kind: "hardExpert", games: hard.games, detail: pct(hard), share: hard.games / total },
    {
      key: "casual",
      label: "Casual bots · no XP",
      kind: "casual",
      games: casual.games,
      detail: plural(casual.wins, "win", "wins"),
      share: casual.games / total,
    },
  ];
  return bars.filter((b) => b.games > 0);
};

// --- Badge case --------------------------------------------------------------

export interface BadgeChase {
  id: string;
  name: string;
  blurb: string;
  current: number;
  target: number;
  fraction: number;
}

/** Up to 3 locked badges that carry progress, closest to done first. */
export const badgeChase = (
  badges: readonly Badge[],
  progress: Record<string, BadgeProgress> | null,
  limit = 3,
): BadgeChase[] => {
  if (!progress) return [];
  return badges
    .filter((b) => !b.unlocked && progress[b.id] && progress[b.id].target > 0)
    .map((b) => {
      const p = progress[b.id];
      return { id: b.id, name: b.name, blurb: b.blurb, current: p.current, target: p.target, fraction: p.current / p.target };
    })
    .sort((a, b) => b.fraction - a.fraction || a.id.localeCompare(b.id))
    .slice(0, limit);
};

// --- Games list ----------------------------------------------------------------

/**
 * Rows shown before "Older games" reveals more (issue #944): with the full
 * page size (20) the Games column ran ~3x taller than the Badge case beside
 * it.
 */
export const GAMES_INITIAL_SHOWN = 8;

/**
 * What "Older games" reveals next: if the already-loaded page has rows past
 * `shown`, reveal the rest of that page (no fetch); once `shown` has caught up
 * to every loaded row, there is nothing left to reveal locally and the caller
 * should fetch the next page instead.
 */
export const revealMoreGames = (shown: number, loadedCount: number): number =>
  Math.max(shown, loadedCount);
