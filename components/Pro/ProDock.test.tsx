/**
 * The dock's collapse contract (issue #451). The layout/drag half is framer-motion
 * plumbing copied from SeatPlate; what is worth pinning down is the guard that
 * keeps a required decision from being hidden behind a collapsed dock, plus the
 * fact that a collapsed dock still shows the key-info band.
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ProDock, ProDockProps } from "./ProDock";
import { Action, PlayerView } from "@/lib/pro/protocol";
import { DockRow } from "@/lib/pro/actionDock";

const view = (over: Partial<PlayerView> = {}): PlayerView =>
  ({
    you: "p1",
    activePlayer: "p1",
    phase: "PLAY",
    turnNumber: 3,
    actionsRemaining: 2,
    winner: null,
    combat: null,
    canUndo: false,
    catalog: {},
    players: [{ id: "p1" }, { id: "p2" }],
    fighters: [],
    self: {},
    ...over,
  } as unknown as PlayerView);

const ACTION = { type: "PASS" } as unknown as Action;

/** One un-numbered, un-dividered row — the shape most of these tests want. */
const row = (action: Action, over: Partial<DockRow> = {}): DockRow => ({
  action,
  hotkey: null,
  dividerBefore: false,
  ...over,
});

const props = (over: Partial<ProDockProps> = {}): ProDockProps => ({
  view: view(),
  myTurn: false,
  activeTurnLabel: "OPPONENT TURN",
  disconnectedLabel: null,
  stepping: null,
  moveChoiceNames: null,
  selectedFighterName: null,
  stepwiseMoves: false,
  highlightedCount: 0,
  attackTargetCount: 0,
  boostHint: null,
  combatPanel: null,
  promptPanel: null,
  hasPrompt: false,
  rows: [],
  soleAction: null,
  describe: () => "do the thing",
  isExtendedReach: () => false,
  onAction: () => {},
  legalActionCount: 0,
  iAmSpectating: false,
  iForfeited: false,
  multiplayerView: false,
  replayHref: null,
  undoPending: false,
  onUndo: () => {},
  canForfeit: false,
  onForfeit: () => {},
  ...over,
});

beforeEach(() => window.localStorage.clear());

/** Collapse via the title-bar chevron, awaiting the post-mount hydration pass. */
const collapse = async () => {
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /collapse dock/i }));
};

describe("ProDock collapse", () => {
  it("keeps the turn/actions chips visible when collapsed but folds the rest away", async () => {
    // Nothing on offer for this seat, so the guard permits a collapse.
    render(<ProDock {...props({ boostHint: "boost is available" })} />);
    expect(screen.getByText("boost is available")).toBeInTheDocument();

    await collapse();

    expect(screen.getByText("OPPONENT TURN")).toBeInTheDocument();
    expect(screen.getByText("turn 3")).toBeInTheDocument();
    expect(screen.getByText("2 actions left")).toBeInTheDocument();
    expect(screen.queryByText("boost is available")).not.toBeInTheDocument();
  });

  it("shows the disconnected chip while collapsed", async () => {
    render(<ProDock {...props({ disconnectedLabel: "opponent disconnected" })} />);
    await collapse();
    expect(screen.getByText("opponent disconnected")).toBeInTheDocument();
  });

  it("persists the collapsed state across a remount", async () => {
    const { unmount } = render(<ProDock {...props()} />);
    await collapse();
    unmount();

    render(<ProDock {...props()} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: /expand dock/i })).toBeInTheDocument();
  });
});

