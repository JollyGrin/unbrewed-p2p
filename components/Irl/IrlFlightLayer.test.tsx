/**
 * The IRL card-flight layer (#811): each fx event sends ghost cards between
 * the piles, a pile tile's count waits for the card flying to it, nothing is
 * ever left stuck in the air, and under reduced motion nothing flies at all.
 */
import "@testing-library/jest-dom";
import { act, render } from "@testing-library/react";
import { cloneDeep } from "lodash";
import { mockDeck } from "@/_mocks_/deck";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  IrlFxBus,
  IrlFxContext,
  IrlFxEvent,
  IrlFxMoved,
  createIrlFxBus,
} from "@/lib/irl/irlFx";
import { initIrlPool } from "@/lib/irl/irlPool";
import { IrlFlights, planFlights, useLandedCount } from "./IrlFlightLayer";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {} }) }));
// the real card measures its text on a canvas, which jsdom hasn't got
jest.mock("../CardFactory/Card", () => ({
  Card: ({ card }: { card: { title: string } }) => <div>{card.title}</div>,
}));

let mockReduced = false;
jest.mock("../../lib/irl/irlMotion", () => ({
  ...jest.requireActual("../../lib/irl/irlMotion"),
  useIrlReducedMotion: () => mockReduced,
}));

const cards: DeckImportCardType[] = initIrlPool(cloneDeep(mockDeck)).hand;

const Tile = ({ anchor, count }: { anchor: string; count: number }) => (
  <span data-irl-anchor={anchor} data-testid={anchor}>
    {useLandedCount(anchor, count)}
  </span>
);

type Counts = { discard: number; deck: number };

const Tray = ({ bus, counts }: { bus: IrlFxBus; counts: Counts }) => (
  <IrlFxContext.Provider value={bus}>
    <IrlFlights>
      <Tile anchor="discard-tile" count={counts.discard} />
      <Tile anchor="deck-tile" count={counts.deck} />
      <div data-irl-anchor="hand-card" />
    </IrlFlights>
  </IrlFxContext.Provider>
);

const mount = (counts: Counts) => {
  const bus = createIrlFxBus();
  const view = render(<Tray bus={bus} counts={counts} />);
  /** the move and its re-render land in one batch, as in the tray */
  const move = (event: IrlFxEvent, moved: IrlFxMoved, next: Counts) =>
    act(() => {
      bus.emit(event, moved);
      view.rerender(<Tray bus={bus} counts={next} />);
    });
  const shown = (anchor: string) => view.getByTestId(anchor).textContent;
  return { bus, move, shown, container: view.container };
};

const ghosts = () => document.querySelectorAll("[data-irl-ghost]").length;
const wait = (ms: number) => act(() => void jest.advanceTimersByTime(ms));

beforeEach(() => {
  jest.useFakeTimers();
  mockReduced = false;
});
afterEach(() => jest.useRealTimers());

const discard = { type: "discard", from: "hand", count: 1 } as const;

test("a discard flies one card, and the discard count waits for it to land", () => {
  const { move, shown } = mount({ discard: 3, deck: 20 });
  move(discard, { cards: [cards[0]], index: 0 }, { discard: 4, deck: 20 });
  expect(ghosts()).toBe(1);
  expect(shown("discard-tile")).toBe("3");
  wait(2000);
  expect(ghosts()).toBe(0);
  expect(shown("discard-tile")).toBe("4");
});

test("a card leaving a pile shows at once", () => {
  const { move, shown } = mount({ discard: 3, deck: 20 });
  move({ type: "mill" }, { cards: [cards[0]] }, { discard: 4, deck: 19 });
  expect(shown("deck-tile")).toBe("19");
  expect(shown("discard-tile")).toBe("3");
  wait(2000);
  expect(shown("discard-tile")).toBe("4");
});

test("draw 3 interrupted by a discard: every card lands, none is stuck", () => {
  const { move, shown } = mount({ discard: 0, deck: 20 });
  move({ type: "draw", count: 3 }, { cards: cards.slice(0, 3) }, { discard: 0, deck: 17 });
  wait(80);
  move(discard, { cards: [cards[0]], index: 0 }, { discard: 1, deck: 17 });
  wait(200);
  expect(ghosts()).toBe(4);
  wait(3000);
  expect(ghosts()).toBe(0);
  expect(shown("discard-tile")).toBe("1");
});

test("never more than six cards in the air; the ones cut still let their tile count", () => {
  const { move, shown } = mount({ discard: 10, deck: 0 });
  const five = { cards: cards.slice(0, 5) };
  move({ type: "shuffleIn", count: 5 }, five, { discard: 5, deck: 5 });
  move({ type: "shuffleIn", count: 5 }, five, { discard: 0, deck: 10 });
  wait(300); // every card has taken off
  expect(ghosts()).toBe(6);
  wait(3000);
  expect(ghosts()).toBe(0);
  expect(shown("deck-tile")).toBe("10");
});

test("under reduced motion no ghost is ever mounted, and counts show at once", () => {
  mockReduced = true;
  const { move, shown } = mount({ discard: 3, deck: 20 });
  move(discard, { cards: [cards[0]], index: 0 }, { discard: 4, deck: 20 });
  move({ type: "shuffle" }, { cards: cards.slice(0, 3) }, { discard: 4, deck: 20 });
  move({ type: "remove", from: "hand" }, { cards: [cards[1]], index: 1 }, { discard: 4, deck: 20 });
  expect(shown("discard-tile")).toBe("4");
  wait(50);
  expect(ghosts()).toBe(0);
});

test("the layer never takes a tap", () => {
  const { container } = mount({ discard: 0, deck: 0 });
  const layer = container.querySelector("[data-irl-flights]");
  expect(layer).toHaveStyle({ pointerEvents: "none", position: "fixed" });
});

describe("planFlights", () => {
  const moved = { cards: cards.slice(0, 5) };

  test("reveal, hide and hp belong to tickets 1 and 2 — nothing flies", () => {
    expect(planFlights({ type: "reveal" }, moved)).toEqual([]);
    expect(planFlights({ type: "hide" }, moved)).toEqual([]);
    expect(
      planFlights({ type: "hp", counterId: "hero", delta: -1, value: 3 }, moved),
    ).toEqual([]);
  });

  test("the opening deal: five backs to the hand tile, staggered", () => {
    const deal = planFlights({ type: "deal", count: 5 }, moved);
    expect(deal).toHaveLength(5);
    expect(deal.every((f) => f.to[0] === "hand-tile" && f.faces.join() === "back,back")).toBe(true);
    expect(deal[1].delay - deal[0].delay).toBeCloseTo(0.09);
  });

  test("a discard from play sends the card and each boost from where it sits", () => {
    const spent = planFlights({ type: "discard", from: "play", count: 3 }, moved);
    expect(spent.map((f) => f.from[0])).toEqual(["in-play-card", "boost-slot-0", "boost-slot-1"]);
  });

  test("the bottom of the deck slides under the tile; the top lands on it", () => {
    const at = (where: "top" | "bottom") =>
      planFlights({ type: "toDeck", where, from: "hand" }, { cards: [cards[0]], index: 2 })[0];
    expect(at("bottom").under).toBe(true);
    expect(at("top").under).toBe(false);
    expect(at("top").from[0]).toBe("hand-grid-card-2");
  });

  test("shuffle-in flies one card per discard, up to five", () => {
    expect(planFlights({ type: "shuffleIn", count: 12 }, moved)).toHaveLength(5);
  });
});
