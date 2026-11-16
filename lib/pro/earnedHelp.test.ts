/**
 * The "?" help copy on the post-game earned card (p2p #1670): one or two
 * sentences per row kind, every amount read from the api's blocks, and a
 * sentence dropped (never guessed) when its value is missing.
 */
import { EarnedHelpContext, PRACTICE_HELP_ASK, bonusRowHelp, dailyResetClock, practiceHelp } from "./earned";

const practice = { cap: 5, xpPerGame: 15, xpPerWin: 0 };
const daily = { playXpTomorrow: 25, firstWinXp: 20, resetsAt: "2026-11-17T00:00:00.000Z" };
const ctx: EarnedHelpContext = { practice, daily };

describe("practiceHelp", () => {
  it("says what a practice game is, what the first `cap` pay, and what always pays", () => {
    expect(practiceHelp(practice)).toEqual({
      ask: "What is a practice game?",
      text: "Easy and medium bots are practice games. Your first 5 pay 15 XP each, win or lose; after that they pay no XP. Hard and expert bots and games against people always pay.",
    });
  });

  it("reads both numbers from the block: a different economy is a different sentence", () => {
    expect(practiceHelp({ cap: 8, xpPerGame: 40, xpPerWin: 0 }).text).toContain("Your first 8 pay 40 XP each, win or lose;");
  });

  it("an api that pays a win more does not get 'win or lose'", () => {
    const { text } = practiceHelp({ cap: 5, xpPerGame: 10, xpPerWin: 5 });
    expect(text).toContain("Your first 5 pay 10 XP each, plus 5 for a win;");
    expect(text).not.toContain("win or lose");
  });

  it("no per-game amount: the sentence keeps the cap and names no number", () => {
    expect(practiceHelp({ cap: 5 }).text).toBe(
      "Easy and medium bots are practice games. Your first 5 pay XP; after that they pay no XP. Hard and expert bots and games against people always pay.",
    );
    expect(practiceHelp({ cap: 5, xpPerGame: 0, xpPerWin: 0 }).text).toContain("Your first 5 pay XP;");
  });

  it("no practice block (or a zero cap): the paid-games sentence is dropped", () => {
    const bare = "Easy and medium bots are practice games. Hard and expert bots and games against people always pay.";
    expect(practiceHelp(null).text).toBe(bare);
    expect(practiceHelp(undefined).text).toBe(bare);
    expect(practiceHelp({ cap: 0, xpPerGame: 15, xpPerWin: 0 }).text).toBe(bare);
    expect(practiceHelp(null).ask).toBe(PRACTICE_HELP_ASK);
  });
});

describe("dailyResetClock", () => {
  it("is the UTC clock time of `resetsAt`", () => {
    expect(dailyResetClock("2026-11-17T00:00:00.000Z")).toBe("00:00 UTC");
    expect(dailyResetClock("2026-11-17T04:30:00.000Z")).toBe("04:30 UTC");
    // An offset in the string is still reported in UTC.
    expect(dailyResetClock("2026-11-17T02:00:00.000+02:00")).toBe("00:00 UTC");
  });

  it("null for a missing or unreadable time", () => {
    expect(dailyResetClock(null)).toBeNull();
    expect(dailyResetClock(undefined)).toBeNull();
    expect(dailyResetClock("")).toBeNull();
    expect(dailyResetClock("soon")).toBeNull();
  });
});

