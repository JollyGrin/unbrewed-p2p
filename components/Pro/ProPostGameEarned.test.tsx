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
import { EARNED_TIMEOUT_CAPTION, EARNED_WAITING_CAPTION, EarnedSnapshot } from "@/lib/pro/earned";
import type { EarnedLanded, EarnedPending, GameEarnedView } from "@/lib/pro/useGameEarned";
import { PLACEHOLDER_HATCH, ProPostGameEarned } from "./ProPostGameEarned";

const before: EarnedSnapshot = {
  stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6 },
  heroId: "hollow-oak",
  heroPoints: 220,
  unlocked: ["first-win"],
};
const thresholds = [250, 750, 2000, 5000];

const waiting = (over: Partial<EarnedPending> = {}): EarnedPending => ({
  phase: "waiting",
  before,
  forfeit: false,
  thresholds,
  ...over,
});

const landed = (over: Partial<EarnedLanded> = {}): EarnedLanded => ({
  phase: "landed",
  before,
  after: { totalGames: 41, level: 7, xp: 3544, xpForNext: 3600, streak: 4, streakBest: 6 },
  delta: { xp: 40, level: 7, levelUp: false, points: 40, heroPoints: 260, streak: { from: 3, to: 4 }, newBadges: [] },
  forfeit: false,
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
        after: { totalGames: 41, level: 8, xp: 3640, xpForNext: 4500, streak: 0, streakBest: 6 },
        delta: { xp: 136, level: 8, levelUp: true, points: 40, heroPoints: 260, streak: { from: 3, to: 0 }, newBadges: [] },
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
    draw({ phase: "casual" });
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
