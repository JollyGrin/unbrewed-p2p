/**
 * Undo per format (#1473, delta review H1): the dock renders the Undo control only where the
 * format can ever offer one. Duel and Adventure keep today's control; an ffa-3 / team-2v2 seat
 * gets none instead of a permanently greyed "Undo isn't available right now".
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ProDock, ProDockProps } from "@/components/Pro/ProDock";
import type { PlayerView } from "@/lib/pro/protocol";

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
  }) as unknown as PlayerView;

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` })) as PlayerView["players"];

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
  ...over,
});

const undo = () => screen.queryByTestId("pro-undo");

describe("ProDock Undo per format (#1473)", () => {
  it("duel: rendered as today, greyed with a reason when nothing is eligible", () => {
    render(<ProDock {...props({ formatId: "duel" })} />);
    expect(undo()).toHaveAttribute("data-undo-state", "disabled");
    expect(screen.getByTestId("pro-undo-reason")).toHaveTextContent("Undo isn’t available right now");
  });

  it("duel: byte-identical dock with and without a format id (the pre-registry path)", () => {
    // framer-motion stamps a per-mount projection counter; everything else must match byte for byte.
    const html = (p: ProDockProps) => render(<ProDock {...p} />).container.innerHTML.replace(/ data-projection-id="\d+"/g, "");
    const before = html(props());
    const after = html(props({ formatId: "duel" }));
    expect(after).toBe(before);
    expect(after).toContain('data-testid="pro-undo"');
  });

  it("adventure: rendered as today in a 4-seat room (the solo rule)", () => {
    const four = view({ canUndo: true, players: seats(4), scenario: { id: "synthetic-pack" } } as unknown as Partial<PlayerView>);
    render(<ProDock {...props({ view: four, formatId: "adventure" })} />);
    expect(undo()).toHaveAttribute("data-undo-state", "enabled");
  });

  it.each([
    ["ffa-3", 3],
    ["team-2v2", 4],
  ])("%s: no Undo control in the DOM at all", (formatId, n) => {
    render(<ProDock {...props({ view: view({ players: seats(n) }), formatId })} />);
    expect(undo()).not.toBeInTheDocument();
    expect(screen.queryByText(/undo/i)).not.toBeInTheDocument();
  });

  it("a 3-seat room whose server sent no format id is treated the same way", () => {
    render(<ProDock {...props({ view: view({ players: seats(3) }) })} />);
    expect(undo()).not.toBeInTheDocument();
  });

  it("the registry decides even when the view's seat count alone would not (a 2-seat ffa fixture)", () => {
    // Fails if the registry rule is removed and the dock falls back to "two seats → undo".
    render(<ProDock {...props({ view: view({ players: seats(2) }), formatId: "ffa-3" })} />);
    expect(undo()).not.toBeInTheDocument();
  });
});
