/**
 * Pure cell rules for the hero-vs-hero MatchGrid (components/Stats/MatchGrid).
 * Kept apart from the component so every colour decision is testable without a
 * DOM. The rules are the mockups' (Main.dc.html / Player.dc.html) and the
 * telemetry dashboard's:
 *
 * - the diagonal (a hero against itself) is blank;
 * - `games` mode: alpha `0.08 + 0.82 · g/max` of the site purple, `·` for 0;
 * - `winRate` mode: needs ≥ 3 games, else `·`; green when the row hero wins at
 *   least half, red below, alpha `clamp(|wr − 0.5| · k, 0.1, 0.75)`;
 * - every cell carries a number (or `·`) and a tooltip — never colour alone.
 */
import type { HeroOpponentHero, Matchup } from "./types";

export type MatchGridMode = "games" | "winRate";

export interface MatchCounts {
  games: number;
  wins: number;
  draws: number;
}

/** Win-rate cells below this many games show `·`. */
export const MIN_WIN_RATE_CELL_GAMES = 3;

/** Colour gain `k`: the community grid is dense, the player grid sparse. */
export const COMMUNITY_GRID_GAIN = 4.4;
export const PLAYER_GRID_GAIN = 2.2;

const INK_DARK = "#48284F";
const INK_LIGHT = "#FAEBD7";
const INK_ON_RATE = "#2C1831";
const EMPTY_BG = "rgba(72,40,79,0.04)";

export type MatchCellKind = "diagonal" | "empty" | "thin" | "value";

export interface MatchCell {
  kind: MatchCellKind;
  /** Main number: games, a percentage, `·`, or "" on the diagonal. */
  label: string;
  /** Second line ("3 of 11") when asked for; "" otherwise. */
  sub: string;
  bg: string;
  ink: string;
  /** Tooltip; "" only on the diagonal. */
  tip: string;
}

export interface MatchCellInput {
  rowHeroId: string;
  colHeroId: string;
  rowName: string;
  colName: string;
  counts: MatchCounts | null;
  mode: MatchGridMode;
  /** Largest `games` among the grid's cells (games mode's scale). */
  maxGames: number;
  /** Win-rate colour gain. */
  gain?: number;
  /** Player grid: add the "w of g" sub-label. */
  withSub?: boolean;
}

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export const matchCell = ({
  rowHeroId,
  colHeroId,
  rowName,
  colName,
  counts,
  mode,
  maxGames,
  gain = COMMUNITY_GRID_GAIN,
  withSub = false,
}: MatchCellInput): MatchCell => {
  if (rowHeroId === colHeroId) {
    return { kind: "diagonal", label: "", sub: "", bg: "transparent", ink: INK_DARK, tip: "" };
  }
  const games = counts?.games ?? 0;
  const wins = Math.min(counts?.wins ?? 0, games);
  const vs = `${rowName} vs ${colName}`;
  const sub = withSub && games > 0 ? `${wins} of ${games}` : "";

  if (games === 0) {
    return { kind: "empty", label: "·", sub: "", bg: EMPTY_BG, ink: INK_DARK, tip: `${vs}: not played yet` };
  }

  if (mode === "games") {
    const alpha = 0.08 + 0.82 * (games / Math.max(1, maxGames, games));
    return {
      kind: "value",
      label: String(games),
      sub,
      bg: `rgba(72,40,79,${alpha.toFixed(2)})`,
      ink: alpha > 0.45 ? INK_LIGHT : INK_DARK,
      tip: `${vs}: ${games} ${games === 1 ? "game" : "games"}`,
    };
  }

  if (games < MIN_WIN_RATE_CELL_GAMES) {
    return {
      kind: "thin",
      label: "·",
      sub,
      bg: EMPTY_BG,
      ink: INK_DARK,
      tip: `${vs}: ${wins} of ${games}, fewer than ${MIN_WIN_RATE_CELL_GAMES} games`,
    };
  }

  const rate = wins / games;
  const delta = rate - 0.5;
  const alpha = clamp(Math.abs(delta) * gain, 0.1, 0.75);
  const percent = Math.round(rate * 100);
  return {
    kind: "value",
    label: `${percent}%`,
    sub,
    bg: `${delta >= 0 ? "rgba(47,158,104," : "rgba(255,99,71,"}${alpha.toFixed(2)})`,
    ink: INK_ON_RATE,
    tip: `${rowName} wins ${percent}% vs ${colName} (${wins} of ${games})`,
  };
};

/** `heroId|opponentHeroId` → counts, from the community matchups. */
export const matchupLookup = (
  matchups: readonly Matchup[],
): ((row: string, col: string) => MatchCounts | null) => {
  const map = new Map<string, MatchCounts>();
  for (const m of matchups) map.set(`${m.heroId}|${m.opponentHeroId}`, m);
  return (row, col) => map.get(`${row}|${col}`) ?? null;
};

/** Same, from a player's `byHeroOpponentHero` (null hero ids skipped). */
export const playerMatchupLookup = (
  rows: readonly HeroOpponentHero[],
): ((row: string, col: string) => MatchCounts | null) => {
  const map = new Map<string, MatchCounts>();
  for (const r of rows) {
    if (!r.heroId || !r.opponentHeroId) continue;
    const key = `${r.heroId}|${r.opponentHeroId}`;
    const prev = map.get(key);
    map.set(
      key,
      prev
        ? { games: prev.games + r.games, wins: prev.wins + r.wins, draws: prev.draws + r.draws }
        : { games: r.games, wins: r.wins, draws: r.draws },
    );
  }
  return (row, col) => map.get(`${row}|${col}`) ?? null;
};

/** Largest off-diagonal `games` in a grid — the games-mode colour scale. */
export const maxCellGames = (
  rows: readonly string[],
  cols: readonly string[],
  lookup: (row: string, col: string) => MatchCounts | null,
): number => {
  let max = 0;
  for (const r of rows)
    for (const c of cols) if (r !== c) max = Math.max(max, lookup(r, c)?.games ?? 0);
  return max;
};
