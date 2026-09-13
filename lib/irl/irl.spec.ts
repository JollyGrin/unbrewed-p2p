import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { cloneDeep } from "lodash";
import {
  PoolType,
  adjustExtraCharacterHp,
  adjustHp,
  commitCard,
  removeCard,
  revealCommit,
} from "@/components/DeckPool/PoolFns";
import {
  IRL_OPENING_HAND,
  boostChoices,
  boostFromHand,
  boostTotal,
  cancelBoosts,
  deckHasCards,
  discardInPlay,
  inPlayBoosts,
  initIrlPool,
  isBoostable,
  removeCommitted,
  returnCommitToHand,
} from "./irlPool";
import {
  clearIrlPool,
  irlStorageKey,
  loadIrlPool,
  saveIrlPool,
} from "./irlStorage";

const deck = () => cloneDeep(_mockDeck);
const titles = (cards?: { title: string }[] | null) =>
  (cards ?? []).map((c) => c.title);

beforeEach(() => window.localStorage.clear());

/** hand boost values; card 2 (0) and card 3 (null) can't boost */
const BOOSTS = [3, 2, 0, null, 1];

/** A fresh game whose five-card hand is distinct, known cards. */
const table = (): PoolType => {
  const pool = initIrlPool(deck());
  pool.hand = pool.hand.map((card, i) => ({
    ...card,
    title: `card ${i}`,
    boost: BOOSTS[i] as number,
  }));
  return pool;
};

/** card 0 played face-down; hand left: card 1 (+2), card 2 (0), card 3 (null), card 4 (+1) */
const played = (): PoolType => {
  const pool = table();
  commitCard(pool, 0);
  return pool;
};

const EMPTY_COMMIT = { main: null, reveal: false, boost: null };

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

describe("boosts come from hand (rules §5.4)", () => {
  test("isBoostable: only a positive BOOST value", () => {
    expect(table().hand.map(isBoostable)).toEqual([true, true, false, false, true]);
    expect(isBoostable(undefined)).toBe(false);
  });

  test("unboostable cards are never offered", () => {
    expect(boostChoices(played())).toEqual([0, 3]); // card 1, card 4
  });

  test("boost from hand moves exactly one hand card into the boost slot", () => {
    const pool = played();
    const deckBefore = titles(pool.deck);
    boostFromHand(pool, 0);
    expect(pool.commit.boost?.title).toBe("card 1");
    expect(titles(pool.hand)).toEqual(["card 2", "card 3", "card 4"]);
    expect(titles(pool.deck)).toEqual(deckBefore); // never the deck
    expect(pool.discard).toEqual([]);
  });

  test("an unboostable card is refused", () => {
    const pool = played();
    boostFromHand(pool, 1); // boost 0
    boostFromHand(pool, 2); // boost null
    expect(pool.commit.boost).toBeNull();
    expect(pool.hand).toHaveLength(4);
  });

  test("no card in play, no boost", () => {
    const pool = table();
    boostFromHand(pool, 0);
    expect(pool.commit.boost).toBeNull();
    expect(pool.hand).toHaveLength(5);
  });

  test("a second boost stacks, and the total sums both", () => {
    const pool = played();
    boostFromHand(pool, 0); // card 1, +2
    boostFromHand(pool, 2); // card 4, +1
    expect(titles(inPlayBoosts(pool))).toEqual(["card 1", "card 4"]);
    expect(boostTotal(pool)).toBe(3);
    expect(titles(pool.hand)).toEqual(["card 2", "card 3"]);
  });

  test("cancel boost returns every boost card to hand, none to the deck", () => {
    const pool = played();
    const deckBefore = titles(pool.deck);
    boostFromHand(pool, 0);
    boostFromHand(pool, 2);
    cancelBoosts(pool);
    expect(inPlayBoosts(pool)).toEqual([]);
    expect(pool.commit.extraBoosts).toBeUndefined();
    expect(titles(pool.hand).sort()).toEqual(["card 1", "card 2", "card 3", "card 4"]);
    expect(titles(pool.deck)).toEqual(deckBefore);
    expect(pool.commit.main?.title).toBe("card 0"); // the played card stays
  });

  test("return to hand brings back the card and every boost", () => {
    const pool = played();
    boostFromHand(pool, 0);
    boostFromHand(pool, 2);
    returnCommitToHand(pool);
    expect(pool.commit).toEqual(EMPTY_COMMIT);
    expect(pool.commit.extraBoosts).toBeUndefined();
    expect(titles(pool.hand).sort()).toEqual(["card 0", "card 1", "card 2", "card 3", "card 4"]);
  });

  test("discard spends main, then each boost, onto the END of the discard", () => {
    const pool = played();
    pool.discard = [{ ...pool.hand[1], title: "older" }];
    boostFromHand(pool, 0);
    boostFromHand(pool, 2);
    discardInPlay(pool);
    expect(titles(pool.discard)).toEqual(["older", "card 0", "card 1", "card 4"]);
    expect(pool.commit).toEqual(EMPTY_COMMIT);
    expect(pool.commit.extraBoosts).toBeUndefined();
  });

  test("discard without a boost spends just the card", () => {
    const pool = played();
    discardInPlay(pool);
    expect(titles(pool.discard)).toEqual(["card 0"]);
  });
});

describe("removeCommitted", () => {
  test("the card in play leaves the game, its boosts go to the discard", () => {
    const pool = played();
    boostFromHand(pool, 0);
    boostFromHand(pool, 2);
    removeCommitted(pool);
    expect(titles(pool.removed)).toEqual(["card 0"]);
    expect(titles(pool.discard)).toEqual(["card 1", "card 4"]);
    expect(pool.commit).toEqual(EMPTY_COMMIT);
  });

  test("no card in play is a no-op", () => {
    const pool = initIrlPool(deck());
    removeCommitted(pool);
    expect(pool.removed).toEqual([]);
  });
});

describe("irl session persistence (write → reload → read)", () => {
  test("restores hand, deck order, discard, removed, commit and counters", () => {
    const pool = played();
    revealCommit(pool);
    boostFromHand(pool, 0);
    boostFromHand(pool, 2); // a stacked boost rides along too
    removeCard(pool, 0); // hand left: card 3
    pool.discard.push(pool.deck!.pop()!);
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
    expect(titles(restored?.hand)).toEqual(["card 3"]);
    expect(restored?.deck?.map((c) => c.title)).toEqual(
      pool.deck?.map((c) => c.title),
    );
    expect(restored?.commit.reveal).toBe(true);
    expect(titles(inPlayBoosts(restored))).toEqual(["card 1", "card 4"]);
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
