import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { clone } from "lodash";
import { DeckImportCardType } from "./deck-import.type";
import { PoolType, newPool, shuffleRandomDiscardIntoDeck } from "./PoolFns";

describe("newPool", () => {
  test("copies the deck meta and fighters", () => {
    const mockDeck = clone(_mockDeck);
    const pool = newPool(mockDeck);
    expect(pool.deckName).toBe(mockDeck.name);
    expect(pool.hero.specialAbility).toBe(mockDeck.deck_data.hero.specialAbility);
    expect(pool.sidekick.name).toBe(mockDeck.deck_data.sidekick.name);
  });

  // issue #372: deck-level "extra rules" cards (e.g. Clone Troopers' board cap)
  // used to be dropped by the pool transform; they must now thread through so the
  // legacy game header can render them.
  test("threads ruleCards through, defaulting to [] when absent", () => {
    const mockDeck = clone(_mockDeck);
    const pool = newPool(mockDeck);
    expect(pool.ruleCards).toEqual(mockDeck.deck_data.ruleCards);
    expect(pool.ruleCards.length).toBeGreaterThan(0);

    const noRules = clone(_mockDeck);
    delete (noRules.deck_data as { ruleCards?: unknown }).ruleCards;
    expect(newPool(noRules).ruleCards).toEqual([]);
  });

  // issue #437: decks that only carry the back at deck level
  // (appearance.cardbackUrl — API/evergreen decks) must have it backfilled onto
  // every pooled card, since pooled cards detach from deck_data.
  test("backfills the deck-level cardback onto each card", () => {
    const deck = clone(_mockDeck);
    deck.deck_data = clone(deck.deck_data);
    deck.deck_data.appearance = {
      ...deck.deck_data.appearance,
      cardbackUrl: "https://example.com/back.webp",
    };
    deck.deck_data.cards = deck.deck_data.cards.map((c) => ({
      ...c,
      cardBackUrl: undefined,
    }));

    const pool = newPool(deck);
    expect(pool.cards.length).toBeGreaterThan(0);
    expect(
      pool.cards.every(
        (c) => c.cardBackUrl === "https://example.com/back.webp",
      ),
    ).toBe(true);
  });

  // TTS image decks already set a per-card cardBackUrl; it must win over the
  // deck-level value so those decks are unchanged.
  test("keeps an existing per-card cardBackUrl over the deck-level back", () => {
    const deck = clone(_mockDeck);
    deck.deck_data = clone(deck.deck_data);
    deck.deck_data.appearance = {
      ...deck.deck_data.appearance,
      cardbackUrl: "https://example.com/deck-back.webp",
    };
    deck.deck_data.cards = deck.deck_data.cards.map((c) => ({
      ...c,
      cardBackUrl: "https://example.com/tts-back.webp",
    }));

    const pool = newPool(deck);
    expect(
      pool.cards.every(
        (c) => c.cardBackUrl === "https://example.com/tts-back.webp",
      ),
    ).toBe(true);
  });
});

// issue #463: recycle part of the discard (TTS-style) without resetting the pile.
describe("shuffleRandomDiscardIntoDeck", () => {
  const card = (title: string) => ({ title }) as DeckImportCardType;
  const poolWith = (deck: string[], discard: string[]): PoolType => ({
    ...newPool(clone(_mockDeck)),
    deck: deck.map(card),
    discard: discard.map(card),
  });
  const titles = (cards: DeckImportCardType[]) => cards.map((c) => c.title);

  test("moves N random discards into the deck and returns them", () => {
    const pool = poolWith(["d1", "d2"], ["a", "b", "c", "d"]);
    const moved = shuffleRandomDiscardIntoDeck(pool, 3);

    expect(moved).toHaveLength(3);
    expect(pool.discard).toHaveLength(1);
    expect(pool.deck).toHaveLength(5);
    // every moved card left the discard and landed in the deck
    expect(titles(pool.deck!).sort()).toEqual(
      ["d1", "d2", ...titles(moved)].sort(),
    );
    moved.forEach((c) => expect(pool.discard).not.toContain(c));
  });

  test("clamps to the discard size when it holds fewer than N", () => {
    const pool = poolWith(["d1"], ["a", "b"]);
    const moved = shuffleRandomDiscardIntoDeck(pool, 3);

    expect(titles(moved).sort()).toEqual(["a", "b"]);
    expect(pool.discard).toEqual([]);
    expect(titles(pool.deck!).sort()).toEqual(["a", "b", "d1"]);
  });

  test("is a no-op on an empty discard", () => {
    const pool = poolWith(["d1", "d2"], []);
    const moved = shuffleRandomDiscardIntoDeck(pool, 1);

    expect(moved).toEqual([]);
    expect(titles(pool.deck!).sort()).toEqual(["d1", "d2"]);
  });

  test("picks vary across calls rather than always taking the top", () => {
    const picks = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const pool = poolWith([], ["a", "b", "c", "d", "e"]);
      picks.add(shuffleRandomDiscardIntoDeck(pool, 1)[0].title!);
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});
