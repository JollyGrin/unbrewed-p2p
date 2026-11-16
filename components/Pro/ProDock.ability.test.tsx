/**
 * A free activated hero ability (protocol v41, engine #1080 — p2p #1693): POMNI's
 * Reward 2 / Reward 3 as buttons beside Maneuver / Scheme / Attack. Pins where the
 * button stands in each shell, that it reads as a bonus and not as an action, and
 * that pressing it hands back the EXACT object the server offered.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ProDock, ProDockProps } from "./ProDock";
import { Action, CardMeta, PlayerView } from "@/lib/pro/protocol";
import { describeAction, dockRows } from "@/lib/pro/actionDock";
import type { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

// the real card measures its text on a canvas, which jsdom hasn't got
jest.mock("../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <div data-testid="card-render">{card.title}</div>,
}));

const catalog: Record<string, CardMeta> = {
  "pomni/reward-2": { title: "Reward 2", type: "scheme", value: null, boost: null },
  "pomni/reward-3": { title: "Reward 3", type: "scheme", value: null, boost: null },
};

const view = { you: "p1", activePlayer: "p1", phase: "PLAY", turnNumber: 3, actionsRemaining: 2, winner: null,
  combat: null, canUndo: false, catalog, players: [{ id: "p1" }, { id: "p2" }], fighters: [], self: {},
} as unknown as PlayerView;

const MANEUVER: Action = { type: "MANEUVER", player: "p1" };
const SCHEME: Action = { type: "SCHEME", player: "p1", card: "pomni/welcome#1" };
// Exactly as engine #1085's "Wire shape" section gives them.
const REWARD_2: Action = { type: "USE_ABILITY", player: "p1", ability: "reward-2", label: "Reward 2", card: "pomni/reward-2" };
const REWARD_3: Action = { type: "USE_ABILITY", player: "p1", ability: "reward-3", label: "Reward 3", card: "pomni/reward-3" };
// A future hero's ability with no card to show.
const NO_CARD: Action = { type: "USE_ABILITY", player: "p1", ability: "howl", label: "Howl" };

const props = (actions: Action[], over: Partial<ProDockProps> = {}): ProDockProps => ({
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
  promptPanel: null,
  hasPrompt: false,
  rows: dockRows(actions),
  soleAction: null,
  describe: (a) => describeAction(catalog, a),
  isExtendedReach: () => false,
  onAction: () => {},
  legalActionCount: actions.length,
  iAmSpectating: false,
  iForfeited: false,
  multiplayerView: false,
  replayHref: null,
  undoPending: false,
  onUndo: () => {},
  canForfeit: true,
  onForfeit: () => {},
  mobile: false,
  ...over,
});

const abilityButtons = () => screen.queryAllByTestId("pro-ability-button");
const abilityCard = (card: string): DeckImportCardType | null =>
  catalog[card] ? ({ title: catalog[card].title } as DeckImportCardType) : null;

describe("desktop dock", () => {
  it("lists each offered ability after Maneuver / Scheme, labelled from the server's label", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3])} />);

    expect(abilityButtons().map((b) => b.dataset.ability)).toEqual(["reward-2", "reward-3"]);
    expect(screen.getByRole("button", { name: /^Reward 2\. Bonus: does not use an action$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Reward 3\. Bonus: does not use an action$/ })).toBeInTheDocument();
    // …and below the two real actions, in the same list
    const all = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const at = (needle: string) => all.findIndex((t) => t.includes(needle));
    expect(at("Maneuver")).toBeLessThan(at("Reward 2"));
    expect(at("Scheme:")).toBeLessThan(at("Reward 2"));
    expect(at("Reward 2")).toBeLessThan(at("Reward 3"));
  });

  it("marks the button as free, so it does not read as a fourth action", () => {
    render(<ProDock {...props([MANEUVER, REWARD_2])} />);

    const button = abilityButtons()[0];
    expect(within(button).getByText("Free")).toHaveAttribute("title", "Bonus: does not use an action");
    // The real action carries no such tag.
    expect(within(screen.getByRole("button", { name: /maneuver/i })).queryByText("Free")).toBeNull();
  });

  it("sends back exactly the offered object", () => {
    const onAction = jest.fn();
    render(<ProDock {...props([MANEUVER, REWARD_2, REWARD_3], { onAction })} />);

    fireEvent.click(abilityButtons()[1]);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe(REWARD_3);
    expect(onAction.mock.calls[0][0]).toEqual({
      type: "USE_ABILITY",
      player: "p1",
      ability: "reward-3",
      label: "Reward 3",
      card: "pomni/reward-3",
    });
  });

  it("shows the ability's card face, looked up by the action's card id", () => {
    const lookup = jest.fn(abilityCard);
    render(<ProDock {...props([MANEUVER, REWARD_2], { abilityCard: lookup })} />);

    expect(lookup).toHaveBeenCalledWith("pomni/reward-2");
    expect(within(abilityButtons()[0]).getByTestId("pro-ability-card")).toHaveTextContent("Reward 2");
  });

  it("falls back to a glyph when the ability has no card, or its art is not known", () => {
    const lookup = jest.fn(() => null);
    render(<ProDock {...props([MANEUVER, NO_CARD, REWARD_2], { abilityCard: lookup })} />);

    // never asked for the card-less one
    expect(lookup.mock.calls.length).toBeGreaterThan(0);
    for (const call of lookup.mock.calls as unknown as string[][]) expect(call).toEqual(["pomni/reward-2"]);
    expect(screen.queryByTestId("pro-ability-card")).toBeNull();
    expect(abilityButtons().map((b) => b.dataset.ability)).toEqual(["howl", "reward-2"]);
  });

  it("wears its number hotkey like any other row", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2])} />);

    expect(within(abilityButtons()[0]).getByText("3")).toBeInTheDocument();
  });

  it("draws no ability button when the server offers none", () => {
    render(<ProDock {...props([MANEUVER, SCHEME])} />);

    expect(abilityButtons()).toEqual([]);
  });
});

describe.each(["portrait", "rail"] as const)("phone action sheet (%s)", (mobile) => {
  const open = () => {
    if (mobile === "portrait") fireEvent.click(screen.getByTestId("pro-mobile-more"));
  };

  it("stands the abilities in a strip directly under the three tiles, once each", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3], { mobile })} />);
    open();

    const tiles = screen.getByTestId("pro-action-tiles");
    const strip = screen.getByTestId("pro-ability-tiles");
    expect(tiles.nextElementSibling).toBe(strip);
    expect(within(strip).getAllByTestId("pro-ability-button").map((b) => b.dataset.ability)).toEqual([
      "reward-2",
      "reward-3",
    ]);
    // not repeated in the list under the tiles, and not drawn as a fourth tile
    expect(abilityButtons()).toHaveLength(2);
    expect(within(tiles).getAllByRole("button")).toHaveLength(3);
    expect(within(tiles).queryByText(/Reward/)).toBeNull();
  });

  it("sends back exactly the offered object", () => {
    const onAction = jest.fn();
    render(<ProDock {...props([MANEUVER, REWARD_2], { mobile, onAction })} />);
    open();

    fireEvent.click(abilityButtons()[0]);

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe(REWARD_2);
  });

  it("has no strip when no ability is offered", () => {
    render(<ProDock {...props([MANEUVER, SCHEME], { mobile })} />);
    open();

    expect(screen.getByTestId("pro-action-tiles")).toBeInTheDocument();
    expect(screen.queryByTestId("pro-ability-tiles")).toBeNull();
  });
});
