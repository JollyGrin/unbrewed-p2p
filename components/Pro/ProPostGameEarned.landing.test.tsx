/**
 * #1670 on the earned card itself: the "?" help opens for a pointer, the
 * keyboard and a tap; and the landing animation plays once per landing, never
 * under reduced motion, over a DOM that holds the final values throughout.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { EarnedSnapshot } from "@/lib/pro/earned";
import { landingTimeline } from "@/lib/pro/earnedMotion";
import type { EarnedLanded, EarnedPending } from "@/lib/pro/useGameEarned";
import { ProPostGameEarned } from "./ProPostGameEarned";

const before: EarnedSnapshot = {
  stats: { totalGames: 40, level: 7, xp: 3504, xpForNext: 3600, streak: 3, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
  heroId: "hollow-oak",
  heroPoints: 220,
  unlocked: [],
};
const thresholds = [250, 750, 2000, 5000];

const waiting = (): EarnedPending => ({ phase: "waiting", before, forfeit: false, practice: false, thresholds });

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

const practiceBlock = { cap: 5, used: 3, xpPerGame: 15, xpPerWin: 0, xp: 45 };
const dailyBlock = {
  streak: 3,
  bestStreak: 4,
  playedToday: true,
  wonToday: true,
  playXpToday: 20,
  playXpTomorrow: 25,
  firstWinXp: 20,
  resetsAt: "2026-11-17T00:00:00.000Z",
};

const withRows = (): EarnedLanded =>
  landed({
    practice: true,
    after: { ...landed().after, bonuses: { firstGame: { xp: 100, earned: true }, practice: practiceBlock, daily: null }, daily: dailyBlock },
    delta: {
      ...landed().delta,
      bonuses: [
        { kind: "first-game", xp: 100 },
        { kind: "practice", game: 3, cap: 5, xp: 15 },
        { kind: "hero-first", points: 50 },
        { kind: "daily", day: 3, xp: 20 },
        { kind: "first-win", xp: 20 },
        { kind: "quest", id: "first-win", title: "Win a game", xp: 30 },
      ],
    },
  });

/** jsdom has no `matchMedia`; a browser does, and says whether to hold still. */
const setMotion = (mode: "allowed" | "reduced" | "absent") => {
  if (mode === "absent") {
    delete (window as { matchMedia?: unknown }).matchMedia;
    return;
  }
  (window as { matchMedia?: unknown }).matchMedia = (query: string) => ({
    matches: mode === "reduced" && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  });
};

afterEach(() => {
  jest.useRealTimers();
  setMotion("absent");
});

const card = () => screen.getByTestId("post-game-earned-card");
/** The tip the open button points at (a closed one may still be fading out in the DOM). */
const tipText = () => {
  const id = document.querySelector('[data-testid="post-game-help"][data-open="true"]')?.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};

// jsdom has no PointerEvent, so `pointerType` would never reach the handlers.
beforeAll(() => {
  if (typeof window.PointerEvent === "function") return;
  class FakePointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "";
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
});

