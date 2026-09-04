import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { clone } from "lodash";
import { DeckImportCardType } from "./deck-import.type";
import { PoolType, hasFieldedSidekick, newPool, shuffleRandomDiscardIntoDeck } from "./PoolFns";

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

  // issue #500: decks whose "hero" is several character cards (Skeleton King's
  // two skeleton types, Frankenstein's Monster) had everything past the first
  // hero dropped by the pool transform, so a whole character was invisible.
  describe("extraCharacters (issue #500)", () => {
    /** the Maker's empty sidekick slot, written into every extra character */
    const stubSidekick = {
      hp: null,
      isRanged: false,
      name: "Sidekick",
      quantity: 0,
      quote: "",
    };
    const skeleton = {
      hero: {
        hp: 1,
        isRanged: false,
        move: 2,
        name: "skeleton",
        specialAbility: "this is larry\n\n",
      },
      sidekick: stubSidekick,
    };
    const withExtras = (extraCharacters: unknown) => {
      const deck = clone(_mockDeck);
      deck.deck_data = clone(deck.deck_data);
      deck.deck_data.extraCharacters =
        extraCharacters as typeof deck.deck_data.extraCharacters;
      return deck;
    };

    test("threads extra characters through, narrowed to the pool fields", () => {
      const pool = newPool(withExtras([skeleton]));
      expect(pool.extraCharacters).toEqual([
        {
          hero: {
            hp: 1,
            isRanged: false,
            move: 2,
            name: "skeleton",
            specialAbility: "this is larry\n\n",
          },
          sidekick: stubSidekick,
        },
      ]);
    });

    test("defaults to [] when absent — the vast majority of decks", () => {
      const deck = clone(_mockDeck);
      deck.deck_data = clone(deck.deck_data);
      delete (deck.deck_data as { extraCharacters?: unknown }).extraCharacters;
      expect(newPool(deck).extraCharacters).toEqual([]);
      expect(newPool(withExtras([])).extraCharacters).toEqual([]);
    });

    test("drops blank slots with no name and no ability", () => {
      const blank = {
        hero: { hp: null, isRanged: false, move: 0, name: "  ", specialAbility: "\n" },
        sidekick: stubSidekick,
      };
      const pool = newPool(withExtras([blank, skeleton]));
      expect(pool.extraCharacters.map((c) => c.hero.name)).toEqual(["skeleton"]);
    });

    // the pool is rebroadcast over the websocket on every action, so an extra
    // character carries the same narrow fields the hero mapping copies
    test("carries nothing past the fields the hero mapping copies", () => {
      const bloated = {
        hero: { ...skeleton.hero, quote: "unused", tokenImageUrl: "x.webp" },
        sidekick: { ...stubSidekick, tokenImageUrl: "y.webp" },
      };
      const [character] = newPool(withExtras([bloated])).extraCharacters;
      expect(Object.keys(character.hero).sort()).toEqual([
        "hp",
        "isRanged",
        "move",
        "name",
        "specialAbility",
      ]);
      expect(Object.keys(character.sidekick).sort()).toEqual([
        "hp",
        "isRanged",
        "name",
        "quantity",
        "quote",
      ]);
    });
  });

  // issue #495: whitespace-only body text (" ", "\n", an &nbsp; that survived a
  // deck-builder textarea) reads as "has a section" to raw truthiness checks
  // while the card layout, which trims, gives it zero lines. Normalize it on
  // import so the copy that syncs over the websocket is clean too.
  test("normalizes whitespace-only card text to empty strings", () => {
    const deck = clone(_mockDeck);
    deck.deck_data = clone(deck.deck_data);
    deck.deck_data.cards = deck.deck_data.cards.map((c, i) =>
      i === 0
        ? {
            ...c,
            basicText: " ",
            immediateText: "\n",
            duringText: " ",
            afterText: "Deal 1 damage to the opponent",
          }
        : c,
    );

    const card = newPool(deck).cards[0];
    expect(card.basicText).toBe("");
    expect(card.immediateText).toBe("");
    expect(card.duringText).toBe("");
    // Real text is passed through verbatim.
    expect(card.afterText).toBe("Deal 1 damage to the opponent");
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

// issue #749 pair test: the sidekick SECTION gate, shared by HeroPreviewModal and
// the /bag deck view. The fixtures carry the REAL snapshot values (DOPE / kdKM /
// DJQB / jw9q) — the two stub shapes must hide, the two fielded shapes must show.
describe("hasFieldedSidekick", () => {
  test("hides the unmatched.cards blank stub (Jason Voorhees / DOPE)", () => {
    expect(
      hasFieldedSidekick({ name: "", hp: null, quantity: 0 })
    ).toBe(false);
  });

  test("hides the Maker placeholder stub (King Kong / kdKM)", () => {
    expect(
      hasFieldedSidekick({ name: "Sidekick", hp: null, quantity: 0 })
    ).toBe(false);
  });

  test("shows nameless tokens with fighters on the wire (Clone Troopers / DJQB)", () => {
    // hasSidekick requires a name and would hide these — that is why this gate
    // exists alongside it.
    expect(
      hasFieldedSidekick({ name: "", hp: null, quantity: 6 })
    ).toBe(true);
  });

  test("shows a named sidekick with hp (Momo / jw9q)", () => {
    expect(
      hasFieldedSidekick({ name: "Momo", hp: 6, quantity: 1 })
    ).toBe(true);
  });

  test("absent and blank-name-with-whitespace slots stay hidden", () => {
    expect(hasFieldedSidekick(undefined)).toBe(false);
    expect(hasFieldedSidekick(null)).toBe(false);
    expect(hasFieldedSidekick({ name: "  ", quantity: 0 })).toBe(false);
  });
});
