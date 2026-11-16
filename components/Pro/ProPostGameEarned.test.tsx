/**
 * The "What you earned" card (p2p #1399): the waiting state shows a shape and
 * no number, the landed state shows the deltas (with the level-up wrap), the
 * timeout keeps the waiting visuals under the fallback caption, and the
 * casual / forfeit branches reuse the existing no-XP / no-points copy.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CASUAL_SPLIT_NOTE } from "@/components/Account/AccountStats";
import { FORFEIT_POINTS_NOTE } from "@/components/Pro/ForfeitDialog";
import type { DailyStats, StatsBonuses } from "@/lib/account/bonuses";
import { EARNED_TIMEOUT_CAPTION, EARNED_WAITING_CAPTION, EarnedSnapshot, PRACTICE_POINTS_NOTE, PRACTICE_SPENT_DAILY_CAPTION } from "@/lib/pro/earned";
import type { EarnedLanded, EarnedPending, GameEarnedView } from "@/lib/pro/useGameEarned";
import { PLACEHOLDER_HATCH, ProPostGameEarned } from "./ProPostGameEarned";

const before: EarnedSnapshot = {
  stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
  heroId: "hollow-oak",
  heroPoints: 220,
  unlocked: ["first-win"],
};
const thresholds = [250, 750, 2000, 5000];

const waiting = (over: Partial<EarnedPending> = {}): EarnedPending => ({
  phase: "waiting",
  before,
  forfeit: false,
  practice: false,
  thresholds,
  ...over,
});

const landed = (over: Partial<EarnedLanded> = {}): EarnedLanded => ({
  phase: "landed",
  before,
  after: { totalGames: 41, level: 7, xp: 3544, xpForNext: 3600, streak: 4, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
  delta: { xp: 40, level: 7, levelUp: false, points: 40, heroPoints: 260, streak: { from: 3, to: 4 }, newBadges: [], bonuses: [] },
  forfeit: false,
  practice: false,
  thresholds,
  ...over,
});

const draw = (view: GameEarnedView) => render(<ProPostGameEarned view={view} heroName="Hollow Oak" />);

describe("waiting", () => {
  it("pre-game fill + hatched placeholder, 'XP counting…', hero pts…, the counting caption — and no delta number anywhere", () => {
    draw(waiting());
    expect(screen.getByTestId("post-game-earned-card")).toHaveAttribute("data-phase", "waiting");
    expect(screen.getByTestId("post-game-level-title")).toHaveTextContent("Level 7");
    expect(screen.getByTestId("post-game-xp-counting")).toHaveTextContent("XP counting…");
    expect(screen.getByTestId("post-game-xp-line")).toHaveTextContent("3,504 / 3,600 to level 8");
    expect(screen.getByTestId("post-game-level-base")).toHaveStyle({ width: "88%" });
    expect(screen.getByTestId("post-game-level-placeholder")).toHaveStyle({ backgroundImage: PLACEHOLDER_HATCH });
    expect(screen.queryByTestId("post-game-level-delta")).toBeNull();
    expect(screen.queryByTestId("post-game-xp-delta")).toBeNull();
    expect(screen.getByTestId("post-game-earned-caption")).toHaveTextContent(EARNED_WAITING_CAPTION);
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("Hollow Oak pts…");
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("Hollow Oak cosmetics · 220, rim at 250");
    expect(screen.getByTestId("post-game-streak")).toHaveTextContent("Streak 3");
    expect(screen.getByTestId("post-game-badge")).toHaveTextContent("No new badge");
    expect(screen.getByTestId("post-game-earned-card")).not.toHaveTextContent("+");
  });

  it("timeout: the same waiting visuals under the calm fallback caption", () => {
    draw(waiting({ phase: "timeout" }));
    expect(screen.getByTestId("post-game-earned-card")).toHaveAttribute("data-phase", "timeout");
    expect(screen.getByTestId("post-game-level-placeholder")).toBeInTheDocument();
    expect(screen.getByTestId("post-game-xp-counting")).toBeInTheDocument();
    expect(screen.getByTestId("post-game-earned-caption")).toHaveTextContent(EARNED_TIMEOUT_CAPTION);
  });
});

describe("landed", () => {
  it("+N XP in gold beside the level, the gold segment, points with rim progress, streak change, no new badge", () => {
    draw(landed());
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+40 XP");
    expect(screen.getByTestId("post-game-level-title")).toHaveTextContent("Level 7");
    expect(screen.getByTestId("post-game-level-title")).toHaveAttribute("data-level-up", "false");
    expect(screen.getByTestId("post-game-xp-line")).toHaveTextContent("3,544 / 3,600 to level 8");
    expect(screen.getByTestId("post-game-level-base")).toHaveStyle({ width: "88%" });
    expect(screen.getByTestId("post-game-level-delta")).toHaveStyle({ width: "5%" });
    expect(screen.queryByTestId("post-game-level-placeholder")).toBeNull();
    expect(screen.queryByTestId("post-game-xp-counting")).toBeNull();
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("+40 pts");
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("Hollow Oak cosmetics · 260, rim at 750");
    expect(screen.getByTestId("post-game-streak")).toHaveTextContent("Streak 3 → 4");
    expect(screen.getByTestId("post-game-streak")).toHaveTextContent("best 6");
    expect(screen.getByTestId("post-game-badge")).toHaveTextContent("No new badge");
  });

  it("level-up: the title reads the new level, the bar wraps from 0, the streak that ends says so", () => {
    draw(
      landed({
        after: { totalGames: 41, level: 8, xp: 3640, xpForNext: 4500, streak: 0, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
        delta: { xp: 136, level: 8, levelUp: true, points: 40, heroPoints: 260, streak: { from: 3, to: 0 }, newBadges: [], bonuses: [] },
      }),
    );
    expect(screen.getByTestId("post-game-level-title")).toHaveTextContent("Level 8");
    expect(screen.getByTestId("post-game-level-title")).toHaveAttribute("data-level-up", "true");
    expect(screen.getByTestId("post-game-level-base")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("post-game-level-delta")).toHaveStyle({ width: "4%" });
    expect(screen.getByTestId("post-game-xp-line")).toHaveTextContent("3,640 / 4,500 to level 9");
    expect(screen.getByTestId("post-game-streak")).toHaveTextContent("Streak ends");
  });

  it("a badge unlocked by this game: glyph + name, lit", () => {
    draw(landed({ delta: { ...landed().delta, newBadges: ["first-win"] } }));
    const tile = screen.getByTestId("post-game-badge");
    expect(tile.querySelector('[data-testid="badge-glyph"]')).toHaveAttribute("data-badge-id", "first-win");
    expect(tile).not.toHaveTextContent("No new badge");
    expect(tile).toHaveTextContent("badge unlocked");
  });
});

describe("casual and forfeit", () => {
  it("casual tiers: the account page's no-XP note instead of the bar", () => {
    draw({ phase: "casual", practiceCap: null });
    expect(screen.getByTestId("post-game-earned-note")).toHaveTextContent(CASUAL_SPLIT_NOTE);
    expect(screen.queryByTestId("post-game-level")).toBeNull();
    expect(screen.queryByTestId("post-game-points")).toBeNull();
  });

  it("a forfeit keeps the XP bar but the points tile carries the forfeit note, waiting or landed", () => {
    const { rerender } = draw(waiting({ forfeit: true }));
    expect(screen.getByTestId("post-game-level")).toBeInTheDocument();
    expect(screen.getByTestId("post-game-points")).toHaveTextContent(FORFEIT_POINTS_NOTE);
    rerender(<ProPostGameEarned view={landed({ forfeit: true })} heroName="Hollow Oak" />);
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+40 XP");
    expect(screen.getByTestId("post-game-points")).toHaveTextContent(FORFEIT_POINTS_NOTE);
    expect(screen.getByTestId("post-game-points")).not.toHaveTextContent("+40 pts");
  });

  it("no baseline: one quiet line, no bar", () => {
    draw({ phase: "no-baseline" });
    expect(screen.getByTestId("post-game-earned-note")).toHaveTextContent(/profile catches up/);
    expect(screen.queryByTestId("post-game-level")).toBeNull();
  });
});

describe("Quick Play multiplier (#1542)", () => {
  it("captions a quick-play game's XP with its multiplier, waiting or landed", () => {
    const { unmount } = render(<ProPostGameEarned view={landed()} heroName="Hollow Oak" xpMultiplier={2} />);
    expect(screen.getByTestId("post-game-xp-multiplier")).toHaveTextContent("2× Quick Play");
    // The number is still the server's (it already paid the bonus).
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+40 XP");
    unmount();
    render(<ProPostGameEarned view={waiting()} heroName="Hollow Oak" xpMultiplier={2} />);
    expect(screen.getByTestId("post-game-xp-multiplier")).toHaveTextContent("2× Quick Play");
  });

  it("says nothing for an ordinary (Create room / bot) game", () => {
    const { unmount } = render(<ProPostGameEarned view={landed()} heroName="Hollow Oak" xpMultiplier={1} />);
    expect(screen.queryByTestId("post-game-xp-multiplier")).toBeNull();
    unmount();
    draw(landed());
    expect(screen.queryByTestId("post-game-xp-multiplier")).toBeNull();
  });
});

// --- onboarding (#1656) ------------------------------------------------------

const bonuses = (used: number, firstGame = true): StatsBonuses => ({
  firstGame: { xp: 100, earned: firstGame },
  practice: { cap: 5, used, xpPerGame: 10, xpPerWin: 5, xp: used * 10 },
  daily: null,
});

const daily = (over: Partial<DailyStats> = {}): DailyStats => ({
  streak: 3,
  bestStreak: 4,
  playedToday: true,
  wonToday: true,
  playXpToday: 20,
  playXpTomorrow: 25,
  firstWinXp: 20,
  resetsAt: "2026-11-16T00:00:00.000Z",
  ...over,
});

describe("practice games (#1656)", () => {
  it("past the cap: the note says the first 5 practice games paid, and still no bar", () => {
    draw({ phase: "casual", practiceCap: 5 });
    expect(screen.getByTestId("post-game-earned-note")).toHaveTextContent("No XP · your first 5 practice games paid");
    expect(screen.getByTestId("post-game-earned-note-body")).toHaveTextContent("The first 5 paid XP");
    expect(screen.queryByTestId("post-game-level")).toBeNull();
  });

  it("a paid practice game is drawn like a counted one: the XP, the 'game 3 of 5' caption, and a points tile that says XP only", () => {
    draw(
      landed({
        practice: true,
        after: { ...landed().after, xp: 3519, bonuses: bonuses(3) },
        delta: { ...landed().delta, xp: 15, points: 0, heroPoints: 220 },
      }),
    );
    expect(screen.getByTestId("post-game-earned-card")).toHaveAttribute("data-phase", "landed");
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+15 XP");
    expect(screen.getByTestId("post-game-practice-caption")).toHaveTextContent("Practice game 3 of 5 · XP only, not in your record");
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("No points");
    expect(screen.getByTestId("post-game-points")).toHaveTextContent(PRACTICE_POINTS_NOTE);
  });

  it("a practice game that paid hero points (the hero's first) keeps the real points tile", () => {
    draw(landed({ practice: true, delta: { ...landed().delta, points: 50, heroPoints: 50 } }));
    expect(screen.getByTestId("post-game-points")).toHaveTextContent("+50 pts");
  });
});

describe("bonus rows (#1656)", () => {
  it("one line per bonus the game triggered, under the bar, in the ticket's words", () => {
    draw(
      landed({
        delta: {
          ...landed().delta,
          bonuses: [
            { kind: "first-game", xp: 100 },
            { kind: "hero-first", points: 50 },
            { kind: "daily", day: 3, xp: 20 },
            { kind: "first-win", xp: 20 },
          ],
        },
      }),
    );
    expect(screen.getAllByTestId("post-game-bonus").map((row) => row.textContent)).toEqual([
      "First game+100",
      "First game as Hollow Oak+50 points",
      "Daily bonus · day 3+20",
      "First win today+20",
    ]);
  });

  it("no rows while counting, and none on a landed game that triggered nothing", () => {
    const { rerender } = draw(waiting());
    expect(screen.queryByTestId("post-game-bonuses")).toBeNull();
    rerender(<ProPostGameEarned view={landed()} heroName="Hollow Oak" />);
    expect(screen.queryByTestId("post-game-bonuses")).toBeNull();
  });
});

describe("the daily streak tile (#1656)", () => {
  it("absent without a daily block: the three #1399 tiles and nothing else", () => {
    draw(landed());
    expect(screen.queryByTestId("post-game-daily")).toBeNull();
    expect(screen.getByTestId("post-game-points").parentElement?.children).toHaveLength(3);
  });

  it("landed: 'Day N streak' and what tomorrow pays, from the landed block", () => {
    draw(landed({ after: { ...landed().after, daily: daily() } }));
    const tile = screen.getByTestId("post-game-daily");
    expect(tile).toHaveTextContent("Day 3 streak");
    expect(tile).toHaveTextContent("Tomorrow: +25 XP");
  });

  it("counting: the day the page already knew, or a shape when today had not started", () => {
    const { rerender } = draw(waiting({ before: { ...before, stats: { ...before.stats, daily: daily({ streak: 2, playedToday: false }) } } }));
    expect(screen.getByTestId("post-game-daily")).toHaveTextContent("Daily streak…");
    expect(screen.getByTestId("post-game-daily")).not.toHaveTextContent("Day 2");
    rerender(
      <ProPostGameEarned view={waiting({ before: { ...before, stats: { ...before.stats, daily: daily() } } })} heroName="Hollow Oak" />,
    );
    expect(screen.getByTestId("post-game-daily")).toHaveTextContent("Day 3 streak");
    expect(screen.getByTestId("post-game-daily")).toHaveTextContent("updates once recorded");
  });
});

describe("onboarding polish (#1666)", () => {
  it("a new account's first easy-bot win: the rows under '+175 XP' add up to it", () => {
    draw(
      landed({
        practice: true,
        after: { ...landed().after, level: 1, xp: 175, xpForNext: 300, bonuses: bonuses(1) },
        delta: {
          ...landed().delta,
          xp: 175,
          points: 50,
          heroPoints: 50,
          bonuses: [
            { kind: "first-game", xp: 100 },
            { kind: "practice", game: 1, cap: 5, xp: 15 },
            { kind: "hero-first", points: 50 },
            { kind: "daily", day: 1, xp: 10 },
            { kind: "first-win", xp: 20 },
            { kind: "quest", id: "first-win", title: "Win a game", xp: 30 },
          ],
        },
      }),
    );
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+175 XP");
    const rows = screen.getAllByTestId("post-game-bonus").map((row) => row.textContent ?? "");
    expect(rows).toEqual([
      "First game+100",
      "Practice game 1 of 5+15",
      "First game as Hollow Oak+50 points",
      "Daily bonus · day 1+10",
      "First win today+20",
      "Quest complete: Win a game+30",
    ]);
    const xp = rows.filter((row) => !row.endsWith("points")).reduce((sum, row) => sum + Number(row.slice(row.lastIndexOf("+") + 1)), 0);
    expect(xp).toBe(175);
    expect(screen.getByTestId("post-game-practice-caption")).toHaveTextContent("Practice game 1 of 5 · XP only, not in your record");
  });

  it("two quests completed by one game are two rows", () => {
    draw(
      landed({
        delta: {
          ...landed().delta,
          bonuses: [
            { kind: "quest", id: "harder-bot", title: "Beat a Hard or Expert bot", xp: 30 },
            { kind: "quest", id: "three-heroes", title: "Play three different heroes", xp: 30 },
          ],
        },
      }),
    );
    expect(screen.getAllByTestId("post-game-bonus").map((row) => row.getAttribute("data-bonus"))).toEqual(["quest", "quest"]);
  });

  it("a 6th practice game paid only by the daily bonus: no 'Practice game 5 of 5'", () => {
    draw(
      landed({
        practice: true,
        after: { ...landed().after, xp: 3534, bonuses: bonuses(5) },
        delta: { ...landed().delta, xp: 30, points: 0, heroPoints: 220, bonuses: [{ kind: "daily", day: 1, xp: 10 }, { kind: "first-win", xp: 20 }] },
      }),
    );
    const caption = screen.getByTestId("post-game-practice-caption");
    expect(caption).toHaveTextContent(PRACTICE_SPENT_DAILY_CAPTION);
    expect(caption).not.toHaveTextContent("5 of 5");
  });
});
