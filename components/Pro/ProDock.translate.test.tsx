/**
 * Browser translation vs the Pro dock (#1608, same class as #1528 on /connect).
 * Chrome's page translation replaces each text node it translates with a
 * <font> wrapper. React still holds the original node, so removing it, or
 * inserting a new node before it, throws `NotFoundError` in the commit phase.
 *
 * The actions chip used to render `{n} action{n === 1 ? "" : "s"} left`: four
 * sibling text nodes, of which React drops the "s" node at 1 action
 * (removeChild) and re-inserts it before " left" at 2 (insertBefore). That runs
 * every turn on the phone sheet's always-visible bar.
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import { ProDock, ProDockProps } from "./ProDock";
import { PlayerView } from "@/lib/pro/protocol";

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

/** What Chrome translation does to an element: every text node inside it
 *  becomes <font><font>…</font></font>, detached from React's fiber. */
const translateWithin = (el: Element) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const node of nodes) {
    const outer = document.createElement("font");
    const inner = document.createElement("font");
    inner.textContent = `[${node.nodeValue}]`;
    outer.appendChild(inner);
    node.parentNode!.replaceChild(outer, node);
  }
};

beforeEach(() => window.localStorage.clear());

describe("ProDock survives browser translation (#1608)", () => {
  it("actions chip: 2 → 1 → 2 actions on a translated page does not throw", async () => {
    const { rerender } = render(<ProDock {...props()} />);
    await act(async () => {});
    translateWithin(screen.getByText("2 actions left"));

    expect(() => rerender(<ProDock {...props({ view: view({ actionsRemaining: 1 }) })} />)).not.toThrow();
    expect(() => rerender(<ProDock {...props({ view: view({ actionsRemaining: 2 }) })} />)).not.toThrow();
  });

  it("actions chip: untranslated, the count reads as one phrase", () => {
    const { rerender } = render(<ProDock {...props({ view: view({ actionsRemaining: 1 }) })} />);
    expect(screen.getByText("1 action left")).toBeInTheDocument();
    rerender(<ProDock {...props({ view: view({ actionsRemaining: 2 }) })} />);
    expect(screen.getByText("2 actions left")).toBeInTheDocument();
  });

  it("stepping label: 2 → 1 → 2 moves on a translated page does not throw", async () => {
    const walk = (movesLeft: number) => ({
      fighterName: "Kenshiro", movesLeft, canEnd: true, onEnd: () => {}, onCancel: () => {},
    });
    const { rerender } = render(<ProDock {...props({ stepping: walk(2) })} />);
    await act(async () => {});
    translateWithin(screen.getByText("stepping Kenshiro — 2 moves left"));

    expect(() => rerender(<ProDock {...props({ stepping: walk(1) })} />)).not.toThrow();
    expect(() => rerender(<ProDock {...props({ stepping: walk(2) })} />)).not.toThrow();
  });
});
