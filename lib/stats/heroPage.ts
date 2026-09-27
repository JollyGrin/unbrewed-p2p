/**
 * Pure derivations for the hero pages (issue #938): `/heroes?h=<heroId>` (one
 * hero's ladder) and `/heroes` (the roster index). Everything the page prints
 * that is more than a field read lives here, so the ranks, gaps, ordinals and
 * bar widths are unit-tested without a DOM.
 */
import { HERO_RANKS, heroRank, heroRankProgress } from "./heroRank";
import { heroDisplayName, PUBLIC_ROSTER } from "./roster";
import type {
  CommunityHero,
  Crown,
  HeroMatchup,
  HeroPilot,
  StatsWindow,
} from "./types";

/** Contract §3: a win rate needs at least this many games, else `·`. */
export const MIN_RATE_GAMES = 3;

/** How many matchup rows show before "Show all". */
export const MATCHUPS_SHOWN = 12;

/** Half of MATCHUPS_SHOWN: how many rows each end of the collapsed split gets. */
const MATCHUPS_SHOWN_PER_END = MATCHUPS_SHOWN / 2;

const first = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

/** `?h=` as a trimmed, lower-cased hero id, or null when absent/blank. */
export const heroIdFromQuery = (raw: string | string[] | undefined): string | null => {
  const value = first(raw);
  const trimmed = typeof value === "string" ? value.trim().toLowerCase() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/** `?window=`: `all` is the only other value; anything else is the default month. */
export const windowFromQuery = (raw: string | string[] | undefined): StatsWindow =>
  first(raw) === "all" ? "all" : "month";

/** The URL for a hero page (or the index when `heroId` is null) in a window. */
export const heroesHref = (heroId: string | null, window: StatsWindow): string => {
  const params = new URLSearchParams();
  if (heroId) params.set("h", heroId);
  if (window === "all") params.set("window", "all");
  const qs = params.toString();
  return qs ? `/heroes?${qs}` : "/heroes";
};

/** Whole-percent win rate, or null below MIN_RATE_GAMES. */
export const winRate = (wins: number, games: number): number | null =>
  games >= MIN_RATE_GAMES ? Math.round((wins / games) * 100) : null;

/** "54%", or "·" when there are too few games to say. */
export const formatRate = (rate: number | null): string => (rate === null ? "·" : `${rate}%`);

/** This hero's share of every human-seat game, whole percent; null when unknown. */
export const shareOfAllGames = (games: number, totalHumanSeatGames: number | null): number | null => {
  if (totalHumanSeatGames === null) return null;
  if (totalHumanSeatGames <= 0) return 0;
  return Math.round((games / totalHumanSeatGames) * 100);
};

/**
 * True when `heroId` is the single most-played hero in a community payload
 * (the month window's, for the kicker). A zero-game hero is never #1.
 */
export const isMostPlayed = (heroId: string, heroes: CommunityHero[] | null): boolean => {
  if (!heroes || heroes.length === 0) return false;
  const top = heroes.reduce((best, row) => (row.games > best.games ? row : best), heroes[0]);
  return top.games > 0 && top.heroId === heroId;
};

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd. */
export const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const sameUser = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

// --- your hero rank ----------------------------------------------------------

export interface RankStep {
  name: string;
  minGames: number;
  /** "1 game · done", "25 games · 1 to go", "100 games". */
  caption: string;
  reached: boolean;
}

export interface HeroRankTrack {
  games: number;
  /** "24 games as The Mandalorian. One more game makes Silver." */
  sentence: string;
  /** Bar fill, 0–100: each of the four steps owns a quarter of the track. */
  fill: number;
  steps: RankStep[];
}

/** Fill position: step i sits at i·25%, interpolated between thresholds. */
const trackFill = (games: number): number => {
  if (games <= 0) return 0;
  const last = HERO_RANKS[HERO_RANKS.length - 1];
  if (games >= last.minGames) return 100;
  const quarter = 100 / HERO_RANKS.length;
  for (let i = HERO_RANKS.length - 2; i >= 0; i--) {
    const lo = HERO_RANKS[i].minGames;
    const hi = HERO_RANKS[i + 1].minGames;
    if (games >= lo) return quarter * i + quarter * ((games - lo) / (hi - lo));
  }
  // Below the first threshold (only possible if Tried ever needs > 1 game).
  return 0;
};

export const heroRankTrack = (games: number, heroName: string): HeroRankTrack => {
  const count = Math.max(0, Math.floor(games));
  const { next, toNext } = heroRankProgress(count);
  const played = count === 0 ? `No games as ${heroName} yet.` : `${plural(count, "game", "games")} as ${heroName}.`;
  let onward: string;
  if (!next) onward = "Gold. The top rank.";
  else if (count === 0) onward = `One game makes ${next.name}.`;
  else if (toNext === 1) onward = `One more game makes ${next.name}.`;
  else onward = `${toNext} more games make ${next.name}.`;
  return {
    games: count,
    sentence: `${played} ${onward}`,
    fill: Math.round(trackFill(count)),
    steps: HERO_RANKS.map((tier) => {
      const reached = count >= tier.minGames;
      const base = plural(tier.minGames, "game", "games");
      const isNext = next?.name === tier.name;
      return {
        name: tier.name,
        minGames: tier.minGames,
        reached,
        caption: reached ? `${base} · done` : isNext ? `${base} · ${toNext} to go` : base,
      };
    }),
  };
};

/** The viewer's games on a hero, from their own `byHero` (0 when absent). */
export const gamesOnHero = (
  byHero: { heroId: string | null; games: number }[] | null | undefined,
  heroId: string,
): number =>
  (byHero ?? []).reduce((sum, row) => (row.heroId === heroId ? sum + row.games : sum), 0);

// --- top pilots --------------------------------------------------------------

export interface PilotRow {
  rank: number;
  username: string;
  wins: number;
  games: number;
  rate: number | null;
  /** "Silver hero rank"; null for 0 games (never on the list in practice). */
  tier: string | null;
  you: boolean;
}

/** Pilots in the api's order (wins desc), ranked 1…n, with the viewer marked. */
export const pilotRows = (pilots: HeroPilot[], viewer: string | null): PilotRow[] =>
  pilots.map((pilot, i) => {
    const tier = heroRank(pilot.games);
    return {
      rank: i + 1,
      username: pilot.username,
      wins: pilot.wins,
      games: pilot.games,
      rate: winRate(pilot.wins, pilot.games),
      tier: tier ? `${tier.name} hero rank` : null,
      you: sameUser(pilot.username, viewer),
    };
  });

/**
 * "You are 4 wins behind Dunmore for 6th." — only for a viewer on the list
 * and not #1; null otherwise.
 */
export const pilotGapLine = (rows: PilotRow[]): string | null => {
  const i = rows.findIndex((row) => row.you);
  if (i <= 0) return null;
  const above = rows[i - 1];
  const gap = Math.max(0, above.wins - rows[i].wins);
  const place = ordinal(above.rank);
  if (gap === 0) return `You are level on wins with ${above.username} for ${place}.`;
  return `You are ${plural(gap, "win", "wins")} behind ${above.username} for ${place}.`;
};

// --- matchups ----------------------------------------------------------------

export interface MatchupBar {
  opponentHeroId: string;
  name: string;
  games: number;
  rate: number;
  /** Width of the bar within its half, 0–100 (%). */
  width: number;
  side: "loss" | "win";
  /** "68% over 22 games". */
  tip: string;
}

/**
 * Opponents with at least MIN_RATE_GAMES games, best matchup first. The bar
 * diverges from 50%: `min(100, |wr − 50| · 5)` % of its half.
 */
export const matchupBars = (matchups: HeroMatchup[]): MatchupBar[] =>
  matchups
    .filter((m) => m.games >= MIN_RATE_GAMES)
    .map((m) => {
      const rate = Math.round((m.wins / m.games) * 100);
      return {
        opponentHeroId: m.opponentHeroId,
        name: heroDisplayName(m.opponentHeroId, m.opponentHeroName),
        games: m.games,
        rate,
        width: Math.min(100, Math.abs(rate - 50) * 5),
        side: rate < 50 ? ("loss" as const) : ("win" as const),
        tip: `${rate}% over ${plural(m.games, "game", "games")}`,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.games - a.games || a.name.localeCompare(b.name));

export interface MatchupSplit {
  top: MatchupBar[];
  /** The lowest win-rate rows, still in descending order; empty when nothing was cut. */
  bottom: MatchupBar[];
}

/**
 * The collapsed matchups view: at MATCHUPS_SHOWN or fewer, everything shows
 * (`bottom` empty). Past that, showing only the best `MATCHUPS_SHOWN` hid every
 * "Struggles" row — so the collapsed list becomes the best 6 and the worst 6
 * (still descending, with a divider between the two groups in the UI), and
 * "Show all N" is what reaches the middle.
 */
export const collapsedMatchups = (bars: MatchupBar[]): MatchupSplit => {
  if (bars.length <= MATCHUPS_SHOWN) return { top: bars, bottom: [] };
  return { top: bars.slice(0, MATCHUPS_SHOWN_PER_END), bottom: bars.slice(-MATCHUPS_SHOWN_PER_END) };
};

// --- crown -------------------------------------------------------------------

/** "71 wins in 118 games." */
export const crownLine = (crown: Pick<Crown, "wins" | "games">): string =>
  `${plural(crown.wins, "win", "wins")} in ${plural(crown.games, "game", "games")}.`;

// --- hero index --------------------------------------------------------------

export interface HeroIndexRow {
  heroId: string;
  name: string;
  games: number;
  rate: number | null;
  crown: Crown | null;
  played: boolean;
}

/**
 * Every public roster hero with its numbers from `/community`, most played
 * first; unplayed heroes last, alphabetical. `heroes` null (no community
 * data) → the roster alphabetically with zeros.
 */
export const heroIndexRows = (heroes: CommunityHero[] | null): HeroIndexRow[] => {
  const byId = new Map((heroes ?? []).map((row) => [row.heroId, row]));
  return PUBLIC_ROSTER.map((hero) => {
    const row = byId.get(hero.heroId);
    const games = row?.games ?? 0;
    return {
      heroId: hero.heroId,
      name: hero.name,
      games,
      rate: row ? winRate(row.wins, row.games) : null,
      crown: row?.crown ?? null,
      played: games > 0,
    };
  }).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
};
