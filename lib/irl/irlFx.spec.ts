/**
 * The IRL effect-event spine (issue #809): each tray action announces what it
 * just did, once, and only after the move went through.
 */
import { PropsWithChildren, createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { cloneDeep } from "lodash";
import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { PoolType } from "@/components/DeckPool/PoolFns";
import {
  IrlGameProvider,
  useIrlActions,
  useIrlGame,
} from "@/components/Irl/irlGame";
import { OfflineGameProvider } from "@/lib/contexts/OfflineGameProvider";
import { IrlFxEvent, useIrlFx } from "./irlFx";
import { irlCounters } from "./irlCharacters";
import { IRL_OPENING_HAND, initIrlPool } from "./irlPool";
import { saveIrlPool } from "./irlStorage";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, replace: jest.fn() }),
}));

beforeEach(() => window.localStorage.clear());

/** hand boost values; card 2 (0) and card 3 (null) can't boost */
const BOOSTS = [3, 2, 0, null, 1];

/** A game already under way, with a known five-card hand. */
const table = (): PoolType => {
  const pool = initIrlPool(cloneDeep(_mockDeck));
  pool.hand = pool.hand.map((card, i) => ({
    ...card,
    title: `card ${i}`,
    boost: BOOSTS[i] as number,
  }));
  return pool;
};

/** Mount the tray; with `saved`, it picks that session back up. */
const mount = (saved?: PoolType) => {
  const deck = cloneDeep(_mockDeck);
  if (saved) saveIrlPool(deck.id, saved);
  const events: IrlFxEvent[] = [];
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      OfflineGameProvider,
      null,
      createElement(IrlGameProvider, { initialDeck: deck }, children),
    );
  const { result } = renderHook(
    () => {
      useIrlFx((event) => events.push(event));
      return { actions: useIrlActions(), game: useIrlGame() };
    },
    { wrapper },
  );

  /** run one action, return the events it emitted */
  const fire = (run: (actions: typeof result.current.actions) => void) => {
    events.length = 0;
    act(() => run(result.current.actions));
    return [...events];
  };
  const pool = () => result.current.game.pool as PoolType;
  return { deck, events, fire, pool };
};

describe("deal", () => {
  test("a fresh game deals the opening hand", () => {
    const { events } = mount();
    expect(events).toEqual([{ type: "deal", count: IRL_OPENING_HAND }]);
  });

  test("a restored session deals nothing", () => {
    const { events, pool } = mount(table());
    expect(pool().hand).toHaveLength(IRL_OPENING_HAND);
    expect(events).toEqual([]);
  });
});

