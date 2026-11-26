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

  it("is a list row, not a strip button: free to shrink with the dock", () => {
    render(<ProDock {...props([MANEUVER, REWARD_2])} />);

    const b = abilityButtons()[0];
    expect(b.dataset.strip).toBeUndefined();
    expect(window.getComputedStyle(b).minWidth).toBe("0px");
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

  // Issue #1703: at 390px two strip buttons broke their labels in two ("Reward /
  // 2"). A strip button now refuses to shrink below its one-line width and wraps to
  // the next row instead; the desktop list row is untouched.
  it("keeps each strip button at least as wide as its label on one line", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3], { mobile })} />);
    open();

    const strip = screen.getByTestId("pro-ability-tiles");
    expect(window.getComputedStyle(strip).flexWrap).toBe("wrap");
    for (const b of abilityButtons()) {
      expect(b.dataset.strip).toBe("true");
      const css = window.getComputedStyle(b);
      expect(css.minWidth).toBe("fit-content");
      expect(css.maxWidth).toBe("100%");
    }
  });

  it("has no strip when no ability is offered", () => {
    render(<ProDock {...props([MANEUVER, SCHEME], { mobile })} />);
    open();

    expect(screen.getByTestId("pro-action-tiles")).toBeInTheDocument();
    expect(screen.queryByTestId("pro-ability-tiles")).toBeNull();
  });
});

// Issue #1707: at rest the phone shows only the primary pill + "N more…", which hid
// POMNI's free Reward buttons behind a tap. They now share the collapsed row.
describe("phone collapsed pill row (portrait)", () => {
  const pills = () => screen.getByTestId("pro-mobile-pills");
  const more = () => screen.getByTestId("pro-mobile-more");

  it("stands each offered ability on the pill row, above the primary action", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3], { mobile: "portrait" })} />);

    const strip = within(pills()).getByTestId("pro-pill-abilities");
    expect(within(strip).getAllByTestId("pro-ability-button").map((b) => b.dataset.ability)).toEqual([
      "reward-2",
      "reward-3",
    ]);
    // the strip sits before the row that holds the primary action and "more"
    expect(strip.nextElementSibling).toContainElement(screen.getByTestId("pro-mobile-primary"));
    expect(strip.nextElementSibling).toContainElement(more());
    // one of each on screen: nothing is drawn twice
    expect(abilityButtons()).toHaveLength(2);
    expect(screen.getByTestId("pro-mobile-primary")).toHaveTextContent(/maneuver/i);
  });

  it("does not count the abilities it shows in \"N more…\"", () => {
    const { unmount } = render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3], { mobile: "portrait" })} />);
    // 4 rows: Maneuver is the pill, the two rewards are on the row, only Scheme is left
    expect(more()).toHaveTextContent("1 more…");
    unmount();

    render(<ProDock {...props([MANEUVER, REWARD_2], { mobile: "portrait" })} />);
    // nothing hidden at all: the label says so rather than "0 more…"
    expect(more()).toHaveTextContent("Details");
  });

  it("keeps the full sheet whole: every ability is in it, the pill row is gone", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2, REWARD_3], { mobile: "portrait" })} />);
    fireEvent.click(more());

    expect(screen.queryByTestId("pro-pill-abilities")).toBeNull();
    expect(within(screen.getByTestId("pro-ability-tiles")).getAllByTestId("pro-ability-button")).toHaveLength(2);
    expect(within(screen.getByTestId("pro-action-tiles")).getAllByRole("button")).toHaveLength(3);
  });

  it("sends back exactly the offered object, once per tap", () => {
    const onAction = jest.fn();
    render(<ProDock {...props([MANEUVER, REWARD_2, REWARD_3], { mobile: "portrait", onAction })} />);

    fireEvent.click(abilityButtons()[1]);
    fireEvent.click(abilityButtons()[1]); // a double tap is latched out, as in the sheet

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe(REWARD_3);
  });

  it("is a floating plate, one line wide, with room to tap", () => {
    render(<ProDock {...props([MANEUVER, REWARD_2, REWARD_3], { mobile: "portrait" })} />);

    expect(window.getComputedStyle(screen.getByTestId("pro-pill-abilities")).flexWrap).toBe("wrap");
    for (const b of abilityButtons()) {
      expect(b.dataset.floating).toBe("true");
      const css = window.getComputedStyle(b);
      expect(css.minWidth).toBe("fit-content");
      expect(css.pointerEvents).toBe("auto");
      expect(css.minHeight).toBe("2.75rem");
    }
  });

  it("is a lone ability's own primary when nothing else is legal, and counted out once", () => {
    render(<ProDock {...props([REWARD_2], { mobile: "portrait" })} />);

    // it is the pill; no second copy on the strip, and nothing "more"
    expect(screen.queryByTestId("pro-pill-abilities")).toBeNull();
    expect(screen.getByTestId("pro-mobile-primary")).toHaveTextContent("Reward 2");
    expect(more()).toHaveTextContent("Details");
  });

  it("renders exactly as before when no ability is offered", () => {
    render(<ProDock {...props([MANEUVER, SCHEME], { mobile: "portrait" })} />);

    expect(screen.queryByTestId("pro-pill-abilities")).toBeNull();
    expect(abilityButtons()).toEqual([]);
    // the pills container holds just the one row: the primary pill + "1 more…"
    expect(pills().children).toHaveLength(1);
    expect(more()).toHaveTextContent("1 more…");
  });
});

describe("landscape rail", () => {
  it("is unchanged: no pill strip, abilities only in the always-open sheet strip", () => {
    render(<ProDock {...props([MANEUVER, SCHEME, REWARD_2], { mobile: "rail" })} />);

    expect(screen.queryByTestId("pro-pill-abilities")).toBeNull();
    expect(abilityButtons()).toHaveLength(1);
    expect(abilityButtons()[0].dataset.floating).toBeUndefined();
  });
});
