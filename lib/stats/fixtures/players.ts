/**
 * `/leaderboard`, `/players?u=` and `/players/games?u=` fixtures. Every
 * username is fictional (the mockups' names, plus `lanternjaw` standing in for
 * the mockup's real account). Every board row resolves to a full profile, so
 * the leaderboard → player links work with no backend.
 *
 * Deliberate edge cases:
 * - `lanternjaw` mains Specter Knight (stub token → initials disc);
 * - `cluefinder` mains Nancy Drew (no token at all);
 * - `newleaf` has exactly one game;
 * - any other username → 404 (`not_found`).
 */
import { heroDisplayName, PUBLIC_ROSTER } from "../roster";
import type {
  BadgeWire,
  CalendarDayWire,
  FormResult,
  HeroOpponentHeroWire,
  HeroStatWire,
  LeaderboardRowWire,
  LeaderboardWire,
  PlayerWire,
  StatsWindow,
} from "../types";
import { daysAgo, hashOf, isoDay, noise } from "./seed";

interface Seed {
  username: string;
  level: number;
  xp: number;
  games: number;
  wins: number;
  draws: number;
  main: string;
  streak: number;
  form: string;
  monthGames: number;
  monthWins: number;
  selectedBadge: string | null;
}

/** All-time board order (xp desc). */
const SEEDS: Seed[] = [
  { username: "TinCanTom", level: 18, xp: 17210, games: 548, wins: 344, draws: 6, main: "the-mandalorian", streak: 9, form: "WWWWW", monthGames: 96, monthWins: 64, selectedBadge: "veteran" },
  { username: "mossback", level: 17, xp: 15940, games: 497, wins: 301, draws: 4, main: "ellen-ripley", streak: 4, form: "WWWWL", monthGames: 88, monthWins: 55, selectedBadge: "specialist" },
  { username: "quietharbor", level: 16, xp: 14120, games: 452, wins: 268, draws: 3, main: "baba-yaga", streak: 2, form: "WWLWD", monthGames: 71, monthWins: 41, selectedBadge: null },
  { username: "lanternjaw", level: 15, xp: 13480, games: 259, wins: 172, draws: 0, main: "specter-knight", streak: 5, form: "WWWWW", monthGames: 58, monthWins: 44, selectedBadge: "streak-5" },
  { username: "pawnstorm", level: 15, xp: 13110, games: 241, wins: 150, draws: 2, main: "boba-fett", streak: 0, form: "WLWWL", monthGames: 40, monthWins: 22, selectedBadge: "regular" },
  { username: "Hexwright", level: 14, xp: 11870, games: 230, wins: 139, draws: 1, main: "jason-voorhees", streak: 1, form: "LWWLW", monthGames: 36, monthWins: 20, selectedBadge: null },
  { username: "oldgrowth", level: 14, xp: 11020, games: 198, wins: 121, draws: 0, main: "hollow-oak-spice", streak: 0, form: "WWLWL", monthGames: 22, monthWins: 13, selectedBadge: "first-win" },
  { username: "Ninefingers", level: 13, xp: 9940, games: 187, wins: 110, draws: 2, main: "kenshiro", streak: 3, form: "LLWWW", monthGames: 30, monthWins: 19, selectedBadge: null },
  { username: "saltmarsh", level: 13, xp: 9410, games: 176, wins: 101, draws: 1, main: "king-kong", streak: 1, form: "WLWLW", monthGames: 18, monthWins: 9, selectedBadge: null },
  { username: "Dunmore", level: 12, xp: 8650, games: 160, wins: 92, draws: 0, main: "thrall", streak: 1, form: "WWLLW", monthGames: 25, monthWins: 16, selectedBadge: "people-person" },
  { username: "velvetanvil", level: 12, xp: 8120, games: 151, wins: 85, draws: 1, main: "cecil-palmer", streak: 2, form: "LWLWW", monthGames: 12, monthWins: 7, selectedBadge: null },
  { username: "Brindle", level: 11, xp: 7300, games: 139, wins: 77, draws: 0, main: "appa", streak: 0, form: "WWWLL", monthGames: 0, monthWins: 0, selectedBadge: null },
  { username: "cluefinder", level: 8, xp: 3900, games: 74, wins: 38, draws: 1, main: "nancy-drew", streak: 0, form: "LDWLW", monthGames: 14, monthWins: 6, selectedBadge: null },
  { username: "newleaf", level: 0, xp: 40, games: 1, wins: 1, draws: 0, main: "triceratops", streak: 1, form: "W", monthGames: 1, monthWins: 1, selectedBadge: null },
];

