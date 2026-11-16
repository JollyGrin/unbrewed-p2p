/**
 * "What you earned" arithmetic (p2p #1399): the snapshot, the landing test,
 * the delta, the level bar's three segments, and the casual/forfeit split.
 */
import type { AccountStats } from "@/lib/account/stats";
import type { Badge } from "@/lib/account/badges";
import type { HeroCosmetics } from "@/lib/account/cosmetics";
import { emptyHeroCosmetics } from "@/lib/account/cosmetics";
import type { PlayerView } from "./protocol";
import type { DailyStats, StatsBonuses } from "@/lib/account/bonuses";
import type { Quest } from "@/lib/account/quests";
import {
  EarnedSnapshot,
  EarnedStats,
  PLACEHOLDER_PERCENT,
  PRACTICE_SPENT_CAPTION,
  PRACTICE_SPENT_DAILY_CAPTION,
  bonusRowKey,
  bonusRowText,
  bonusXpTotal,
  doneQuestIds,
  practiceCaptionFor,
  casualGamePays,
  earnedBonuses,
  earnedDelta,
  guestConversionLine,
  guestEstimate,
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
  playedHeroes: [],
  bonuses: null,
  daily: null,
  ...over,
});

const hero = (earned: number | null): HeroCosmetics => ({ ...emptyHeroCosmetics("hollow-oak", true), earned });

const badge = (id: string, unlocked: boolean): Badge => ({ id, name: id, blurb: "", unlocked, unlockedWhy: "" });

