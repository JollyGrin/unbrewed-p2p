import type { Badge } from "@/lib/account/badges";
import type { AccountStats } from "@/lib/account/stats";

import {
  badgeChase,
  calendarColor,
  calendarFooter,
  calendarSummary,
  calendarWeeks,
  CALENDAR_WEEKS,
  generalistToGo,
  mainHero,
  matchGridAxes,
  nemesis,
  nextUpCopy,
  opponentBars,
  playerTiles,
  rosterEntries,
  shortMonth,
} from "./playerDashboard";
import { ROSTER_SIZE } from "./roster";
import type { HeroOpponentHero } from "./types";

const stats = (over: Partial<AccountStats> = {}): AccountStats => ({
  totalGames: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  firstGameAt: null,
  lastGameAt: null,
  byHero: [],
  level: null,
  xp: null,
  xpForNext: null,
  avgDurationSeconds: null,
  avgTurns: null,
  streaks: null,
  recentForm: null,
  byOpponentHero: null,
  byMap: null,
  byOpponentKind: null,
  firstPlayer: null,
  ...over,
});

const badge = (id: string, unlocked: boolean, name = id): Badge => ({
  id,
  name,
  blurb: `${name} blurb`,
  unlocked,
  unlockedWhy: "",
});

const cell = (heroId: string, opponentHeroId: string, games: number, wins: number, draws = 0): HeroOpponentHero => ({
  heroId,
  heroName: null,
  opponentHeroId,
  opponentHeroName: null,
  games,
  wins,
  draws,
});

describe("nextUpCopy", () => {
  const perWin = { human: 40, expert: 33, hard: 27 };

  it("hides without a leaderboard block", () => {
    expect(nextUpCopy(null, perWin)).toBeNull();
  });

  it("says the podium when the next row is top 3, with ceil'd win counts", () => {
    const copy = nextUpCopy({ rank: 4, of: 214, next: { username: "quietharbor", rank: 3, xpGap: 640 } }, perWin);
    expect(copy).toEqual({
      headline: "640 XP behind quietharbor for the podium",
      detail: "That is 16 wins against humans, or 20 against the expert bot.",
    });
  });

  it("names the rank below the podium and rounds a partial win up", () => {
    const copy = nextUpCopy({ rank: 9, of: 20, next: { username: "x", rank: 8, xpGap: 41 } }, perWin);
    expect(copy?.headline).toBe("41 XP behind x for #8");
    expect(copy?.detail).toBe("That is 2 wins against humans, or 2 against the expert bot.");
  });

  it("singular win", () => {
    const copy = nextUpCopy({ rank: 9, of: 20, next: { username: "x", rank: 8, xpGap: 10 } }, perWin);
    expect(copy?.detail).toBe("That is 1 win against humans, or 1 against the expert bot.");
  });

  it("is the top line at #1", () => {
    expect(nextUpCopy({ rank: 1, of: 20, next: null }, perWin)).toEqual({ headline: "Top of the leaderboard.", detail: null });
  });

  it("drops the wins line without xpPerWin", () => {
    expect(nextUpCopy({ rank: 5, of: 9, next: { username: "x", rank: 4, xpGap: 5 } }, null)?.detail).toBeNull();
  });
});

describe("playerTiles", () => {
  it("keeps only the always-present three on an older api", () => {
    const tiles = playerTiles(stats({ totalGames: 3, wins: 2, losses: 1 }));
    expect(tiles.map((t) => t.label)).toEqual(["Games", "Win rate", "Record"]);
    expect(tiles[1]).toMatchObject({ value: "—", sub: "after 5 games" });
    expect(tiles[2]).toMatchObject({ value: "2–1", sub: "no draws" });
  });

  it("uses the counted record (casual games excluded)", () => {
    const s = stats({
      totalGames: 13,
      wins: 11,
      losses: 2,
      byOpponentKind: {
        human: { games: 10, wins: 8, draws: 1 },
        bots: [{ difficulty: "easy", games: 3, wins: 3 }],
      },
      streaks: { current: 5, best: 11 },
      avgDurationSeconds: 860,
      avgTurns: 11,
      firstGameAt: "2026-03-01T00:00:00Z",
      lastGameAt: "2026-09-20T00:00:00Z",
    });
    const tiles = playerTiles(s, Date.parse("2026-09-27T00:00:00Z"));
    expect(tiles.map((t) => [t.label, t.value, t.sub])).toEqual([
      ["Games", "13", "last played Sep 2026"],
      ["Win rate", "80%", "8 wins"],
      ["Record", "8–1–1", "win–loss–draw"],
      ["Win streak", "5", "best 11"],
      ["Game length", "14:20", "11 turns on average"],
      ["Playing since", "Mar '26", "30 weeks at the table"],
    ]);
  });

  it("shortMonth squeezes the year", () => {
    expect(shortMonth("2026-07-04T00:00:00Z")).toBe("Jul '26");
    expect(shortMonth(null)).toBeNull();
  });
});