describe("bonusRowHelp: each kind", () => {
  it("first game", () => {
    expect(bonusRowHelp({ kind: "first-game", xp: 100 }, "Hollow Oak", ctx)).toEqual({
      ask: "What is the first game bonus?",
      text: "A one-off bonus for finishing your first game.",
    });
  });

  it("practice: the practice explanation, with the api's block", () => {
    expect(bonusRowHelp({ kind: "practice", game: 3, cap: 5, xp: 15 }, "Hollow Oak", ctx)).toEqual(practiceHelp(practice));
  });

  it("practice without the block: the row's own cap, and no amount", () => {
    expect(bonusRowHelp({ kind: "practice", game: 3, cap: 5, xp: 15 }, "Hollow Oak").text).toBe(practiceHelp({ cap: 5 }).text);
    expect(bonusRowHelp({ kind: "practice", game: null, cap: 5, xp: 15 }, "Hollow Oak", { practice: null }).text).toContain("Your first 5 pay XP;");
  });

  it("first game as a hero: one-off per hero, the api's points", () => {
    expect(bonusRowHelp({ kind: "hero-first", points: 50 }, "Hollow Oak", ctx)).toEqual({
      ask: "What is the first game as Hollow Oak bonus?",
      text: "A one-off for each hero: your first game as Hollow Oak pays 50 points, enough for that hero's first card upgrade.",
    });
    expect(bonusRowHelp({ kind: "hero-first", points: 1200 }, "Medusa", ctx).text).toContain("your first game as Medusa pays 1,200 points");
    expect(bonusRowHelp({ kind: "hero-first", points: 0 }, "Medusa", ctx).text).not.toMatch(/\d/);
  });

  it("daily: grows with consecutive days, what tomorrow pays, when the day rolls over", () => {
    expect(bonusRowHelp({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak", ctx)).toEqual({
      ask: "What is the daily bonus?",
      text: "Your first game of each day pays a bonus that grows with every day in a row you play. Tomorrow pays +25 XP. Days roll over at 00:00 UTC.",
    });
  });

  it("daily: a missing value drops its sentence", () => {
    const first = "Your first game of each day pays a bonus that grows with every day in a row you play.";
    expect(bonusRowHelp({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak").text).toBe(first);
    expect(bonusRowHelp({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak", { daily: null }).text).toBe(first);
    expect(bonusRowHelp({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak", { daily: { ...daily, resetsAt: null } }).text).toBe(
      `${first} Tomorrow pays +25 XP.`,
    );
    expect(bonusRowHelp({ kind: "daily", day: 3, xp: 20 }, "Hollow Oak", { daily: { ...daily, playXpTomorrow: 0 } }).text).toBe(
      `${first} Days roll over at 00:00 UTC.`,
    );
  });

  it("first win of the day: once a day, on top of the daily bonus, the api's amount", () => {
    expect(bonusRowHelp({ kind: "first-win", xp: 20 }, "Hollow Oak", ctx)).toEqual({
      ask: "What is the first win bonus?",
      text: "Your first win of each day pays +20 XP, once a day, on top of the daily bonus.",
    });
    expect(bonusRowHelp({ kind: "first-win", xp: 20 }, "Hollow Oak", { daily: { ...daily, firstWinXp: 35 } }).text).toContain("+35 XP");
    expect(bonusRowHelp({ kind: "first-win", xp: 20 }, "Hollow Oak").text).toBe(
      "Your first win of each day pays a bonus, once a day, on top of the daily bonus.",
    );
  });

  it("quest: named or not, the same explanation", () => {
    const help = {
      ask: "What is a quest?",
      text: "This game completed one of your starter quests. Your quests are listed on your account page.",
    };
    expect(bonusRowHelp({ kind: "quest", id: "first-win", title: "Win a game", xp: 30 }, "Hollow Oak", ctx)).toEqual(help);
    expect(bonusRowHelp({ kind: "quest", id: null, title: null, xp: 30 }, "Hollow Oak")).toEqual(help);
  });

  it("every kind is one or two short sentences... three at most, and never empty", () => {
    const rows = [
      { kind: "first-game", xp: 100 },
      { kind: "practice", game: 1, cap: 5, xp: 15 },
      { kind: "hero-first", points: 50 },
      { kind: "daily", day: 1, xp: 10 },
      { kind: "first-win", xp: 20 },
      { kind: "quest", id: "q", title: "Win a game", xp: 30 },
    ] as const;
    for (const row of rows) {
      const help = bonusRowHelp(row, "Hollow Oak", ctx);
      expect(help.ask).toMatch(/^What is .+\?$/);
      expect(help.text.length).toBeGreaterThan(20);
      expect(help.text.length).toBeLessThan(200);
    }
  });
});
