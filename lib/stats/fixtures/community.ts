/**
 * `/community` and `/heroes` fixtures, modelled on Main.dc.html / Hero.dc.html.
 *
 * Deliberate edge cases for the page tickets:
 * - `the-narrator` has never been played (omitted from `heroes`/`matchups`,
 *   and `/heroes?h=the-narrator` answers zeros);
 * - Leon S. Kennedy's crown is unclaimed (`crown: null`);
 * - Kenshiro vs Baba Yaga has never been played (the "fill this square" cell);
 * - Nancy Drew and Specter Knight are played, so their initials-disc tokens
 *   show up on the community surfaces.
 */
import { heroDisplayName, PUBLIC_ROSTER } from "../roster";
import type {
  CommunityHeroWire,
  CommunityWire,
  HeroPilotWire,
  HeroWire,
  MatchupWire,
  StatsWindow,
} from "../types";
import { isoWeekStart, monthStart, noise } from "./seed";

/** [heroId, month games, win %, crown holder | null]; most played first. */
const HERO_TABLE: [string, number, number, string | null][] = [
  ["the-mandalorian", 212, 54, "TinCanTom"],
  ["boba-fett", 188, 51, "pawnstorm"],
  ["ellen-ripley", 171, 56, "mossback"],
  ["jason-voorhees", 149, 49, "Hexwright"],
  ["baba-yaga", 133, 52, "quietharbor"],
  ["darth-maul", 120, 47, "lanternjaw"],
  ["kenshiro", 104, 58, "Ninefingers"],
  ["king-kong", 97, 45, "saltmarsh"],
  ["r2-d2", 88, 50, "lanternjaw"],
  ["leon-s-kennedy", 76, 53, null],
  ["skull-kid", 61, 48, "velvetanvil"],
  ["buster-keaton", 44, 55, "lanternjaw"],
  ["specter-knight", 41, 61, "lanternjaw"],
  ["thrall", 38, 47, "Dunmore"],
  ["hollow-oak-spice", 35, 52, "oldgrowth"],
  ["cecil-palmer", 31, 46, "velvetanvil"],
  ["appa", 29, 50, "Brindle"],
  ["nancy-drew", 27, 44, "cluefinder"],
  ["darth-vader", 25, 57, "Dunmore"],
  ["luke-skywalker", 22, 53, "pawnstorm"],
  ["general-grievous", 19, 42, "Hexwright"],
  ["batman", 17, 59, "mossback"],
  ["gerry-the-isopod", 15, 40, "oldgrowth"],
  ["cairne-bloodhoof", 13, 46, "saltmarsh"],
  ["triceratops", 11, 55, "Brindle"],
  ["thetis-spice", 9, 44, "quietharbor"],
  ["clone-troopers", 7, 43, "Ninefingers"],
  ["malfurion-stormrage", 5, 40, "TinCanTom"],
  // Played all-time, not this month.
  ["king-taranis-spice", 0, 50, "mossback"],
  ["piper-of-the-underroads-spice", 0, 47, "Dunmore"],
  ["gingerbread-man", 0, 52, "Brindle"],
  ["doppelganger", 0, 38, "cluefinder"],
];

/** All-time games for a hero: roughly 3× the month, never zero. */
const allTimeGames = (monthGames: number, index: number): number =>
  Math.round(monthGames * 3.1 + 40 - index);

const heroGames = (index: number, window: StatsWindow): number => {
  const month = HERO_TABLE[index][1];
  return window === "month" ? month : allTimeGames(month, index);
};

const heroRow = (index: number, window: StatsWindow): CommunityHeroWire | null => {
  const [heroId, , winPct, holder] = HERO_TABLE[index];
  const games = heroGames(index, window);
  if (games === 0) return null;
  const draws = Math.round(games * 0.02);
  const wins = Math.min(games - draws, Math.round((games * winPct) / 100));
  const crownWins = Math.max(1, Math.round(wins * (window === "month" ? 0.34 : 0.22)));
  return {
    heroId,
    heroName: heroDisplayName(heroId),
    games,
    wins,
    draws,
    crown: holder
      ? { username: holder, avatarUrl: null, wins: crownWins, games: Math.round(crownWins * 1.65) }
      : null,
  };
};

const PAIR_OVERRIDES: Record<string, number> = {
  "the-mandalorian|boba-fett": 64,
  "kenshiro|baba-yaga": 0,
};