describe("the ? help", () => {
  it("every bonus row has a real button, named for its question, and the row's text is unchanged", () => {
    render(<ProPostGameEarned view={withRows()} heroName="Hollow Oak" />);
    const rows = screen.getAllByTestId("post-game-bonus");
    expect(rows.map((row) => row.querySelector("button")?.getAttribute("aria-label"))).toEqual([
      "What is the first game bonus?",
      "What is a practice game?",
      "What is the first game as Hollow Oak bonus?",
      "What is the daily bonus?",
      "What is the first win bonus?",
      "What is a quest?",
    ]);
    for (const row of rows) expect(row.querySelector("button")).toHaveAttribute("type", "button");
    expect(rows[1].textContent).toBe("Practice game 3 of 5+15");
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(tipText()).toBeNull();
  });

  it("the copy quotes the landed api blocks", () => {
    render(<ProPostGameEarned view={withRows()} heroName="Hollow Oak" />);
    const [, practice, , daily] = screen.getAllByTestId("post-game-bonus").map((row) => row.querySelector("button")!);
    fireEvent.click(practice);
    expect(tipText()).toContain("Your first 5 pay 15 XP each, win or lose");
    fireEvent.click(practice);
    fireEvent.click(daily);
    expect(tipText()).toContain("Tomorrow pays +25 XP. Days roll over at 00:00 UTC.");
  });

  it("the practice caption and the no-XP practice note carry the same help", () => {
    const { unmount } = render(<ProPostGameEarned view={withRows()} heroName="Hollow Oak" />);
    const caption = screen.getByTestId("post-game-practice-caption");
    expect(caption).toHaveTextContent("Practice game 3 of 5 · XP only, not in your record");
    const captionHelp = caption.parentElement!.querySelector("button")!;
    expect(captionHelp).toHaveAttribute("aria-label", "What is a practice game?");
    fireEvent.click(captionHelp);
    expect(tipText()).toContain("Your first 5 pay 15 XP each, win or lose");
    unmount();

    render(<ProPostGameEarned view={{ phase: "casual", practiceCap: 5 }} heroName="Hollow Oak" compact />);
    const noteHelp = screen.getByTestId("post-game-earned-note").parentElement!.querySelector("button")!;
    expect(noteHelp).toHaveAttribute("aria-label", "What is a practice game?");
    fireEvent.click(noteHelp);
    // The no-XP card holds the cap and no per-game amount: no number is made up.
    expect(tipText()).toBe(
      "Easy and medium bots are practice games. Your first 5 pay XP; after that they pay no XP. Hard and expert bots and games against people always pay.",
    );
  });

  it("an api without the practice block: the note still explains 'practice', with no cap", () => {
    render(<ProPostGameEarned view={{ phase: "casual", practiceCap: null }} heroName="Hollow Oak" />);
    fireEvent.click(screen.getByRole("button", { name: "What is a practice game?" }));
    expect(tipText()).toBe("Easy and medium bots are practice games. Hard and expert bots and games against people always pay.");
  });

  describe("three ways in", () => {
    const open = () => {
      render(<ProPostGameEarned view={landed({ delta: { ...landed().delta, bonuses: [{ kind: "first-game", xp: 100 }] } })} heroName="Hollow Oak" />);
      return screen.getByRole("button", { name: "What is the first game bonus?" });
    };

    it("mouse: opens on hover, a click keeps it open, leaving closes", () => {
      const help = open();
      fireEvent.pointerEnter(help, { pointerType: "mouse" });
      expect(tipText()).toBe("A one-off bonus for finishing your first game.");
      expect(help).toHaveAttribute("aria-expanded", "true");
      fireEvent.pointerDown(help, { pointerType: "mouse" });
      fireEvent.click(help);
      expect(help).toHaveAttribute("data-open", "true");
      fireEvent.pointerLeave(help, { pointerType: "mouse" });
      expect(help).toHaveAttribute("data-open", "false");
    });

    it("keyboard: opens on focus, Enter toggles, Escape closes, blur closes", () => {
      const help = open();
      act(() => help.focus());
      expect(help).toHaveAttribute("data-open", "true");
      // Enter/Space on a button is a click with no pointer behind it.
      fireEvent.click(help);
      expect(help).toHaveAttribute("data-open", "false");
      fireEvent.click(help);
      expect(help).toHaveAttribute("data-open", "true");
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(help).toHaveAttribute("data-open", "false");
      fireEvent.click(help);
      act(() => help.blur());
      expect(help).toHaveAttribute("data-open", "false");
    });

    it("touch: a tap opens (hover and tap-focus do not), a second tap closes, a tap elsewhere closes", () => {
      const help = open();
      const tap = () => {
        fireEvent.pointerEnter(help, { pointerType: "touch" });
        fireEvent.pointerDown(help, { pointerType: "touch" });
        act(() => help.focus());
        fireEvent.click(help);
      };
      fireEvent.pointerEnter(help, { pointerType: "touch" });
      expect(help).toHaveAttribute("data-open", "false");
      tap();
      expect(help).toHaveAttribute("data-open", "true");
      expect(tipText()).toBe("A one-off bonus for finishing your first game.");
      tap();
      expect(help).toHaveAttribute("data-open", "false");
      tap();
      expect(help).toHaveAttribute("data-open", "true");
      fireEvent.pointerDown(document.body, { pointerType: "touch" });
      expect(help).toHaveAttribute("data-open", "false");
    });

    it("Escape with the tip open is the tip's: it does not reach a dialog behind it", () => {
      const onKeyDown = jest.fn();
      render(
        <div onKeyDown={onKeyDown}>
          <ProPostGameEarned view={{ phase: "casual", practiceCap: 5 }} heroName="Hollow Oak" />
        </div>,
      );
      const help = screen.getByRole("button", { name: "What is a practice game?" });
      fireEvent.click(help);
      fireEvent.keyDown(help, { key: "Escape" });
      expect(help).toHaveAttribute("data-open", "false");
      expect(onKeyDown).not.toHaveBeenCalled();
      // Closed: Escape is the dialog's again.
      fireEvent.keyDown(help, { key: "Escape" });
      expect(onKeyDown).toHaveBeenCalledTimes(1);
    });
  });
});