/** Players the fixture board claims exist in total (the rest are off-page). */
const BOARD_TOTAL = 214;

const findSeed = (username: string): Seed | undefined =>
  SEEDS.find((seed) => seed.username.toLowerCase() === username.toLowerCase());

const form = (text: string): FormResult[] => text.split("") as FormResult[];

const row = (seed: Seed, rank: number, window: StatsWindow): LeaderboardRowWire => ({
  rank,
  username: seed.username,
  avatarUrl: null,
  level: seed.level,
  xp: seed.xp,
  selectedBadges: seed.selectedBadge ? [seed.selectedBadge] : [],
  gamesPlayed: seed.games,
  wins: seed.wins,
  mainHeroId: seed.main,
  mainHeroName: heroDisplayName(seed.main),
  recentForm: form(seed.form),
  currentStreak: seed.streak,
  ...(window === "month" ? { monthGames: seed.monthGames, monthWins: seed.monthWins } : {}),
});

export const fixtureLeaderboard = (limit: number, window: StatsWindow): LeaderboardWire => {
  const seeds =
    window === "month"
      ? SEEDS.filter((s) => s.monthGames > 0).sort(
          (a, b) =>
            b.monthWins - a.monthWins ||
            a.monthGames - b.monthGames ||
            b.xp - a.xp ||
            a.username.localeCompare(b.username),
        )
      : SEEDS;
  return {
    generatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    total: window === "month" ? seeds.length : BOARD_TOTAL,
    players: seeds.slice(0, limit).map((seed, i) => row(seed, i + 1, window)),
  };
};

// --- profiles ----------------------------------------------------------------

/** Heroes a player has touched: main first, then a hash-picked spread. */
const heroSpread = (seed: Seed): string[] => {
  if (seed.games <= 1) return [seed.main];
  const count = Math.min(16, 4 + Math.round(seed.games / 30));
  const h = hashOf(seed.username);
  const others = PUBLIC_ROSTER.map((r) => r.heroId)
    .filter((id) => id !== seed.main && id !== "the-narrator")
    .sort((a, b) => noise(h, hashOf(a)) - noise(h, hashOf(b)));
  return [seed.main, ...others.slice(0, count - 1)];
};

/** Splits `total` over `n` buckets, the first getting `share` of it. */
const spread = (total: number, n: number, share: number): number[] => {
  if (n === 1) return [total];
  const first = Math.round(total * share);
  const rest = total - first;
  const weights = Array.from({ length: n - 1 }, (_, i) => 1 / (i + 1.4));
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((rest * w) / sum));
  parts[0] += rest - parts.reduce((a, b) => a + b, 0);
  return [first, ...parts];
};

const winsFor = (games: number, rate: number): number => Math.min(games, Math.round(games * rate));

const buildByHero = (seed: Seed): HeroStatWire[] => {
  const heroes = heroSpread(seed);
  const counts = spread(seed.games, heroes.length, 0.7);
  const rate = seed.wins / Math.max(1, seed.games);
  return heroes
    .map((heroId, i) => ({
      heroId,
      heroName: heroDisplayName(heroId),
      games: counts[i],
      wins: winsFor(counts[i], rate),
      draws: 0,
    }))
    .filter((r) => r.games > 0);
};

const OPPONENTS = ["boba-fett", "ellen-ripley", "the-mandalorian", "jason-voorhees", "baba-yaga", "darth-maul", "kenshiro", "king-kong"];

const buildHeroOpponentHero = (seed: Seed, byHero: HeroStatWire[]): HeroOpponentHeroWire[] => {
  const out: HeroOpponentHeroWire[] = [];
  const h = hashOf(seed.username);
  byHero.slice(0, 5).forEach((mine, i) => {
    const opps = seed.games <= 1 ? [OPPONENTS[0]] : OPPONENTS;
    const counts = spread(mine.games, opps.length, 0.2);
    opps.forEach((opp, j) => {
      const games = counts[j];
      if (games <= 0) return;
      // The nemesis cell from Player.dc.html: main vs Boba Fett, 3 of 11.
      const nemesis = i === 0 && opp === "boba-fett" && seed.games > 50;
      const g = nemesis ? 11 : games;
      const rate = 0.4 + noise(h + i, j + 3) * 0.5;
      out.push({
        heroId: mine.heroId,
        heroName: mine.heroName,
        opponentHeroId: opp,
        opponentHeroName: heroDisplayName(opp),
        games: g,
        wins: nemesis ? 3 : winsFor(g, seed.games <= 1 ? 1 : rate),
        draws: 0,
      });
    });
  });
  return out.sort((a, b) => b.games - a.games);
};