const snapshot = (over: Partial<EarnedSnapshot> = {}): EarnedSnapshot => ({
  stats: earnedStats(),
  heroId: "hollow-oak",
  heroPoints: 220,
  unlocked: ["first-win"],
  questsDone: null,
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
    expect(snap?.stats).toEqual({ totalGames: 40, level: null, xp: null, xpForNext: null, streak: null, streakBest: null, playedHeroes: [], bonuses: null, daily: null });
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
      bonuses: [],
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

// --- onboarding (#1656) ------------------------------------------------------

const bonuses = (over: { earned?: boolean; used?: number } = {}): StatsBonuses => ({
  firstGame: { xp: 100, earned: over.earned ?? true },
  practice: { cap: 5, used: over.used ?? 0, xpPerGame: 10, xpPerWin: 5, xp: (over.used ?? 0) * 10 },
  daily: null,
});

const TODAY = "2026-11-16T00:00:00.000Z";
const daily = (over: Partial<DailyStats> = {}): DailyStats => ({
  streak: 2,
  bestStreak: 4,
  playedToday: false,
  wonToday: false,
  playXpToday: 20,
  playXpTomorrow: 25,
  firstWinXp: 20,
  resetsAt: TODAY,
  ...over,
});

const after = (statsOver: Partial<EarnedStats> = {}, over: { heroPoints?: number | null; heroFirstGamePoints?: number | null } = {}) => ({
  stats: earnedStats({ totalGames: 41, ...statsOver }),
  heroPoints: over.heroPoints === undefined ? 220 : over.heroPoints,
  unlocked: [],
  heroFirstGamePoints: over.heroFirstGamePoints === undefined ? 50 : over.heroFirstGamePoints,
});

describe("earnedBonuses: each row from a flag that flipped between the snapshots", () => {
  it("nothing without the blocks: an api before the train yields no rows", () => {
    expect(earnedBonuses(snapshot(), after())).toEqual([]);
    expect(earnedDelta(snapshot(), after()).bonuses).toEqual([]);
  });

  it("First game: `firstGame.earned` flipped, paying the api's xp", () => {
    const before = snapshot({ stats: earnedStats({ totalGames: 0, bonuses: bonuses({ earned: false }) }) });
    expect(earnedBonuses(before, after({ bonuses: { ...bonuses(), firstGame: { xp: 120, earned: true } } }))).toEqual([{ kind: "first-game", xp: 120 }]);
    // Already earned before the game, or still unearned after it: no row.
    expect(earnedBonuses(snapshot({ stats: earnedStats({ bonuses: bonuses() }) }), after({ bonuses: bonuses() }))).toEqual([]);
    expect(earnedBonuses(before, after({ bonuses: bonuses({ earned: false }) }))).toEqual([]);
  });

  it("First game as <hero>: the hero entered byHero and its points moved by the api's constant", () => {
    const before = snapshot({ heroPoints: 0 });
    const played = { playedHeroes: ["hollow-oak"] };
    expect(earnedBonuses(before, after(played, { heroPoints: 90 }))).toEqual([{ kind: "hero-first", points: 50 }]);
    // A hero the pre-game cosmetics never listed (unknown points) still counts off the landed total.
    expect(earnedBonuses(snapshot({ heroPoints: null }), after(played, { heroPoints: 50 }))).toEqual([{ kind: "hero-first", points: 50 }]);
    // Played before; the api published no constant; the points did not move (a forfeit); cosmetics unknown.
    expect(earnedBonuses(snapshot({ heroPoints: 0, stats: earnedStats(played) }), after(played, { heroPoints: 90 }))).toEqual([]);
    expect(earnedBonuses(before, after(played, { heroPoints: 90, heroFirstGamePoints: null }))).toEqual([]);
    expect(earnedBonuses(before, after(played, { heroPoints: 0 }))).toEqual([]);
    expect(earnedBonuses(before, after(played, { heroPoints: null }))).toEqual([]);
  });

  it("Daily bonus: `playedToday` flipped, with the landed streak day and playXpToday", () => {
    const before = snapshot({ stats: earnedStats({ daily: daily() }) });
    expect(earnedBonuses(before, after({ daily: daily({ streak: 3, playedToday: true }) }))).toEqual([{ kind: "daily", day: 3, xp: 20 }]);
    // Second game of the day: already played before it.
    const second = snapshot({ stats: earnedStats({ daily: daily({ streak: 3, playedToday: true }) }) });
    expect(earnedBonuses(second, after({ daily: daily({ streak: 3, playedToday: true }) }))).toEqual([]);
  });

  it("First win today: `wonToday` flipped, so a loss never shows it and a loser keeps the other rows", () => {
    const before = snapshot({ stats: earnedStats({ daily: daily() }) });
    expect(earnedBonuses(before, after({ daily: daily({ streak: 3, playedToday: true, wonToday: true }) }))).toEqual([
      { kind: "daily", day: 3, xp: 20 },
      { kind: "first-win", xp: 20 },
    ]);
    const lost = earnedBonuses(
      snapshot({ heroPoints: 0, stats: earnedStats({ totalGames: 0, daily: daily({ streak: 0 }), bonuses: bonuses({ earned: false }) }) }),
      after({ playedHeroes: ["hollow-oak"], bonuses: bonuses(), daily: daily({ streak: 1, playedToday: true, playXpToday: 10 }) }, { heroPoints: 50 }),
    );
    expect(lost).toEqual([
      { kind: "first-game", xp: 100 },
      { kind: "hero-first", points: 50 },
      { kind: "daily", day: 1, xp: 10 },
    ]);
  });

  it("a page left open across UTC midnight: yesterday's flags do not hide today's bonus", () => {
    const yesterday = snapshot({ stats: earnedStats({ daily: daily({ playedToday: true, wonToday: true, resetsAt: "2026-11-15T00:00:00.000Z" }) }) });
    expect(earnedBonuses(yesterday, after({ daily: daily({ streak: 3, playedToday: true, wonToday: true }) }))).toEqual([
      { kind: "daily", day: 3, xp: 20 },
      { kind: "first-win", xp: 20 },
    ]);
  });

  it("the rows' words", () => {
    expect(bonusRowText({ kind: "first-game", xp: 100 }, "Hollow Oak")).toEqual({ label: "First game", amount: "+100" });
    expect(bonusRowText({ kind: "hero-first", points: 50 }, "Hollow Oak")).toEqual({ label: "First game as Hollow Oak", amount: "+50 points" });
    expect(bonusRowText({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak")).toEqual({ label: "Daily bonus · day 3", amount: "+20" });
    expect(bonusRowText({ kind: "first-win", xp: 20 }, "Hollow Oak")).toEqual({ label: "First win today", amount: "+20" });
  });
});

describe("casualGamePays: the easy/medium poll decision", () => {
  const NOW = Date.parse("2026-11-15T12:00:00.000Z");
  const played = [{ heroId: "hollow-oak", heroName: "Hollow Oak", games: 9, wins: 4 }];
  const settled = { byHero: played, bonuses: bonuses({ used: 5 }), daily: daily({ playedToday: true }) };

  it("never without the blocks, or without stats: today's behaviour", () => {
    expect(casualGamePays(null, "hollow-oak", NOW)).toBeNull();
    expect(casualGamePays(stats(), "hollow-oak", NOW)).toBeNull();
    expect(casualGamePays(stats({ totalGames: 0 }), "hollow-oak", NOW)).toBeNull();
  });

  it("the account's first game", () => {
    expect(casualGamePays(stats({ ...settled, totalGames: 0, bonuses: bonuses({ earned: false, used: 5 }) }), "hollow-oak", NOW)).toBe("first-game");
    // No firstGame block: zero finished games says the same thing.
    expect(casualGamePays(stats({ ...settled, totalGames: 0, bonuses: { firstGame: null, practice: null, daily: null } }), "hollow-oak", NOW)).toBe("first-game");
  });

  it("practice games under the cap pay; at the cap they stop", () => {
    expect(casualGamePays(stats({ ...settled, bonuses: bonuses({ used: 4 }) }), "hollow-oak", NOW)).toBe("practice");
    expect(casualGamePays(stats(settled), "hollow-oak", NOW)).toBeNull();
    expect(casualGamePays(stats({ ...settled, bonuses: bonuses({ used: 9 }) }), "hollow-oak", NOW)).toBeNull();
  });

  it("past the cap, the day's first game still pays the daily bonus", () => {
    expect(casualGamePays(stats({ ...settled, daily: daily() }), "hollow-oak", NOW)).toBe("daily");
    // Played "today", but that day is over.
    expect(casualGamePays(stats(settled), "hollow-oak", Date.parse(TODAY) + 1)).toBe("daily");
  });

  it("past the cap, a hero's first game still pays its points", () => {
    expect(casualGamePays(stats(settled), "kenshiro", NOW)).toBe("hero-first");
    expect(casualGamePays(stats({ ...settled, bonuses: null }), "kenshiro", NOW)).toBeNull();
  });
});

describe("the guest estimate", () => {
  it("a new account's first game, from the contract's constants", () => {
    // practice win (#1666): 100 first game + 15 flat practice + 10 day one + 20 first win + 30 "Win a game" quest
    expect(guestEstimate(true, true)).toEqual({ xp: 175, heroPoints: 50, exact: true });
    // a loss completes no quest and has no first win: 100 + 15 + 10
    expect(guestEstimate(true, false)).toEqual({ xp: 125, heroPoints: 50, exact: true });
    // a counted game: its own XP is the api's, so the bonuses are a floor
    expect(guestEstimate(false, true)).toEqual({ xp: 160, heroPoints: 50, exact: false });
    expect(guestEstimate(false, false)).toEqual({ xp: 110, heroPoints: 50, exact: false });
  });

  it("the line", () => {
    expect(guestConversionLine(guestEstimate(true, true), "Hollow Oak")).toBe(
      "Sign in to keep this: you would have earned about 175 XP and 50 Hollow Oak points.",
    );
    expect(guestConversionLine(guestEstimate(false, false), "Hollow Oak")).toBe(
      "Sign in to keep this: you would have earned at least 110 XP and 50 Hollow Oak points.",
    );
  });
});

// --- onboarding polish (#1666) -------------------------------------------------

const quest = (id: string, done: boolean, xp: number | null = 30, title = id): Quest => ({
  id,
  title,
  description: "",
  reward: xp === null ? null : { xp, heroPoints: null, note: null },
  progress: { current: done ? 1 : 0, target: 1 },
  done,
});

/** `bonuses` with the flat practice pay and the quests total of the sibling api ticket. */
const paid = (over: { earned?: boolean; used?: number; practiceXp?: number; quests?: number | null } = {}): StatsBonuses => ({
  firstGame: { xp: 100, earned: over.earned ?? true },
  practice: { cap: 5, used: over.used ?? 0, xpPerGame: 15, xpPerWin: 0, xp: over.practiceXp ?? (over.used ?? 0) * 15 },
  daily: null,
  ...(over.quests === null ? {} : { quests: { xp: over.quests ?? 0 } }),
});

describe("the practice row (#1666): the `bonuses.practice.xp` delta", () => {
  it("'Practice game 2 of 5 +15' when the lifetime practice XP moved", () => {
    const before = snapshot({ stats: earnedStats({ bonuses: paid({ used: 1 }) }) });
    const rows = earnedBonuses(before, after({ bonuses: paid({ used: 2 }) }));
    expect(rows).toEqual([{ kind: "practice", game: 2, cap: 5, xp: 15 }]);
    expect(bonusRowText(rows[0], "Hollow Oak")).toEqual({ label: "Practice game 2 of 5", amount: "+15" });
  });

  it("no row when the practice XP did not move: past the cap, a counted game, or no block", () => {
    const spent = snapshot({ stats: earnedStats({ bonuses: paid({ used: 5 }) }) });
    expect(earnedBonuses(spent, after({ bonuses: paid({ used: 5 }) }))).toEqual([]);
    expect(earnedBonuses(snapshot(), after({ bonuses: paid({ used: 2 }) }))).toEqual([]);
    expect(earnedBonuses(spent, after())).toEqual([]);
  });

  it("pay with no new practice game counted is a row without a game number", () => {
    const before = snapshot({ stats: earnedStats({ bonuses: paid({ used: 5, practiceXp: 70 }) }) });
    const rows = earnedBonuses(before, after({ bonuses: paid({ used: 5, practiceXp: 75 }) }));
    expect(rows).toEqual([{ kind: "practice", game: null, cap: 5, xp: 5 }]);
    expect(bonusRowText(rows[0], "Hollow Oak")).toEqual({ label: "Practice game", amount: "+5" });
  });
});

describe("the quest rows (#1666): `/me/quests` flips checked against the `bonuses.quests.xp` delta", () => {
  const board = [quest("first-game", true, null, "Play your first game"), quest("first-win", true, 30, "Win a game"), quest("harder-bot", false)];

  it("'Quest complete: Win a game +30': the row flipped and the total moved by the same amount", () => {
    const before = snapshot({ questsDone: [], stats: earnedStats({ bonuses: paid({ quests: 0 }) }) });
    const rows = earnedBonuses(before, { ...after({ bonuses: paid({ quests: 30 }) }), quests: board });
    expect(rows).toEqual([{ kind: "quest", id: "first-win", title: "Win a game", xp: 30 }]);
    expect(bonusRowText(rows[0], "Hollow Oak")).toEqual({ label: "Quest complete: Win a game", amount: "+30" });
  });

  it("a quest already done before the game, one that pays no XP, and one still open are not rows", () => {
    const before = snapshot({ questsDone: ["first-win"], stats: earnedStats({ bonuses: paid({ quests: 30 }) }) });
    expect(earnedBonuses(before, { ...after({ bonuses: paid({ quests: 30 }) }), quests: board })).toEqual([]);
  });

  it("the total moved but the board cannot say which quest (no baseline, or a cached board): one untitled row for the api's amount", () => {
    const stats = earnedStats({ bonuses: paid({ quests: 0 }) });
    const landedSide = after({ bonuses: paid({ quests: 30 }) });
    const untitled = [{ kind: "quest", id: null, title: null, xp: 30 }];
    expect(earnedBonuses(snapshot({ stats }), { ...landedSide, quests: board })).toEqual(untitled);
    expect(earnedBonuses(snapshot({ stats, questsDone: [] }), landedSide)).toEqual(untitled);
    expect(earnedBonuses(snapshot({ stats, questsDone: [] }), { ...landedSide, quests: [quest("first-win", false)] })).toEqual(untitled);
    expect(bonusRowText(untitled[0] as never, "Hollow Oak")).toEqual({ label: "Quest complete", amount: "+30" });
  });

  it("the total did not move: a stale pre-game board never invents a row", () => {
    const before = snapshot({ questsDone: [], stats: earnedStats({ bonuses: paid({ quests: 30 }) }) });
    expect(earnedBonuses(before, { ...after({ bonuses: paid({ quests: 30 }) }), quests: board })).toEqual([]);
  });

  it("an api without `bonuses.quests`: the flipped rows stand on their own, and with no board there is nothing", () => {
    const before = snapshot({ questsDone: [], stats: earnedStats({ bonuses: paid({ quests: null }) }) });
    const landedSide = after({ bonuses: paid({ quests: null }) });
    expect(earnedBonuses(before, { ...landedSide, quests: board })).toEqual([{ kind: "quest", id: "first-win", title: "Win a game", xp: 30 }]);
    expect(earnedBonuses(before, landedSide)).toEqual([]);
    expect(earnedBonuses(snapshot({ stats: before.stats }), { ...landedSide, quests: board })).toEqual([]);
  });

  it("two quests in one game are two rows with their own keys", () => {
    const before = snapshot({ questsDone: [], stats: earnedStats({ bonuses: paid({ quests: 0 }) }) });
    const rows = earnedBonuses(before, { ...after({ bonuses: paid({ quests: 60 }) }), quests: [quest("first-win", true), quest("harder-bot", true)] });
    expect(rows.map(bonusRowKey)).toEqual(["quest:first-win", "quest:harder-bot"]);
    expect(bonusRowKey({ kind: "daily", day: 1, xp: 10 })).toBe("daily");
  });

  it("doneQuestIds: the api's verdict, nothing inferred", () => {
    expect(doneQuestIds(board)).toEqual(["first-game", "first-win"]);
  });
});

describe("the rows add up to the headline (#1666)", () => {
  it("a new account's first easy-bot win: 100 + 15 + 10 + 20 + 30 = +175", () => {
    const before = snapshot({
      heroPoints: 0,
      questsDone: [],
      stats: earnedStats({ totalGames: 0, level: 0, xp: 0, xpForNext: 100, bonuses: paid({ earned: false, quests: 0 }), daily: daily({ streak: 0 }) }),
    });
    const landedSide = {
      ...after(
        {
          totalGames: 1,
          level: 1,
          xp: 175,
          xpForNext: 300,
          playedHeroes: ["hollow-oak"],
          bonuses: paid({ used: 1, quests: 30 }),
          daily: daily({ streak: 1, playedToday: true, wonToday: true, playXpToday: 10 }),
        },
        { heroPoints: 50 },
      ),
      quests: [quest("first-win", true, 30, "Win a game")],
    };
    const delta = earnedDelta(before, landedSide);
    expect(delta.bonuses.map((row) => bonusRowText(row, "King Kong"))).toEqual([
      { label: "First game", amount: "+100" },
      { label: "Practice game 1 of 5", amount: "+15" },
      { label: "First game as King Kong", amount: "+50 points" },
      { label: "Daily bonus · day 1", amount: "+10" },
      { label: "First win today", amount: "+20" },
      { label: "Quest complete: Win a game", amount: "+30" },
    ]);
    expect(delta.xp).toBe(175);
    // A practice game has no XP of its own, so the rows are the whole headline.
    expect(bonusXpTotal(delta.bonuses)).toBe(delta.xp);
  });

  it("the same game on an older api (no quests total, no flat pay, no board) keeps its #1656 rows", () => {
    const old = (used: number, earned: boolean): StatsBonuses => ({ firstGame: { xp: 100, earned }, practice: { cap: 5, used, xpPerGame: 10, xpPerWin: 5, xp: used * 15 }, daily: null });
    const before = snapshot({ heroPoints: 0, stats: earnedStats({ totalGames: 0, bonuses: old(0, false), daily: daily({ streak: 0 }) }) });
    const rows = earnedBonuses(before, after({ playedHeroes: ["hollow-oak"], bonuses: old(1, true), daily: daily({ streak: 1, playedToday: true, wonToday: true, playXpToday: 10 }) }, { heroPoints: 50 }));
    expect(rows.map((row) => row.kind)).toEqual(["first-game", "practice", "hero-first", "daily", "first-win"]);
  });
});

describe("the practice caption (#1666)", () => {
  it("a paid practice game keeps 'Practice game N of 5'", () => {
    expect(practiceCaptionFor({ used: 3, cap: 5 }, [{ kind: "practice", game: 3, cap: 5, xp: 15 }])).toBe("Practice game 3 of 5 · XP only, not in your record");
    // The 5th paid game is still a paid one.
    expect(practiceCaptionFor({ used: 5, cap: 5 }, [{ kind: "practice", game: 5, cap: 5, xp: 15 }])).toBe("Practice game 5 of 5 · XP only, not in your record");
    // An older api whose practice XP the client cannot diff: under the cap reads as before.
    expect(practiceCaptionFor({ used: 3, cap: 5 }, [])).toBe("Practice game 3 of 5 · XP only, not in your record");
  });

  it("a 6th game that landed only on the daily bonus says practice pay is used up and today's bonus paid", () => {
    const rows = [{ kind: "daily", day: 1, xp: 10 }, { kind: "first-win", xp: 20 }] as const;
    expect(practiceCaptionFor({ used: 5, cap: 5 }, rows)).toBe(PRACTICE_SPENT_DAILY_CAPTION);
    expect(PRACTICE_SPENT_DAILY_CAPTION).toBe("Practice pay is used up · today's bonus is what paid, not in your record");
    expect(practiceCaptionFor({ used: 6, cap: 5 }, rows)).not.toMatch(/of 5/);
  });

  it("past the cap with no daily row (a hero's first game paid points): used up, and no claim about today", () => {
    expect(practiceCaptionFor({ used: 5, cap: 5 }, [{ kind: "hero-first", points: 50 }])).toBe(PRACTICE_SPENT_CAPTION);
    // Pay that counted no new practice game is not "game 5 of 5" either.
    expect(practiceCaptionFor({ used: 5, cap: 5 }, [{ kind: "practice", game: null, cap: 5, xp: 5 }])).toBe(PRACTICE_SPENT_CAPTION);
  });
});
