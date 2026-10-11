/**
 * "What you earned" arithmetic (p2p #1399): the snapshot, the landing test,
 * the delta, the level bar's three segments, and the casual/forfeit split.
 */
import type { AccountStats } from "@/lib/account/stats";
import type { Badge } from "@/lib/account/badges";
import type { HeroCosmetics } from "@/lib/account/cosmetics";
import { emptyHeroCosmetics } from "@/lib/account/cosmetics";
import type { PlayerView } from "./protocol";
import {
  EarnedSnapshot,
  EarnedStats,
  PLACEHOLDER_PERCENT,
  earnedDelta,
  earnedKindOf,
  gameHasLanded,
  landedLevelBar,
  pointsCaption,
  streakLabel,
  takeEarnedSnapshot,
  waitingLevelBar,
  xpLine,
} from "./earned";

const stats = (over: Partial<AccountStats> = {}): AccountStats =>
  ({
    totalGames: 40,
    wins: 25,
    losses: 15,
    draws: 0,
    firstGameAt: null,
    lastGameAt: null,
    byHero: [],
    // level 7 spans 2,800 → 3,600 (50·N·(N+1)); 3,504 is 88% through it.
    level: 7,
    xp: 3504,
    xpForNext: 3600,
    avgDurationSeconds: null,
    avgTurns: null,
    streaks: { current: 3, best: 6 },
    recentForm: null,
    byOpponentHero: null,
    byMap: null,
    byOpponentKind: null,
    firstPlayer: null,
    ...over,
  }) as AccountStats;

const earnedStats = (over: Partial<EarnedStats> = {}): EarnedStats => ({
  totalGames: 40,
  level: 7,
  xp: 3504,
  xpForNext: 3600,
  streak: 3,
  streakBest: 6,
  ...over,
});

const hero = (earned: number | null): HeroCosmetics => ({ ...emptyHeroCosmetics("hollow-oak", true), earned });

const badge = (id: string, unlocked: boolean): Badge => ({ id, name: id, blurb: "", unlocked, unlockedWhy: "" });

const snapshot = (over: Partial<EarnedSnapshot> = {}): EarnedSnapshot => ({
  stats: earnedStats(),
  heroId: "hollow-oak",
  heroPoints: 220,
  unlocked: ["first-win"],
  ...over,
});

describe("takeEarnedSnapshot", () => {
  it("captures level, xp, streak, total games, hero points and the unlocked set", () => {
    const snap = takeEarnedSnapshot(stats(), "hollow-oak", hero(220), [badge("first-win", true), badge("streak-5", false)]);
    expect(snap).toEqual(snapshot());
  });

  it("is null with no stats to diff against, or no hero — no baseline means no poll", () => {
    expect(takeEarnedSnapshot(null, "hollow-oak", hero(220), [])).toBeNull();
    expect(takeEarnedSnapshot(stats(), null, hero(220), [])).toBeNull();
  });

  it("keeps unknown points and missing progression as null rather than zero", () => {
    const snap = takeEarnedSnapshot(stats({ level: null, xp: null, xpForNext: null, streaks: null }), "hollow-oak", null, []);
    expect(snap?.stats).toEqual({ totalGames: 40, level: null, xp: null, xpForNext: null, streak: null, streakBest: null });
    expect(snap?.heroPoints).toBeNull();
  });
});

describe("gameHasLanded", () => {
  it("only once totalGames is STRICTLY past the snapshot — the 60 s cache returns the old count verbatim", () => {
    expect(gameHasLanded({ totalGames: 40 }, { totalGames: 40 })).toBe(false);
    expect(gameHasLanded({ totalGames: 40 }, { totalGames: 41 })).toBe(true);
    expect(gameHasLanded({ totalGames: 40 }, { totalGames: 39 })).toBe(false);
  });
});

