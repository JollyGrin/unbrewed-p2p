import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { render } from "@testing-library/react";
import { clone } from "lodash";
import Pool from "./Pool";
import { PoolCardType } from "@/components/DeckPool/deck-import.type";

describe("Class: Pool", () => {
  test("assigns props", () => {
    const mockDeck = clone(_mockDeck);
    const pool = new Pool(mockDeck);
    expect(pool.author).toBe(mockDeck.user);
    expect(pool.deckName).toBe(mockDeck.name);
    expect(pool.deckNote).toBe(mockDeck.note);
    expect(pool.cards).toBe(mockDeck.deck_data.cards);
    expect(pool.deck).toBe(null);
    expect(pool.hero).toEqual(mockDeck.deck_data.hero);
    expect(pool.sidekick).toEqual(mockDeck.deck_data.sidekick);
    expect(pool.hand).toEqual([]);
    expect(pool.discard).toEqual([]);
    expect(pool.commit).toEqual({ main: null, reveal: false, boost: null });

    expect(pool.cards.length).toEqual(mockDeck.deck_data.cards.length);
  });

  test("makes a deck", () => {
    const mockDeck = clone(_mockDeck);
    const pool = new Pool(mockDeck);
    expect(pool.deck).toBe(null); // deck inits as null
    pool.makeDeck();
    expect(pool.deck?.length).toBeGreaterThan(pool.cards.length); // should be longer than cards
    const card = pool?.deck?.[0];
    expect(card && "quantity" in card).toBe(false); // expect quantity property to be removed
  });

  test("shuffles deck", () => {
    const mockDeck = clone(_mockDeck);
    const pool = new Pool(mockDeck);

    pool.makeDeck();
    const unshuffledDeck = clone(pool.deck);
    pool.shuffleDeck();

    // Assert that the shuffled deck is not equal to the original deck
    expect(pool.deck).not.toEqual(unshuffledDeck);
    // Assert that the shuffled deck has the same length as the original deck
    expect(pool.deck?.length).toEqual(unshuffledDeck?.length);
    // Assert that the shuffled deck contains the same elements as the original deck
    expect(pool.deck?.sort(compareByTitle)).toEqual(
      unshuffledDeck?.sort(compareByTitle)
    );
  });

  test("draw a card", () => {
    const mockDeck = clone(_mockDeck);
    const pool = new Pool(mockDeck);
    pool.makeDeck();
    expect(pool.hand).toEqual([]);
    const topCardOnDeck = pool.deck?.[pool.deck.length - 1]; // top = last array el
    const nextCardOnDeck = pool.deck?.[pool.deck.length - 2]; // top = last array el
    pool.draw();
    expect(pool.hand.length).toEqual(1);
    expect(pool.hand[0]).toEqual(topCardOnDeck);
    pool.draw();
    expect(pool.hand[1]).toEqual(nextCardOnDeck);
  });

  test("draw a specific card", () => {
    const mockDeck = clone(_mockDeck);
    const pool = new Pool(mockDeck);
    pool.makeDeck();
    const cardIndex = 10;
    const cardInDeck = pool.deck?.[cardIndex];
    pool.drawDeck(cardIndex);
    expect(pool.hand[0]).toBe(cardInDeck);
  });
});

const compareByTitle = (a: PoolCardType, b: PoolCardType) => {
  const titleA = a.title.toLowerCase();
  const titleB = b.title.toLowerCase();

  if (titleA < titleB) {
    return -1;
  } else if (titleA > titleB) {
    return 1;
  } else {
    return 0;
  }
};
