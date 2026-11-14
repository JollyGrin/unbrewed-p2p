/**
 * The activity panel renders grouped lines: the inline limit and the "more"
 * count are in lines as shown, and the detail modal opens a group back up
 * into its entries.
 */
import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ActionLog } from "@/components/Game/ActionLog/action-log";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "me" } }),
}));

// Chakra's Modal focus trap uses a selector the pinned jsdom/nwsapi can't
// parse (see test/pro/lobbySetupRail.test.tsx); the trap is a browser concern.
jest.mock("@chakra-ui/focus-lock", () => ({
  __esModule: true,
  FocusLock: ({ children }: { children: unknown }) => children,
}));

type Entry = { seq: number; at: number; text: string };
let mockPlayers: Record<string, { actionLog: Entry[] }> = {};
jest.mock("../../lib/contexts/WebGameProvider", () => ({
  useWebGame: () => ({ gameState: { content: { players: mockPlayers } } }),
}));

const NOW = 1_700_000_000_000;

/** `texts` oldest first, one second apart, the last one `endAgo` s ago. */
const log = (texts: string[], endAgo = 0): Entry[] =>
  texts.map((text, i) => ({
    seq: i + 1,
    at: NOW - (endAgo + texts.length - 1 - i) * 1000,
    text,
  }));

const lineTexts = (root: HTMLElement = document.body) =>
  within(root)
    .queryAllByTestId("action-log-line")
    .map((el) => el.textContent);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});
afterEach(() => {
  jest.useRealTimers();
});

describe("ActionLog grouping", () => {
  it("shows five draws as one line with a count and the latest time", () => {
    mockPlayers = { me: { actionLog: log(Array(5).fill("Drew a card"), 20) } };
    render(<ActionLog />);
    expect(lineTexts()).toEqual(["YouDrew a card ×520s"]);
  });

  it("keeps another player's action as its own line between two runs", () => {
    mockPlayers = {
      me: {
        actionLog: [
          { seq: 1, at: NOW - 32000, text: "Drew a card" },
          { seq: 2, at: NOW - 30000, text: "Drew a card" },
          { seq: 3, at: NOW - 10000, text: "Drew a card" },
        ],
      },
      bob: { actionLog: [{ seq: 1, at: NOW - 20000, text: "Drew a card" }] },
    };
    render(<ActionLog />);
    expect(lineTexts()).toEqual(["YouDrew a card10s", "bobDrew a card20s", "YouDrew a card ×230s"]);
  });

  it("shows every value of grouped dice rolls", () => {
    mockPlayers = {
      me: { actionLog: log(["Rolled d20 → 17", "Rolled d20 → 4", "Rolled d20 → 12"]) },
    };
    render(<ActionLog />);
    expect(lineTexts()).toEqual(["YouRolled d20 ×3 → 17, 4, 12now"]);
  });

  it("counts grouped lines against the inline limit", () => {
    // 20 entries, but only 2 lines: nothing overflows.
    mockPlayers = {
      me: { actionLog: log([...Array(10).fill("Drew a card"), ...Array(10).fill("Discarded a card")]) },
    };
    render(<ActionLog />);
    expect(lineTexts()).toHaveLength(2);
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
  });

  it("offers the overflow in grouped lines", () => {
    // 18 distinct lines plus a run of 5: 19 lines as shown, 15 inline.
    const texts = [
      ...Array.from({ length: 18 }, (_, i) => `Gave a card to p${i}`),
      ...Array(5).fill("Drew a card"),
    ];
    mockPlayers = { me: { actionLog: log(texts) } };
    render(<ActionLog />);
    expect(lineTexts()).toHaveLength(15);
    expect(screen.getByText("Show 4 more…")).toBeTruthy();
  });

  it("says so when there is nothing yet", () => {
    mockPlayers = {};
    render(<ActionLog />);
    expect(screen.getByText("No actions yet")).toBeTruthy();
  });

  it("the detail modal shows groups that open into their entries", () => {
    const texts = [
      ...Array.from({ length: 16 }, (_, i) => `Gave a card to p${i}`),
      "Rolled d6 → 2",
      "Rolled d6 → 5",
    ];
    mockPlayers = { me: { actionLog: log(texts) } };
    render(<ActionLog />);
    fireEvent.click(screen.getByText("Show 2 more…"));
    const dialog = screen.getByRole("dialog");
    expect(lineTexts(dialog)).toHaveLength(17);
    expect(lineTexts(dialog)[0]).toContain("Rolled d6 ×2 → 2, 5");

    // Only the group can be opened.
    const toggles = within(dialog).getAllByRole("button", { name: /Show the \d+ entries/ });
    expect(toggles).toHaveLength(1);
    expect(within(dialog).queryByText("Rolled d6 → 5")).toBeNull();
    fireEvent.click(toggles[0]);
    expect(within(dialog).getByText("Rolled d6 → 5")).toBeTruthy();
    expect(within(dialog).getByText("Rolled d6 → 2")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Hide the 2 entries" }));
    expect(within(dialog).queryByText("Rolled d6 → 5")).toBeNull();
  });

  it("does not offer to open a group inline", () => {
    mockPlayers = { me: { actionLog: log(["Drew a card", "Drew a card"]) } };
    render(<ActionLog />);
    expect(screen.queryByRole("button", { name: /entries/ })).toBeNull();
  });

  it("keeps a line mounted while its group grows, and across the clock tick", () => {
    mockPlayers = { me: { actionLog: log(["Drew a card", "Drew a card"]) } };
    const { rerender } = render(<ActionLog />);
    const before = screen.getByTestId("action-log-line");

    mockPlayers = { me: { actionLog: log(["Drew a card", "Drew a card", "Drew a card"]) } };
    rerender(<ActionLog />);
    expect(screen.getByTestId("action-log-line")).toBe(before);
    expect(before.textContent).toContain("Drew a card ×3");

    act(() => {
      jest.advanceTimersByTime(15000);
    });
    expect(screen.getByTestId("action-log-line")).toBe(before);
  });
});