describe("earnedDelta", () => {
  it("xp, points, streak and the new badge, from two snapshots", () => {
    const delta = earnedDelta(snapshot(), {
      stats: earnedStats({ totalGames: 41, xp: 3544, streak: 4 }),
      heroPoints: 260,
      unlocked: ["first-win", "streak-5"],
    });
    expect(delta).toEqual({
      xp: 40,
      level: 7,
      levelUp: false,
      points: 40,
      heroPoints: 260,
      streak: { from: 3, to: 4 },
      newBadges: ["streak-5"],
    });
  });

  it("a level-up", () => {
    const delta = earnedDelta(snapshot(), { stats: earnedStats({ xp: 3640, level: 8, xpForNext: 4500 }), heroPoints: 260, unlocked: [] });
    expect(delta.levelUp).toBe(true);
    expect(delta.level).toBe(8);
    expect(delta.xp).toBe(136);
  });

  it("unknown on either side stays unknown; a lost badge is not a negative unlock", () => {
    const delta = earnedDelta(snapshot({ heroPoints: null, stats: earnedStats({ xp: null }) }), {
      stats: earnedStats({ xp: 3544, streak: null }),
      heroPoints: 260,
      unlocked: [],
    });
    expect(delta.xp).toBeNull();
    expect(delta.points).toBeNull();
    expect(delta.streak).toBeNull();
    expect(delta.newBadges).toEqual([]);
  });
});

describe("the level bar", () => {
  it("waiting: the pre-game fill plus a hatched sliver capped at the room left", () => {
    expect(waitingLevelBar(earnedStats())).toEqual({ level: 7, xp: 3504, next: 3600, base: 88, delta: 0, placeholder: PLACEHOLDER_PERCENT });
    expect(waitingLevelBar(earnedStats({ xp: 3584 }))?.placeholder).toBe(2);
  });

  it("landed on the same level: gold from the old fill to the new", () => {
    expect(landedLevelBar(earnedStats(), earnedStats({ xp: 3544 }))).toEqual({ level: 7, xp: 3544, next: 3600, base: 88, delta: 5, placeholder: 0 });
  });

  it("landed on a new level: the bar wraps — the new level's fill is all gold", () => {
    expect(landedLevelBar(earnedStats(), earnedStats({ level: 8, xp: 3640, xpForNext: 4500 }))).toEqual({
      level: 8,
      xp: 3640,
      next: 4500,
      base: 0,
      delta: 4,
      placeholder: 0,
    });
  });

  it("hides entirely when the api sent no progression block", () => {
    expect(waitingLevelBar(earnedStats({ level: null }))).toBeNull();
    expect(landedLevelBar(earnedStats(), earnedStats({ xp: null }))).toBeNull();
  });
});

describe("earnedKindOf", () => {
  const view = (players: Array<{ id: string }>, you = "p1") => ({ you, players }) as unknown as PlayerView;

  it("casual when every opponent is an easy/medium bot", () => {
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), { p2: "easy" }, "victory", "HERO_DEFEATED", false)).toEqual({ kind: "casual" });
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), { p2: "medium" }, "defeat", "HERO_DEFEATED", false)).toEqual({ kind: "casual" });
  });

  it("counted vs a human, a hard/expert bot, or an unknown room", () => {
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), {}, "victory", "HERO_DEFEATED", false)).toEqual({ kind: "counted", forfeit: false });
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), { p2: "expert" }, "defeat", "HERO_DEFEATED", false)).toEqual({ kind: "counted", forfeit: false });
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), null, "defeat", null, false)).toEqual({ kind: "counted", forfeit: false });
  });

  it("forfeit: your own confirm, or a duel that ended by FORFEIT with you losing — never the opponent's", () => {
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), {}, "defeat", "FORFEIT", false)).toEqual({ kind: "counted", forfeit: true });
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }]), {}, "victory", "FORFEIT", false)).toEqual({ kind: "counted", forfeit: false });
    expect(earnedKindOf(view([{ id: "p1" }, { id: "p2" }, { id: "p3" }]), {}, "defeat", "FORFEIT", true)).toEqual({ kind: "counted", forfeit: true });
  });
});

describe("copy", () => {
  it("points caption with the rim threshold, or 'every rim earned' past the ladder", () => {
    expect(pointsCaption("Hollow Oak", 260, [250, 750, 2000, 5000])).toBe("Hollow Oak cosmetics · 260, rim at 750");
    expect(pointsCaption("Hollow Oak", 6000, [250, 750, 2000, 5000])).toBe("Hollow Oak cosmetics · 6,000, every rim earned");
    expect(pointsCaption("Hollow Oak", null, [250])).toBe("Hollow Oak cosmetics");
  });

  it("streak label: up, ends, unchanged", () => {
    expect(streakLabel({ from: 3, to: 4 })).toBe("Streak 3 → 4");
    expect(streakLabel({ from: 4, to: 0 })).toBe("Streak ends");
    expect(streakLabel({ from: 0, to: 0 })).toBe("Streak 0");
  });

  it("xp line", () => {
    expect(xpLine({ xp: 3544, next: 3600, level: 7 })).toBe("3,544 / 3,600 to level 8");
  });
});