describe("ProDock auto-expand guard", () => {
  /** Collapse with a benign view, then re-render with one that needs input. */
  const collapseThen = async (over: Partial<ProDockProps>) => {
    const { rerender } = render(<ProDock {...props()} />);
    await collapse();
    rerender(<ProDock {...props(over)} />);
  };

  it("expands when the engine raises a prompt", async () => {
    await collapseThen({ hasPrompt: true, promptPanel: <div>choose a card</div> });
    expect(screen.getByText("choose a card")).toBeInTheDocument();
  });

  it("expands when combat starts", async () => {
    await collapseThen({ combatPanel: <div>combat!</div> });
    expect(screen.getByText("combat!")).toBeInTheDocument();
  });

  it("expands when it is your turn with legal actions", async () => {
    await collapseThen({ myTurn: true, rows: [row(ACTION)], legalActionCount: 1 });
    expect(screen.getByText("do the thing")).toBeInTheDocument();
  });

  // Sidekick placement on turn 0: the engine offers this seat an action while
  // another seat is the active player, and MOVE_FIGHTER/PLACE_SIDEKICK render as
  // board spaces rather than dock buttons. Seen live in a 2-player room.
  it("expands for a board-rendered action offered outside your own turn", async () => {
    await collapseThen({ myTurn: false, rows: [], legalActionCount: 1, highlightedCount: 5 });
    expect(screen.getByText(/click a gold space to move there \(5 options\)/)).toBeInTheDocument();
  });

  it("expands when the game ends", async () => {
    await collapseThen({ view: view({ winner: "p1", phase: "GAME_OVER" } as Partial<PlayerView>) });
    expect(screen.getByText(/VICTORY!|DEFEAT/)).toBeInTheDocument();
  });

  it("locks the collapse toggle while a decision is pending", async () => {
    render(<ProDock {...props({ hasPrompt: true, promptPanel: <div>choose a card</div> })} />);
    await act(async () => {});
    expect(screen.getByRole("button", { name: /decision is waiting/i })).toBeDisabled();
  });

  it("re-applies the stored collapse once the decision clears", async () => {
    const { rerender } = render(<ProDock {...props()} />);
    await collapse();
    rerender(<ProDock {...props({ hasPrompt: true, promptPanel: <div>choose a card</div> })} />);
    expect(screen.getByText("choose a card")).toBeInTheDocument();

    rerender(<ProDock {...props()} />);
    expect(screen.getByRole("button", { name: /expand dock/i })).toBeInTheDocument();
  });
});

describe("ProDock action rows (issue #514)", () => {
  const attack = (attacker: string, target: string): Action =>
    ({ type: "DECLARE_ATTACK", player: "p1", attacker, target } as unknown as Action);

  it("renders the hotkey chip a row was numbered with, and none when unnumbered", async () => {
    render(
      <ProDock
        {...props({
          legalActionCount: 2,
          rows: [row(ACTION, { hotkey: 1 }), row(ACTION, { hotkey: 2 })],
          describe: (a) => `option ${(a as unknown as { n?: number }).n ?? ""}`,
        })}
      />
    );
    await act(async () => {});
    // The chips are what the page's digit listener promises to honour.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("3")).not.toBeInTheDocument();
  });

  it("keeps the spacebar chip on a lone row rather than numbering it", async () => {
    render(<ProDock {...props({ legalActionCount: 1, rows: [row(ACTION)], soleAction: ACTION })} />);
    await act(async () => {});
    expect(screen.getByText("space")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("fires the row's own action on click", async () => {
    const other = { type: "OTHER" } as unknown as Action;
    const onAction = jest.fn();
    render(
      <ProDock
        {...props({
          legalActionCount: 2,
          rows: [row(ACTION, { hotkey: 1 }), row(other, { hotkey: 2 })],
          describe: (a) => ((a as unknown as { type: string }).type === "PASS" ? "first" : "second"),
          onAction,
        })}
      />
    );
    await act(async () => {});
    fireEvent.click(screen.getByText("second").closest("button")!);
    expect(onAction).toHaveBeenCalledWith(other);
  });

  it("paints attacker → target token faces on an attack row, badging the attacker", async () => {
    const raptor = "king-taranis/raptor-1";
    const kong = "king-kong/kong";
    render(
      <ProDock
        {...props({
          legalActionCount: 1,
          rows: [row(attack(raptor, kong), { hotkey: 1 })],
          describe: () => "Attack Kong with Raptor 2",
          // No art for either fighter → the board's initials fallback.
          fighterFace: (id) => ({ name: id === raptor ? "Raptor" : "Kong", artUrl: null }),
          attackerBadge: { [raptor]: 2 },
        })}
      />
    );
    await act(async () => {});
    expect(screen.getByText("RAP")).toBeInTheDocument(); // tokenInitials("Raptor")
    expect(screen.getByText("KON")).toBeInTheDocument(); // tokenInitials("Kong")
    expect(screen.getByTitle("#2")).toBeInTheDocument(); // the #161 disambiguator
  });

  it("stays text-only when no face resolver is supplied", async () => {
    render(
      <ProDock
        {...props({
          legalActionCount: 1,
          rows: [row(attack("king-taranis/king", "king-kong/kong"))],
          describe: () => "Attack Kong with King",
        })}
      />
    );
    await act(async () => {});
    expect(screen.getByText("Attack Kong with King")).toBeInTheDocument();
  });
});