/** Both orientations of every played pair, with a few deliberate gaps. */
const buildMatchups = (heroes: CommunityHeroWire[], window: StatsWindow): MatchupWire[] => {
  const out: MatchupWire[] = [];
  const scale = window === "month" ? 1 : 3;
  for (let i = 0; i < heroes.length; i++) {
    for (let j = i + 1; j < heroes.length; j++) {
      const a = heroes[i].heroId;
      const b = heroes[j].heroId;
      const override = PAIR_OVERRIDES[`${a}|${b}`] ?? PAIR_OVERRIDES[`${b}|${a}`];
      const base = Math.round(noise(i + 1, j + 1) * 58 * Math.max(0, 1 - (i + j) / 30)) + (i + j < 30 ? 2 : 0);
      const games = override !== undefined ? override * scale : base * scale;
      if (games <= 0) continue;
      const draws = noise(j, i) > 0.85 ? 1 : 0;
      const rate = 0.34 + noise(i + 3, j + 7) * 0.32;
      const winsA = Math.min(games - draws, Math.round((games - draws) * rate));
      const winsB = games - draws - winsA;
      out.push({ heroId: a, opponentHeroId: b, games, wins: winsA, draws });
      out.push({ heroId: b, opponentHeroId: a, games, wins: winsB, draws });
    }
  }
  return out;
};

const WEEKLY: [number, number, number][] = [
  [48, 60, 30], [52, 66, 28], [60, 70, 32], [58, 82, 30], [71, 90, 36], [80, 96, 40],
  [92, 110, 44], [101, 124, 48], [118, 140, 52], [126, 150, 58], [138, 162, 60], [149, 171, 64],
];

const heroesFor = (window: StatsWindow): CommunityHeroWire[] =>
  HERO_TABLE.map((_, i) => heroRow(i, window))
    .filter((row): row is CommunityHeroWire => row !== null)
    .sort((a, b) => b.games - a.games || a.heroId.localeCompare(b.heroId));

export const fixtureCommunity = (window: StatsWindow): CommunityWire => {
  const heroes = heroesFor(window);
  const month = window === "month";
  const kinds = month
    ? { human: 563, hardExpert: 667, casual: 252 }
    : { human: 1702, hardExpert: 2048, casual: 811 };
  return {
    window,
    windowStart: month ? monthStart() : null,
    generatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    totals: {
      ...kinds,
      games: kinds.human + kinds.hardExpert + kinds.casual,
      humanVsExpert: month ? { games: 410, wins: 287 } : { games: 1260, wins: 846 },
    },
    weekly: WEEKLY.map(([human, hardExpert, casual], i) => ({
      weekStart: isoWeekStart(11 - i),
      human,
      hardExpert,
      casual,
    })),
    heroes,
    matchups: buildMatchups(heroes, window),
    playersRanked: 214,
  };
};

const PILOTS: [string, number, number][] = [
  ["TinCanTom", 71, 118],
  ["pawnstorm", 38, 66],
  ["Hexwright", 29, 51],
  ["saltmarsh", 24, 47],
  ["mossback", 21, 33],
  ["Dunmore", 19, 38],
  ["lanternjaw", 15, 24],
  ["Brindle", 12, 27],
];

export const fixtureHero = (heroId: string, window: StatsWindow): HeroWire => {
  const community = fixtureCommunity(window);
  const hero = community.heroes.find((row) => row.heroId === heroId);
  const totalHumanSeatGames = community.heroes.reduce((sum, row) => sum + row.games, 0);
  const base = {
    heroId,
    heroName: hero?.heroName ?? (PUBLIC_ROSTER.some((r) => r.heroId === heroId) ? heroDisplayName(heroId) : null),
    window,
    windowStart: community.windowStart,
    generatedAt: community.generatedAt,
    totalHumanSeatGames,
  };
  if (!hero) {
    // A never-played (or unknown) hero is a 200 with zeros, not a 404 (§1b).
    return {
      ...base,
      games: 0,
      wins: 0,
      draws: 0,
      pilotCount: 0,
      pilots: [],
      crown: null,
      matchups: [],
      byOpponentKind: { human: 0, hardExpert: 0, casual: 0 },
    };
  }
  const scale = Math.max(0.05, hero.games / 212);
  const unclaimed = hero.crown === null;
  const pilots: HeroPilotWire[] = PILOTS.map(([username, wins, games], i) => {
    const g = Math.max(1, Math.round(games * scale));
    const w = unclaimed ? 0 : Math.min(g, Math.round(wins * scale));
    return { username: i === 0 && hero.crown ? hero.crown.username : username, avatarUrl: null, games: g, wins: w, draws: 0 };
  })
    .filter((p, i, list) => list.findIndex((q) => q.username === p.username) === i)
    .sort((a, b) => b.wins - a.wins || a.games - b.games);
  const human = Math.round(hero.games * 0.47);
  const hardExpert = Math.round(hero.games * 0.41);
  return {
    ...base,
    games: hero.games,
    wins: hero.wins,
    draws: hero.draws,
    pilotCount: Math.max(pilots.length, Math.round(61 * scale)),
    pilots,
    crown: pilots[0] && pilots[0].wins >= 1 ? pilots[0] : null,
    matchups: community.matchups
      .filter((m) => m.heroId === heroId)
      .map((m) => ({
        opponentHeroId: m.opponentHeroId,
        opponentHeroName: heroDisplayName(m.opponentHeroId),
        games: m.games,
        wins: m.wins,
        draws: m.draws,
      }))
      .sort((a, b) => b.games - a.games),
    byOpponentKind: { human, hardExpert, casual: hero.games - human - hardExpert },
  };
};
