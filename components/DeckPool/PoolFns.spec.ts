import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { clone } from "lodash";
import { newPool } from "./PoolFns";

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