describe("one event per action", () => {
  test("draw", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.draw())).toEqual([{ type: "draw", count: 1 }]);
    expect(fire((a) => a.drawMany(3))).toEqual([{ type: "draw", count: 3 }]);
  });

  test("an empty deck draws nothing and emits nothing", () => {
    const empty = table();
    empty.deck = [];
    const { fire } = mount(empty);
    expect(fire((a) => a.draw())).toEqual([]);
    expect(fire((a) => a.discardTop())).toEqual([]);
  });

  test("mill", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.discardTop())).toEqual([{ type: "mill" }]);
  });

  test("shuffle", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.shuffle())).toEqual([{ type: "shuffle" }]);
  });

  test("play, reveal, hide", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.play(0))).toEqual([{ type: "play" }]);
    // a card is already in play — nothing moves
    expect(fire((a) => a.play(0))).toEqual([]);
    expect(fire((a) => a.toggleReveal())).toEqual([{ type: "reveal" }]);
    expect(fire((a) => a.toggleReveal())).toEqual([{ type: "hide" }]);
  });

  test("boost, cancel boost", () => {
    const { fire } = mount(table());
    fire((a) => a.play(0)); // hand: card 1 (+2), card 2 (0), card 3 (null), card 4 (+1)
    expect(fire((a) => a.boostFromHand(0))).toEqual([{ type: "boost", index: 0 }]);
    // card 2 has no boost to give
    expect(fire((a) => a.boostFromHand(0))).toEqual([]);
    expect(fire((a) => a.boostFromHand(2))).toEqual([{ type: "boost", index: 2 }]);
    expect(fire((a) => a.cancelBoost())).toEqual([{ type: "cancelBoost", count: 2 }]);
  });

  test("discard from hand", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.discard(0))).toEqual([
      { type: "discard", from: "hand", count: 1 },
    ]);
    expect(fire((a) => a.discardRandom())).toEqual([
      { type: "discard", from: "hand", count: 1 },
    ]);
  });

  test("discard from play takes the boost with it", () => {
    const { fire, pool } = mount(table());
    fire((a) => a.play(0));
    fire((a) => a.boostFromHand(0));
    expect(fire((a) => a.discardInPlay())).toEqual([
      { type: "discard", from: "play", count: 2 },
    ]);
    expect(pool().commit.main).toBeNull();
  });

  test("to the deck, top and bottom, from hand and discard", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.toDeckTop(0))).toEqual([
      { type: "toDeck", where: "top", from: "hand" },
    ]);
    expect(fire((a) => a.toDeckBottom(0))).toEqual([
      { type: "toDeck", where: "bottom", from: "hand" },
    ]);
    fire((a) => a.discard(0));
    fire((a) => a.discard(0));
    expect(fire((a) => a.discardToTop(0))).toEqual([
      { type: "toDeck", where: "top", from: "discard" },
    ]);
    expect(fire((a) => a.discardToBottom(0))).toEqual([
      { type: "toDeck", where: "bottom", from: "discard" },
    ]);
  });

  test("back to hand, from play and discard", () => {
    const { fire } = mount(table());
    fire((a) => a.play(0));
    expect(fire((a) => a.returnInPlay())).toEqual([
      { type: "toHand", from: "play" },
    ]);
    fire((a) => a.discard(0));
    expect(fire((a) => a.discardToHand(0))).toEqual([
      { type: "toHand", from: "discard" },
    ]);
  });

  test("remove, from hand, play and discard", () => {
    const { fire } = mount(table());
    expect(fire((a) => a.removeFromHand(0))).toEqual([
      { type: "remove", from: "hand" },
    ]);
    fire((a) => a.play(0));
    expect(fire((a) => a.removeInPlay())).toEqual([
      { type: "remove", from: "play" },
    ]);
    fire((a) => a.discard(0));
    expect(fire((a) => a.removeDiscarded(0))).toEqual([
      { type: "remove", from: "discard" },
    ]);
  });

  test("shuffle the discard in", () => {
    const { fire } = mount(table());
    fire((a) => a.discard(0));
    fire((a) => a.discard(0));
    fire((a) => a.discard(0));
    expect(fire((a) => a.shuffleRandomIn(1))).toEqual([
      { type: "shuffleIn", count: 1 },
    ]);
    expect(fire((a) => a.shuffleDiscardIn())).toEqual([
      { type: "shuffleIn", count: 2 },
    ]);
    // nothing left to shuffle in
    expect(fire((a) => a.shuffleDiscardIn())).toEqual([]);
  });

  test("hp carries the applied delta and the new value", () => {
    const { deck, fire, pool } = mount(table());
    const hero = () => irlCounters(deck, pool())[0];
    const start = hero().value;
    expect(start).toBeGreaterThan(2);
    expect(fire((a) => a.adjust(hero(), -2))).toEqual([
      { type: "hp", counterId: "hero", delta: -2, value: start - 2 },
    ]);
    // floored at 0: the event reports what actually moved
    expect(fire((a) => a.adjust(hero(), -999))).toEqual([
      { type: "hp", counterId: "hero", delta: -(start - 2), value: 0 },
    ]);
    // already at 0 — nothing moved
    expect(fire((a) => a.adjust(hero(), -1))).toEqual([]);
  });
});
