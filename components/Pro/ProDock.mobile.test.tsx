/**
 * Mobile step 1, portrait: a forced decision whose answer is ON the board shows a
 * slim bar instead of the tall sheet, so the board keeps the screen.
 */
import "@testing-library/jest-dom";
import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("labels setup as SETUP instead of a turn-0 opponent turn", () => {
    const setup = { ...view, phase: "SETUP", turnNumber: 0, activePlayer: "p2" } as unknown as PlayerView;
    render(<ProDock {...props({ view: setup, myTurn: false, activeTurnLabel: "OPPONENT'S TURN", hasPrompt: true })} />);

    const sheet = screen.getByTestId("pro-mobile-sheet");
    expect(sheet).toHaveTextContent("SETUP");
    expect(sheet).not.toHaveTextContent(/turn 0|OPPONENT'S TURN/);
  });

  describe("action tiles in the optional sheet (mobile step 2)", () => {
    const ATTACK_A = { type: "DECLARE_ATTACK", attacker: "f1", target: "f2" } as unknown as Action;
    const ATTACK_B = { type: "DECLARE_ATTACK", attacker: "f1", target: "f3" } as unknown as Action;
    const rowsOf = (...actions: Action[]) => actions.map((action) => ({ action, hotkey: null, dividerBefore: false }));
    const openSheet = () => fireEvent.click(screen.getByTestId("pro-mobile-more"));

    it("leads with Maneuver / Scheme / Attack tiles, a missing one disabled", () => {
      const onAction = jest.fn();
      render(<ProDock {...props({ onAction })} />);
      openSheet();

      expect(screen.getByRole("button", { name: /attack.*not available/i })).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: /^maneuver/i }));
      expect(onAction).toHaveBeenCalledWith(MANEUVER);
    });

    it("does not list a tile's action a second time underneath", () => {
      render(<ProDock {...props({ describe: (a) => `row ${(a as { type: string }).type}` })} />);
      openSheet();

      expect(screen.queryByRole("button", { name: "row MANEUVER" })).toBeNull();
    });

    it("opens a tile with several choices into just those rows", () => {
      const onAction = jest.fn();
      render(
        <ProDock
          {...props({
            onAction,
            rows: rowsOf(MANEUVER, ATTACK_A, ATTACK_B),
            describe: (a) => ((a as { target?: string }).target ? `hit ${(a as { target: string }).target}` : "move"),
          })}
        />
      );
      openSheet();

      fireEvent.click(screen.getByRole("button", { name: /attack.*2 targets/i }));
      fireEvent.click(screen.getByRole("button", { name: "hit f3" }));

      expect(onAction).toHaveBeenCalledWith(ATTACK_B);
      expect(screen.getByRole("button", { name: /all actions/i })).toBeInTheDocument();
    });

    it("shows no tiles on a forced decision", () => {
      render(<ProDock {...props({ hasPrompt: true })} />);

      expect(screen.queryByTestId("pro-action-tiles")).toBeNull();
    });
  });

  describe("card choices as card faces (mobile step 2)", () => {
    const BOOST_1 = { type: "BOOST_MOVE", card: "c1" } as unknown as Action;
    const BOOST_2 = { type: "BOOST_MOVE", card: "c2" } as unknown as Action;
    const END = { type: "END_MANEUVER" } as unknown as Action;
    const COMMIT_DOWN = { type: "COMMIT_ATTACK_CARD", card: "c7" } as unknown as Action;
    const COMMIT_UP = { type: "COMMIT_ATTACK_CARD", card: "c7", faceUp: true } as unknown as Action;
    const rowsOf = (...actions: Action[]) => actions.map((action) => ({ action, hotkey: null, dividerBefore: false }));
    const label = (a: Action) => {
      const x = a as { type: string; card?: string; faceUp?: boolean };
      return x.card ? `${x.type} ${x.card}${x.faceUp ? " up" : ""}` : x.type;
    };
    const renderCard = (card: string) => <span data-testid={`face-${card}`}>{card}</span>;

    it("shows the cards to pick instead of text rows, and plays the picked one", () => {
      const onAction = jest.fn();
      render(<ProDock {...props({ onAction, rows: rowsOf(END, BOOST_1, BOOST_2), describe: label, renderCard })} />);
      fireEvent.click(screen.getByTestId("pro-mobile-more"));

      expect(screen.getByText("Boost your move")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "BOOST_MOVE c2" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Pick: BOOST_MOVE c2" }));
      fireEvent.click(screen.getByRole("button", { name: "BOOST_MOVE c2" }));

      expect(onAction).toHaveBeenCalledWith(BOOST_2);
    });

    it("offers each variant of the picked card as its own confirm button", () => {
      const onAction = jest.fn();
      render(<ProDock {...props({ onAction, hasPrompt: false, combatPanel: <div>COMBAT</div>, rows: rowsOf(COMMIT_DOWN, COMMIT_UP), describe: label, renderCard })} />);

      fireEvent.click(screen.getByRole("button", { name: "Pick: COMMIT_ATTACK_CARD c7" }));
      fireEvent.click(screen.getByRole("button", { name: "COMMIT_ATTACK_CARD c7 up" }));

      expect(onAction).toHaveBeenCalledWith(COMMIT_UP);
      expect(screen.getByRole("button", { name: "COMMIT_ATTACK_CARD c7" })).toBeInTheDocument();
    });

    it("keeps the plain text rows when no card renderer is given", () => {
      render(<ProDock {...props({ rows: rowsOf(END, BOOST_1), describe: label })} />);
      fireEvent.click(screen.getByTestId("pro-mobile-more"));

      expect(screen.getByRole("button", { name: "BOOST_MOVE c1" })).toBeInTheDocument();
    });
  });

  it("forgets a picked card when the optional sheet is closed", () => {
    const BOOST = { type: "BOOST_MOVE", card: "c1" } as unknown as Action;
    const renderCard = (card: string) => <span>{card}</span>;
    const rows = [MANEUVER, BOOST].map((action) => ({ action, hotkey: null, dividerBefore: false }));
    render(<ProDock {...props({ rows, renderCard, describe: (a) => (a as { type: string }).type })} />);
    fireEvent.click(screen.getByTestId("pro-mobile-more"));
    fireEvent.click(screen.getByRole("button", { name: "Pick: BOOST_MOVE" }));
    expect(screen.getByRole("button", { name: "BOOST_MOVE" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close actions/i }));
    fireEvent.click(screen.getByTestId("pro-mobile-more"));

    expect(screen.queryByRole("button", { name: "BOOST_MOVE" })).toBeNull();
  });

  it("keeps Don't defend next to the defense cards instead of down in the list", () => {
    const COMMIT = { type: "COMMIT_DEFENSE_CARD", card: "c3" } as unknown as Action;
    const DECLINE = { type: "DECLINE_DEFENSE" } as unknown as Action;
    const onAction = jest.fn();
    const rows = [COMMIT, DECLINE].map((action) => ({ action, hotkey: null, dividerBefore: false }));
    render(
      <ProDock
        {...props({
          rows,
          onAction,
          combatPanel: <div>COMBAT</div>,
          renderCard: (card: string) => <span>{card}</span>,
          describe: (a) => ((a as { type: string }).type === "DECLINE_DEFENSE" ? "Don't defend" : "Defend with c3"),
        })}
      />
    );

    const picker = screen.getByTestId("pro-card-picker");
    expect(screen.getAllByRole("button", { name: "Don't defend" })).toHaveLength(1);
    fireEvent.click(within(picker).getByRole("button", { name: "Don't defend" }));
    expect(onAction).toHaveBeenCalledWith(DECLINE);
  });

  describe("after the combat is decided (mobile polish)", () => {
    it("gives the board back while the other side resolves after-combat effects", () => {
      render(<ProDock {...props({ combatPanel: <div>COMBAT</div>, combatSummary: "Attacker wins · 1 dmg", rows: [] })} />);

      expect(screen.queryByTestId("pro-mobile-sheet")).toBeNull();
      expect(screen.getByTestId("pro-mobile-pills")).toHaveTextContent("Attacker wins · 1 dmg");
    });

    it("keeps the sheet while the combat is still undecided", () => {
      render(<ProDock {...props({ combatPanel: <div>COMBAT</div>, combatSummary: null })} />);

      expect(screen.getByTestId("pro-mobile-sheet")).toBeInTheDocument();
    });

    it("uses the slim bar for an after-combat move picked on the board", () => {
      render(<ProDock {...props({ combatPanel: <div>COMBAT</div>, combatSummary: "Defender wins · 0 dmg", hasPrompt: true, highlightedCount: 3 })} />);

      expect(screen.getByTestId("pro-mobile-pickbar")).toBeInTheDocument();
    });
  });

  describe("landscape rail (mobile polish)", () => {
    const BOOST = { type: "BOOST_MOVE", card: "c1" } as unknown as Action;
    const ATTACK_A = { type: "DECLARE_ATTACK", attacker: "f1", target: "f2" } as unknown as Action;
    const ATTACK_B = { type: "DECLARE_ATTACK", attacker: "f1", target: "f3" } as unknown as Action;
    const rowsOf = (...actions: Action[]) => actions.map((action) => ({ action, hotkey: null, dividerBefore: false }));

    it("leads the open rail with the action tiles", () => {
      const onAction = jest.fn();
      render(<ProDock {...props({ mobile: "rail", onAction })} />);

      expect(screen.getByTestId("pro-action-tiles")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^maneuver/i }));
      expect(onAction).toHaveBeenCalledWith(MANEUVER);
    });

    it("shows card choices as card faces in the rail", () => {
      const onAction = jest.fn();
      const describe = (a: Action) => (a as { type: string }).type;
      render(<ProDock {...props({ mobile: "rail", onAction, rows: rowsOf(BOOST), describe, renderCard: (c: string) => <span>{c}</span> })} />);

      fireEvent.click(screen.getByRole("button", { name: "Pick: BOOST_MOVE" }));
      fireEvent.click(screen.getByRole("button", { name: "BOOST_MOVE" }));

      expect(onAction).toHaveBeenCalledWith(BOOST);
    });

    it("drops an opened tile's narrowed list once the legal actions change", () => {
      const rows = rowsOf(MANEUVER, ATTACK_A, ATTACK_B);
      const { rerender } = render(<ProDock {...props({ mobile: "rail", rows })} />);
      fireEvent.click(screen.getByRole("button", { name: /attack.*2 targets/i }));
      expect(screen.getByRole("button", { name: /all actions/i })).toBeInTheDocument();

      rerender(<ProDock {...props({ mobile: "rail", rows: rowsOf(MANEUVER, ATTACK_A) })} />);

      expect(screen.getByTestId("pro-action-tiles")).toBeInTheDocument();
    });

    it("keeps the tiles out of a forced decision", () => {
      render(<ProDock {...props({ mobile: "rail", hasPrompt: true })} />);

      expect(screen.queryByTestId("pro-action-tiles")).toBeNull();
    });
  });

  it("writes one action left in the singular", () => {
    render(<ProDock {...props({ view: { ...view, actionsRemaining: 1 } as unknown as PlayerView, hasPrompt: true })} />);

    expect(screen.getByTestId("pro-mobile-sheet")).toHaveTextContent("1 action left");
  });
});