/** 182 days, only days with games, oldest first; ramps up like the mockup. */
const buildCalendar = (seed: Seed): CalendarDayWire[] => {
  if (seed.games <= 1) return [{ date: isoDay(daysAgo(2)), games: 1 }];
  const h = hashOf(seed.username);
  const out: CalendarDayWire[] = [];
  for (let back = 181; back >= 0; back--) {
    const date = daysAgo(back);
    const r = noise(h + back, date.getUTCDay() + 1);
    const ramp = 0.35 + 0.65 * ((181 - back) / 181);
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1.5 : 1;
    const games = r < 0.42 ? 0 : Math.round((r - 0.42) * 12 * ramp * weekend * (seed.games / 259));
    if (back === 36) out.push({ date: isoDay(date), games: 14 });
    else if (games > 0) out.push({ date: isoDay(date), games });
  }
  return out;
};

const BADGES: [string, string, string, number | null][] = [
  ["first-win", "First win", "Win a game.", 1],
  ["regular", "Regular", "Finish 25 games.", 25],
  ["veteran", "Veteran", "Finish 250 games.", 250],
  ["people-person", "People person", "Finish 100 games against humans.", 100],
  ["generalist", "Generalist", "Play 20 different heroes.", 20],
  ["streak-5", "Streak of 5", "Win 5 games in a row.", 5],
  ["specialist", "Specialist", "Win 50 games with one hero.", 50],
  ["rogues-gallery", "Rogues' gallery", "Beat 10 different heroes.", 10],
  ["nemesis", "Nemesis", "Beat the same hero 10 times.", 10],
  ["level-5", "Level 5", "Reach level 5.", null],
  ["level-10", "Level 10", "Reach level 10.", null],
];

const buildBadges = (seed: Seed, byHero: HeroStatWire[], humanGames: number, best: number): BadgeWire[] => {
  const current: Record<string, number> = {
    "first-win": Math.min(1, seed.wins),
    regular: seed.games,
    veteran: seed.games,
    "people-person": humanGames,
    generalist: byHero.length,
    "streak-5": best,
    specialist: byHero[0]?.wins ?? 0,
    "rogues-gallery": Math.min(10, Math.round(seed.wins / 12)),
    nemesis: Math.min(10, Math.round(seed.wins / 30)),
  };
  return BADGES.map(([id, name, blurb, target]) => {
    if (target === null) {
      const need = id === "level-5" ? 5 : 10;
      return { id, name, blurb, unlocked: seed.level >= need, unlockedWhy: `${blurb} (level ${seed.level})` };
    }
    const value = Math.min(current[id] ?? 0, target);
    return {
      id,
      name,
      blurb,
      unlocked: value >= target,
      unlockedWhy: `${blurb} (${value}/${target})`,
      progress: { current: value, target },
    };
  });
};