describe("calendar", () => {
  // Sunday 2026-09-27.
  const now = Date.parse("2026-09-27T15:00:00Z");

  it("is 26 Monday-first weeks ending in the current week", () => {
    const weeks = calendarWeeks([], now);
    expect(weeks).toHaveLength(CALENDAR_WEEKS);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(new Date(`${weeks[0][0].date}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(weeks[25][6].date).toBe("2026-09-27");
    expect(weeks[25][6].future).toBe(false);
  });

  it("marks later days of this week as future", () => {
    const wed = Date.parse("2026-09-23T10:00:00Z");
    const last = calendarWeeks([], wed)[25];
    expect(last.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(last[6].bg).toBe("transparent");
  });

  it("colours days on the mockup's scale", () => {
    const weeks = calendarWeeks([{ date: "2026-09-26", games: 3 }], now);
    expect(weeks[25][5]).toMatchObject({ games: 3, bg: "rgba(72,40,79,0.41)", tip: "Sep 26: 3 games" });
    expect(calendarColor(0)).toBe("rgba(72,40,79,0.07)");
    expect(calendarColor(14)).toBe("rgba(72,40,79,0.90)");
  });

  it("finds the busiest day and the longest run", () => {
    const summary = calendarSummary([
      { date: "2026-08-20", games: 1 },
      { date: "2026-08-21", games: 2 },
      { date: "2026-08-22", games: 14 },
      { date: "2026-09-01", games: 14 },
      { date: "2026-09-03", games: 1 },
    ]);
    expect(summary).toEqual({ busiest: { date: "2026-09-01", games: 14 }, longestRun: 3 });
    expect(calendarFooter(summary)).toBe("Busiest day: 14 games on Sep 1 · Longest run: 3 days in a row");
  });

  it("has no footer with no games", () => {
    expect(calendarFooter(calendarSummary([]))).toBeNull();
    expect(calendarFooter(calendarSummary([{ date: "2026-09-01", games: 1 }]))).toBe(
      "Busiest day: 1 game on Sep 1 · Longest run: 1 day",
    );
  });
});

describe("roster", () => {
  it("puts played heroes first by games and ignores hidden baselines", () => {
    const s = stats({
      byHero: [
        { heroId: "thrall", heroName: "Thrall", games: 2, wins: 1 },
        { heroId: "appa", heroName: "Appa", games: 30, wins: 10 },
        { heroId: "thetis", heroName: "Thetis", games: 50, wins: 10 },
        { heroId: null, heroName: null, games: 4, wins: 1 },
      ],
    });
    const { entries, played } = rosterEntries(s);
    expect(entries).toHaveLength(ROSTER_SIZE);
    expect(played).toBe(2);
    expect(entries.slice(0, 3).map((e) => [e.heroId, e.games])).toEqual([
      ["appa", 30],
      ["thrall", 2],
      ["baba-yaga", 0],
    ]);
  });

  it("main hero: most games, then most wins, then id", () => {
    expect(mainHero(stats())).toBeNull();
    const s = stats({
      byHero: [
        { heroId: "thrall", heroName: "Thrall", games: 10, wins: 4 },
        { heroId: "appa", heroName: "Appa", games: 10, wins: 6 },
        { heroId: "batman", heroName: "Batman", games: 10, wins: 6 },
      ],
    });
    expect(mainHero(s)).toMatchObject({ heroId: "appa", games: 10, wins: 6, winPercent: 60 });
  });

  it("generalist countdown only while locked and with progress", () => {
    const progress = { generalist: { current: 16, target: 20 } };
    expect(generalistToGo([badge("generalist", false, "Generalist")], progress)).toBe("4 to Generalist badge");
    expect(generalistToGo([badge("generalist", true, "Generalist")], progress)).toBeNull();
    expect(generalistToGo([badge("generalist", false)], null)).toBeNull();
    expect(generalistToGo([], progress)).toBeNull();
  });
});

describe("match grid", () => {
  const cells = [
    cell("specter-knight", "boba-fett", 11, 3),
    cell("specter-knight", "appa", 20, 12),
    cell("specter-knight", "thrall", 6, 1, 1),
    cell("thrall", "appa", 5, 2),
    cell("appa", "appa", 9, 0),
    cell("thrall", "boba-fett", 4, 0),
    cell(null as unknown as string, "appa", 50, 0),
  ];

  it("axes are the top heroes by games on each side", () => {
    const { rows, cols } = matchGridAxes(cells);
    expect(rows.map((r) => r.heroId)).toEqual(["specter-knight", "appa", "thrall"]);
    expect(cols.map((c) => c.heroId)).toEqual(["appa", "boba-fett", "thrall"]);
  });

  it("caps rows at 5 and cols at 8", () => {
    const many = Array.from({ length: 12 }, (_, i) => cell(`h${i}`, `o${i}`, 12 - i, 1));
    const { rows, cols } = matchGridAxes(many);
    expect(rows).toHaveLength(5);
    expect(cols).toHaveLength(8);
    expect(rows[0].heroId).toBe("h0");
  });

  it("nemesis is the worst rate among ≥5-game losing cells, never a mirror", () => {
    const worst = nemesis(cells);
    // thrall 1 of 6 (17%) beats boba 3 of 11 (27%); 0 of 4 has too few games;
    // appa vs appa 0 of 9 is a mirror.
    expect(worst).toMatchObject({ heroId: "specter-knight", opponentHeroId: "thrall", wins: 1, losses: 4, opponentName: "Thrall" });
    expect(worst?.line).toBe("1 and 4 against Thrall with Specter Knight.");
  });

  it("no nemesis when nothing qualifies", () => {
    expect(nemesis([cell("a", "b", 5, 3), cell("a", "c", 4, 0), cell("a", "d", 10, 5)])).toBeNull();
    expect(nemesis([])).toBeNull();
  });
});

describe("opponentBars", () => {
  it("is null without byOpponentKind", () => {
    expect(opponentBars(stats())).toBeNull();
  });

  it("folds unknown into hard and easy/medium into casual", () => {
    const bars = opponentBars(
      stats({
        byOpponentKind: {
          human: { games: 50, wins: 25 },
          bots: [
            { difficulty: "expert", games: 20, wins: 14 },
            { difficulty: "hard", games: 10, wins: 5 },
            { difficulty: "unknown", games: 10, wins: 5 },
            { difficulty: "easy", games: 6, wins: 6 },
            { difficulty: "medium", games: 4, wins: 3 },
          ],
        },
      }),
    );
    expect(bars?.map((b) => [b.label, b.games, b.detail, b.share])).toEqual([
      ["Humans", 50, "50% wins", 0.5],
      ["Expert bot", 20, "70% wins", 0.2],
      ["Hard bot", 20, "50% wins", 0.2],
      ["Casual bots · no XP", 10, "9 wins", 0.1],
    ]);
  });

  it("drops empty rows", () => {
    const bars = opponentBars(stats({ byOpponentKind: { human: null, bots: [{ difficulty: "expert", games: 1, wins: 1 }] } }));
    expect(bars?.map((b) => b.key)).toEqual(["expert"]);
  });
});

describe("badgeChase", () => {
  const badges = [badge("a", false), badge("b", false), badge("c", false), badge("d", false), badge("e", true), badge("f", false)];
  const progress = {
    a: { current: 1, target: 10 },
    b: { current: 9, target: 10 },
    c: { current: 5, target: 10 },
    d: { current: 7, target: 10 },
    e: { current: 10, target: 10 },
  };

  it("takes the 3 closest locked badges with progress, using the api blurb", () => {
    const chase = badgeChase(badges, progress);
    expect(chase.map((c) => c.id)).toEqual(["b", "d", "c"]);
    expect(chase[0]).toMatchObject({ blurb: "b blurb", current: 9, target: 10 });
  });

  it("is empty without progress (today's prod)", () => {
    expect(badgeChase(badges, null)).toEqual([]);
  });
});
