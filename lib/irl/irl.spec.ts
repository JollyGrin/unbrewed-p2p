import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { cloneDeep } from "lodash";
import {
  adjustExtraCharacterHp,
  adjustHp,
  boostFromTopDeck,
  commitCard,
  removeCard,
  revealCommit,
} from "@/components/DeckPool/PoolFns";
import {
  IRL_OPENING_HAND,
  deckHasCards,
  discardInPlay,
  initIrlPool,
  removeCommitted,
  returnCommitToHand,
  undoDeckBoost,
} from "./irlPool";
import {
  clearIrlPool,
  irlStorageKey,
  loadIrlPool,
  saveIrlPool,
} from "./irlStorage";

const deck = () => cloneDeep(_mockDeck);

beforeEach(() => window.localStorage.clear());

describe("initIrlPool", () => {
  test("opens with a five-card hand drawn off a shuffled deck", () => {
    const pool = initIrlPool(deck());
    expect(pool.hand).toHaveLength(IRL_OPENING_HAND);
    const total = _mockDeck.deck_data.cards
      .filter((c) => !c.isCharacterCard)
      .reduce((sum, c) => sum + c.quantity, 0);
    expect((pool.deck?.length ?? 0) + pool.hand.length).toBe(total);
    expect(pool.removed).toEqual([]);
  });
});

describe("deckHasCards", () => {
  test("false for an empty or missing deck", () => {
    const pool = initIrlPool(deck());
    expect(deckHasCards(pool)).toBe(true);
    pool.deck = [];
    expect(deckHasCards(pool)).toBe(false);
    expect(deckHasCards(undefined)).toBe(false);
  });
});

describe("removeCommitted", () => {
  test("the card in play leaves the game, its boost goes to the discard", () => {
    const pool = initIrlPool(deck());
    const played = pool.hand[0].title;
    commitCard(pool, 0);
    boostFromTopDeck(pool);
    const boost = pool.commit.boost?.title;
    removeCommitted(pool);
    expect(pool.removed?.map((c) => c.title)).toEqual([played]);
    expect(pool.discard.map((c) => c.title)).toEqual([boost]);
    expect(pool.commit).toEqual({ main: null, reveal: false, boost: null });
  });

  test("no card in play is a no-op", () => {
    const pool = initIrlPool(deck());
    removeCommitted(pool);
    expect(pool.removed).toEqual([]);
  });
});

describe("the in-play loop", () => {
  const played = () => {
    const pool = initIrlPool(deck());
    commitCard(pool, 0);
    return pool;
  };

  test("undoDeckBoost puts the boost back on top of the deck, not in hand", () => {
    const pool = played();
    const deckBefore = pool.deck?.map((c) => c.title);
    const handBefore = pool.hand.length;
    boostFromTopDeck(pool);
    undoDeckBoost(pool);
    expect(pool.commit.boost).toBeNull();
    expect(pool.deck?.map((c) => c.title)).toEqual(deckBefore);
    expect(pool.hand).toHaveLength(handBefore);
  });

  test("returnCommitToHand returns the played card and re-decks the boost", () => {
    const pool = played();
    const main = pool.commit.main?.title;
    const deckBefore = pool.deck?.length ?? 0;
    boostFromTopDeck(pool);
    returnCommitToHand(pool);
    expect(pool.commit).toEqual({ main: null, reveal: false, boost: null });
    expect(pool.hand).toHaveLength(IRL_OPENING_HAND);
    expect(pool.hand[pool.hand.length - 1].title).toBe(main);
    expect(pool.deck).toHaveLength(deckBefore);
  });

  test("discardInPlay spends main then boost onto the END of the discard", () => {
    const pool = played();
    pool.discard.push(pool.hand.pop()!); // an older discard
    const older = pool.discard[0].title;
    const main = pool.commit.main?.title;
    boostFromTopDeck(pool);
    const boost = pool.commit.boost?.title;
    discardInPlay(pool);
    expect(pool.discard.map((c) => c.title)).toEqual([older, main, boost]);
    expect(pool.commit).toEqual({ main: null, reveal: false, boost: null });
  });

  test("discardInPlay without a boost spends just the card", () => {
    const pool = played();
    const main = pool.commit.main?.title;
    discardInPlay(pool);
    expect(pool.discard.map((c) => c.title)).toEqual([main]);
  });
});

describe("irl session persistence (write → reload → read)", () => {
  test("restores hand, deck order, discard, removed, commit and counters", () => {
    const pool = initIrlPool(deck());
    commitCard(pool, 0);
    revealCommit(pool);
    boostFromTopDeck(pool);
    removeCard(pool, 0);
    pool.discard.push(pool.hand.pop()!);
    adjustHp(pool, "hero", -3);
    adjustHp(pool, "sidekick", -1);
    pool.extraCharacters = [
      {
        hero: { hp: 2, isRanged: false, move: 2, name: "skeleton", specialAbility: "" },
        sidekick: { hp: null, isRanged: false, name: "Sidekick", quantity: 0, quote: "" },
      },
    ];
    adjustExtraCharacterHp(pool, 0, "hero", -1);

    expect(saveIrlPool("J-kyHqVXg", pool)).toBe(true);
    // a reload: nothing survives but localStorage
    const restored = loadIrlPool("J-kyHqVXg");

    expect(restored).toEqual(JSON.parse(JSON.stringify(pool)));
    expect(restored?.deck?.map((c) => c.title)).toEqual(
      pool.deck?.map((c) => c.title),
    );
    expect(restored?.commit.reveal).toBe(true);
    expect(restored?.commit.boost).not.toBeNull();
    expect(restored?.hero.hp).toBe((_mockDeck.deck_data.hero.hp ?? 0) - 3);
    expect(restored?.extraCharacters[0].hero.hp).toBe(1);
    expect(restored?.removed).toHaveLength(1);
  });

  test("is keyed per deck — another deck id reads nothing", () => {
    saveIrlPool("deck-a", initIrlPool(deck()));
    expect(window.localStorage.getItem(irlStorageKey("deck-a"))).not.toBeNull();
    expect(loadIrlPool("deck-b")).toBeUndefined();
  });

  test("clear removes the save", () => {
    saveIrlPool("deck-a", initIrlPool(deck()));
    clearIrlPool("deck-a");
    expect(loadIrlPool("deck-a")).toBeUndefined();
  });

  test("junk, a foreign version, or a mismatched deck id reads as nothing", () => {
    window.localStorage.setItem(irlStorageKey("x"), "{not json");
    expect(loadIrlPool("x")).toBeUndefined();

    const pool = initIrlPool(deck());
    window.localStorage.setItem(
      irlStorageKey("x"),
      JSON.stringify({ v: 99, deckId: "x", pool }),
    );
    expect(loadIrlPool("x")).toBeUndefined();

    window.localStorage.setItem(
      irlStorageKey("x"),
      JSON.stringify({ v: 1, deckId: "y", pool }),
    );
    expect(loadIrlPool("x")).toBeUndefined();
  });

  test("a save from before the removed zone restores with an empty one", () => {
    const pool = initIrlPool(deck());
    delete pool.removed;
    saveIrlPool("old", pool);
    expect(loadIrlPool("old")?.removed).toEqual([]);
  });
});