describe("the landing animation", () => {
  it("plays when the phase turns landed, over final values: text, widths and aria-valuenow never move", () => {
    setMotion("allowed");
    jest.useFakeTimers();
    const { rerender } = render(<ProPostGameEarned view={waiting()} heroName="Hollow Oak" />);
    expect(card()).not.toHaveAttribute("data-landing");
    rerender(<ProPostGameEarned view={landed()} heroName="Hollow Oak" />);
    expect(card()).toHaveAttribute("data-landing", "playing");
    // The first landed render already reports the final state.
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent(/^\+40 XP$/);
    expect(screen.getByTestId("post-game-level-delta")).toHaveStyle({ width: "5%" });
    expect(screen.getByTestId("post-game-level-bar")).toHaveAttribute("aria-valuenow", "93");
    // What moves is laid over it and hidden from assistive tech.
    expect(screen.getByTestId("post-game-xp-count")).toHaveTextContent("+0 XP");
    expect(screen.getByTestId("post-game-xp-count")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("post-game-level-sheen")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByTestId("post-game-level-wrap")).toBeNull();

    act(() => {
      jest.advanceTimersByTime(landingTimeline(false, 0).totalMs + 50);
    });
    expect(card()).not.toHaveAttribute("data-landing");
    expect(screen.queryByTestId("post-game-xp-count")).toBeNull();
    expect(screen.queryByTestId("post-game-level-sheen")).toBeNull();
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent(/^\+40 XP$/);
  });

  it("the figure counts up and ends on the real one", () => {
    setMotion("allowed");
    jest.useFakeTimers();
    render(<ProPostGameEarned view={landed({ delta: { ...landed().delta, xp: 1200 } })} heroName="Hollow Oak" />);
    const seen: number[] = [];
    for (let i = 0; i < 80; i++) {
      act(() => {
        jest.advanceTimersByTime(16);
      });
      const count = screen.queryByTestId("post-game-xp-count");
      if (count) seen.push(Number((count.textContent ?? "").replace(/[^0-9]/g, "")));
    }
    expect(seen[0]).toBe(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(1200);
    expect(seen.some((value) => value > 0 && value < 1200)).toBe(true);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    expect(screen.queryByTestId("post-game-xp-count")).toBeNull();
    expect(screen.getByTestId("post-game-xp-delta")).toHaveTextContent("+1,200 XP");
  });

  it("does not replay on re-render or on a refetch that rebuilds the view around the same landing", () => {
    setMotion("allowed");
    jest.useFakeTimers();
    const view = landed();
    const { rerender } = render(<ProPostGameEarned view={view} heroName="Hollow Oak" />);
    expect(card()).toHaveAttribute("data-landing", "playing");
    // Mid-animation re-renders keep the one run going (the hook hands back a
    // new wrapper object every render; the landing inside it is the same).
    rerender(<ProPostGameEarned view={{ ...view }} heroName="Hollow Oak" />);
    expect(card()).toHaveAttribute("data-landing", "playing");
    act(() => {
      jest.advanceTimersByTime(landingTimeline(false, 0).totalMs + 50);
    });
    expect(card()).not.toHaveAttribute("data-landing");
    for (let i = 0; i < 3; i++) {
      rerender(<ProPostGameEarned view={{ ...view, thresholds: [...thresholds] }} heroName="Hollow Oak" xpMultiplier={i} />);
      expect(card()).not.toHaveAttribute("data-landing");
      expect(screen.queryByTestId("post-game-xp-count")).toBeNull();
    }
  });

  it("does not replay when the card is mounted again for the same game (the modal reopened, panel ↔ HUD)", () => {
    setMotion("allowed");
    const view = landed();
    const first = render(<ProPostGameEarned view={view} heroName="Hollow Oak" />);
    expect(card()).toHaveAttribute("data-landing", "playing");
    first.unmount();
    render(<ProPostGameEarned view={view} heroName="Hollow Oak" compact />);
    expect(card()).not.toHaveAttribute("data-landing");
    expect(screen.queryByTestId("post-game-level-sheen")).toBeNull();
  });

  it("a rematch's landing is a new one and plays", () => {
    setMotion("allowed");
    const { rerender } = render(<ProPostGameEarned view={landed()} heroName="Hollow Oak" />);
    rerender(<ProPostGameEarned view={waiting()} heroName="Hollow Oak" />);
    expect(card()).not.toHaveAttribute("data-landing");
    rerender(<ProPostGameEarned view={landed()} heroName="Hollow Oak" />);
    expect(card()).toHaveAttribute("data-landing", "playing");
    expect(screen.getByTestId("post-game-xp-count")).toHaveTextContent("+0 XP");
  });

  it("prefers-reduced-motion: reduce — nothing moves, the final state at once, and it is not saved up for later", () => {
    setMotion("reduced");
    const view = withRows();
    const first = render(<ProPostGameEarned view={view} heroName="Hollow Oak" />);
    expect(card()).not.toHaveAttribute("data-landing");
    expect(screen.queryByTestId("post-game-xp-count")).toBeNull();
    expect(screen.queryByTestId("post-game-level-sheen")).toBeNull();
    expect(screen.getByTestId("post-game-xp-delta")).toHaveStyle({ opacity: "" });
    first.unmount();
    setMotion("allowed");
    render(<ProPostGameEarned view={view} heroName="Hollow Oak" />);
    expect(card()).not.toHaveAttribute("data-landing");
  });

  it("no matchMedia at all (the other test files' jsdom): still, final state", () => {
    render(<ProPostGameEarned view={landed()} heroName="Hollow Oak" />);
    expect(card()).not.toHaveAttribute("data-landing");
    expect(screen.queryByTestId("post-game-xp-count")).toBeNull();
  });

  it("level-up: the old level and its bar are laid over the landed ones, which already read the new level", () => {
    setMotion("allowed");
    jest.useFakeTimers();
    render(
      <ProPostGameEarned
        heroName="Hollow Oak"
        view={landed({
          after: { totalGames: 41, level: 8, xp: 3640, xpForNext: 4500, streak: 4, streakBest: 6, playedHeroes: [], bonuses: null, daily: null },
          delta: { ...landed().delta, xp: 136, level: 8, levelUp: true },
        })}
      />,
    );
    expect(screen.getByTestId("post-game-level-title")).toHaveTextContent(/^Level 8$/);
    expect(screen.getByTestId("post-game-level-bar")).toHaveAttribute("aria-valuenow", "4");
    expect(screen.getByTestId("post-game-level-base")).toHaveStyle({ width: "0%" });
    expect(screen.getByTestId("post-game-level-delta")).toHaveStyle({ width: "4%" });
    const from = screen.getByTestId("post-game-level-title-from");
    expect(from).toHaveTextContent("Level 7");
    expect(from).toHaveAttribute("aria-hidden", "true");
    const wrap = screen.getByTestId("post-game-level-wrap");
    expect(wrap).toHaveAttribute("aria-hidden", "true");
    // The old bar: the pre-game 88%, and the rest of the track to run through.
    expect(wrap.children[0]).toHaveStyle({ width: "88%" });
    expect(wrap.children[1]).toHaveStyle({ width: "12%" });
    expect(screen.getByTestId("post-game-earned-caption")).toHaveTextContent("Level up — the bar starts over");

    act(() => {
      jest.advanceTimersByTime(landingTimeline(true, 0).totalMs + 50);
    });
    expect(screen.queryByTestId("post-game-level-title-from")).toBeNull();
    expect(screen.queryByTestId("post-game-level-wrap")).toBeNull();
    expect(screen.getByTestId("post-game-level-title")).toHaveTextContent(/^Level 8$/);
  });

  it("bonus rows arrive in turn after the fill: 80 ms apart", () => {
    setMotion("allowed");
    render(<ProPostGameEarned view={withRows()} heroName="Hollow Oak" />);
    const t = landingTimeline(false, 6);
    const delays = screen.getAllByTestId("post-game-bonus").map((row) => {
      const match = /(\d+)ms [a-z-]+ (\d+)ms both/.exec(getComputedStyle(row).animation);
      return match ? Number(match[2]) : null;
    });
    expect(delays).toEqual([0, 1, 2, 3, 4, 5].map((i) => t.rows.startMs + i * 80));
  });
});
