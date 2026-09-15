/**
 * Mobile step 1, portrait: a forced decision whose answer is ON the board shows a
 * slim bar instead of the tall sheet, so the board keeps the screen.
 */
import "@testing-library/jest-dom";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProDock, ProDockProps } from "./ProDock";
import { Action, PlayerView } from "@/lib/pro/protocol";

const view = { you: "p1", activePlayer: "p1", phase: "PLAY", turnNumber: 3, actionsRemaining: 2, winner: null,
  combat: null, canUndo: false, catalog: {}, players: [{ id: "p1" }, { id: "p2" }], fighters: [], self: {},
} as unknown as PlayerView;

const MANEUVER = { type: "MANEUVER" } as unknown as Action;

const props = (over: Partial<ProDockProps> = {}): ProDockProps => ({
  view,
  myTurn: true,
  activeTurnLabel: "YOUR TURN",
  disconnectedLabel: null,
  stepping: null,
  moveChoiceNames: null,
  selectedFighterName: null,
  stepwiseMoves: false,
  highlightedCount: 0,
  attackTargetCount: 0,
  boostHint: null,
  combatPanel: null,
  promptPanel: <div>PROMPT PANEL</div>,
  hasPrompt: false,
  rows: [
    { action: MANEUVER, hotkey: null, dividerBefore: false },
    { action: { type: "SCHEME" } as unknown as Action, hotkey: null, dividerBefore: false },
  ],
  soleAction: null,
  describe: (a) => (a as { type: string }).type,
  isExtendedReach: () => false,
  onAction: () => {},
  legalActionCount: 2,
  iAmSpectating: false,
  iForfeited: false,
  multiplayerView: false,
  replayHref: null,
  undoPending: false,
  onUndo: () => {},
  canForfeit: true,
  onForfeit: () => {},
  mobile: "portrait",
  ...over,
});

describe("ProDock portrait board-pick bar (mobile step 1)", () => {
  it("shows a slim bar with the board instruction for a forced board-pick prompt", () => {
    render(
      <ProDock
        {...props({ hasPrompt: true, highlightedCount: 3, boardPickHint: "click a gold space on the board (3 options)" })}
      />
    );

    expect(screen.getByTestId("pro-mobile-pickbar")).toHaveTextContent("click a gold space on the board (3 options)");
    expect(screen.queryByTestId("pro-mobile-sheet")).toBeNull();
    expect(screen.queryByText("PROMPT PANEL")).toBeNull();
  });

  it("expands to the full sheet via Options", () => {
    render(<ProDock {...props({ hasPrompt: true, highlightedCount: 3 })} />);

    fireEvent.click(screen.getByRole("button", { name: /options/i }));

    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
    expect(screen.getByText("PROMPT PANEL")).toBeInTheDocument();
  });

  it("attaches the page's sheet ref to the bar, so the board fits above it", () => {
    const ref = createRef<HTMLDivElement>();
    const onShown = jest.fn();
    render(
      <ProDock {...props({ hasPrompt: true, attackTargetCount: 1, mobileSheetRef: ref, onMobileSheetShown: onShown })} />
    );

    expect(ref.current).toBe(screen.getByTestId("pro-mobile-pickbar"));
    expect(onShown).toHaveBeenLastCalledWith(true);
  });

  it("keeps the full sheet for a prompt with nothing to pick on the board", () => {
    render(<ProDock {...props({ hasPrompt: true })} />);

    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
    expect(screen.queryByTestId("pro-mobile-pickbar")).toBeNull();
  });

  it("keeps the full sheet during combat even when targets are lit", () => {
    render(<ProDock {...props({ hasPrompt: true, highlightedCount: 2, combatPanel: <div>COMBAT</div> })} />);

    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
  });

  it("closes a sheet the player opened once the board starts offering picks", () => {
    const { rerender } = render(<ProDock {...props()} />);
    fireEvent.click(screen.getByTestId("pro-mobile-more"));
    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();

    rerender(<ProDock {...props({ highlightedCount: 4 })} />);

    expect(screen.queryByTestId("pro-mobile-sheet")).toBeNull();
    expect(screen.getByTestId("pro-mobile-pills")).toBeInTheDocument();
  });

  it("brings the slim bar back for the next board-pick prompt after Options was used", () => {
    const withPrompt = (promptId: string) =>
      props({ hasPrompt: true, highlightedCount: 2, view: { ...view, prompt: { promptId } } as unknown as PlayerView });
    const { rerender } = render(<ProDock {...withPrompt("a")} />);
    fireEvent.click(screen.getByRole("button", { name: /options/i }));
    expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();

    rerender(<ProDock {...withPrompt("b")} />);

    expect(screen.getByTestId("pro-mobile-pickbar")).toBeInTheDocument();
  });
});