const buildPlayer = (seed: Seed): PlayerWire => {
  const rank = SEEDS.indexOf(seed) + 1;
  const above = rank > 1 ? SEEDS[rank - 2] : null;
  const byHero = buildByHero(seed);
  const losses = seed.games - seed.wins - seed.draws;
  const kindShare = seed.games <= 1 ? [0, 1, 0, 0] : [0.37, 0.46, 0.16, 0.01];
  const [human, expert, hard, easy] = kindShare.map((s) => Math.round(seed.games * s));
  const rate = seed.wins / Math.max(1, seed.games);
  const best = Math.max(seed.streak, seed.games <= 1 ? 1 : 11);
  const xpForNext = 50 * (seed.level + 1) * (seed.level + 2);
  const firstGames = Math.ceil(seed.games / 2);
  return {
    user: { username: seed.username, avatarUrl: null },
    level: seed.level,
    xp: seed.xp,
    xpForNext,
    selectedBadges: seed.selectedBadge ? [seed.selectedBadge] : [],
    badges: buildBadges(seed, byHero, human, best),
    stats: {
      totalGames: seed.games,
      wins: seed.wins,
      losses,
      draws: seed.draws,
      firstGameAt: daysAgo(seed.games <= 1 ? 2 : 181).toISOString(),
      lastGameAt: daysAgo(seed.games <= 1 ? 2 : 0).toISOString(),
      byHero,
      level: seed.level,
      xp: seed.xp,
      xpForNext,
      avgDurationSeconds: 860,
      avgTurns: 11,
      streaks: { current: seed.streak, best },
      recentForm: form(seed.games <= 1 ? "W" : `${seed.form}WLWWW`.slice(0, 10)),
      byOpponentHero: OPPONENTS.slice(0, seed.games <= 1 ? 1 : 8).map((heroId, i) => {
        const games = seed.games <= 1 ? 1 : Math.max(1, Math.round(seed.games / (4 + i * 1.5)));
        return { heroId, heroName: heroDisplayName(heroId), games, wins: winsFor(games, rate), draws: 0 };
      }),
      byMap: [{ map: "mended-drum", games: seed.games, wins: seed.wins, draws: seed.draws }],
      byOpponentKind: {
        human: human > 0 ? { games: human, wins: winsFor(human, 0.58), draws: 0 } : null,
        bots: [
          { difficulty: "expert", games: expert, wins: winsFor(expert, seed.games <= 1 ? 1 : 0.7), draws: 0 },
          { difficulty: "hard", games: hard, wins: winsFor(hard, 0.76), draws: 0 },
          { difficulty: "easy", games: easy, wins: easy, draws: 0 },
        ].filter((b) => b.games > 0),
      },
      firstPlayer: {
        first: { games: firstGames, wins: winsFor(firstGames, rate + 0.03) },
        second: { games: seed.games - firstGames, wins: winsFor(seed.games - firstGames, rate - 0.02) },
      },
      calendar: buildCalendar(seed),
      byHeroOpponentHero: buildHeroOpponentHero(seed, byHero),
    },
    leaderboard: {
      rank,
      of: BOARD_TOTAL,
      next: above ? { username: above.username, rank: rank - 1, xpGap: above.xp - seed.xp } : null,
    },
    xpPerWin: { human: 40, expert: 33, hard: 27 },
  };
};

/** Known username → profile body, else null (→ 404 / `not_found`). */
export const fixturePlayer = (username: string): PlayerWire | null => {
  const seed = findSeed(username);
  return seed ? buildPlayer(seed) : null;
};

/** The usernames the fixtures know — for the dev gallery's links. */
export const FIXTURE_USERNAMES: readonly string[] = SEEDS.map((s) => s.username);

const MAPS = ["mended-drum", "weathertop", "polus", "city-docks"];

/** `/players/games?u=` — cursor = index of the next game, as a string. */
export const fixturePlayerGames = (
  username: string,
  limit: number,
  before: string | null,
): { games: unknown[]; nextBefore: string | null } => {
  const seed = findSeed(username);
  if (!seed) return { games: [], nextBefore: null };
  const player = buildPlayer(seed);
  const total = Math.min(seed.games, 60);
  const start = before ? Math.max(0, Number(before) || 0) : 0;
  const end = Math.min(total, start + limit);
  const heroes = player.stats.byHero;
  const games = [];
  for (let i = start; i < end; i++) {
    const letter = (player.stats.recentForm ?? [])[i] ?? (noise(i, hashOf(username)) < 0.62 ? "W" : "L");
    const mine = heroes[i % Math.min(3, heroes.length)];
    const opp = OPPONENTS[(i * 3) % OPPONENTS.length];
    const pilot = seed.games <= 1 ? "bot:expert" : ["human", "bot:expert", "human", "bot:hard"][i % 4];
    games.push({
      id: `fx-${username}-${i}`,
      endedAt: new Date(Date.now() - (i + 1) * 5 * 3_600_000).toISOString(),
      map: MAPS[i % MAPS.length],
      turns: 9 + (i % 6),
      durationSeconds: 640 + ((i * 97) % 500),
      endCondition: "HERO_DEFEATED",
      draw: letter === "D",
      you: { heroId: mine.heroId, heroName: mine.heroName, won: letter === "W", finalHealth: letter === "W" ? 4 + (i % 7) : 0 },
      opponents: [
        {
          heroId: opp,
          heroName: heroDisplayName(opp),
          pilot,
          botDifficulty: pilot.startsWith("bot:") ? pilot.slice(4) : null,
        },
      ],
    });
  }
  return { games, nextBefore: end < total ? String(end) : null };
};
