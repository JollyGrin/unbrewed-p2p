import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { cloneDeep } from "lodash";
import {
  PoolType,
  adjustExtraCharacterHp,
  makeDeck,
  newPool,
  removeCard,
  removeFromDiscard,
  returnRemoved,
  shuffleDiscardIntoDeck,
  shuffleRandomDiscardIntoDeck,
} from "./PoolFns";

// Pool helpers added for IRL Mode (issue #798). Kept apart from PoolFns.spec.ts
// so the legacy specs run unedited against the widened PoolType.

const titles = (cards?: { title: string }[]) => (cards ?? []).map((c) => c.title);

/** a built pool with a 3-card hand and a 2-card discard, deck untouched */
const tablePool = (): PoolType => {
  const pool = makeDeck(newPool(cloneDeep(_mockDeck)));
  const deck = pool.deck ?? [];
  pool.hand = deck.splice(deck.length - 3, 3);
  pool.discard = deck.splice(deck.length - 2, 2);
  return pool;
};

describe("newPool removed zone", () => {
  test("starts empty", () => {
    expect(newPool(cloneDeep(_mockDeck)).removed).toEqual([]);
  });
});

describe("removeCard (hand → removed)", () => {
  test("moves exactly the chosen hand card into removed", () => {
    const pool = tablePool();
    const [a, b, c] = titles(pool.hand);
    removeCard(pool, 1);
    expect(titles(pool.hand)).toEqual([a, c]);
    expect(titles(pool.removed)).toEqual([b]);
  });

  test("appends to an existing removed pile and tolerates a legacy pool", () => {
    const pool = tablePool();
    delete pool.removed; // a pool built before the zone existed
    removeCard(pool, 0);
    removeCard(pool, 0);
    expect(pool.removed).toHaveLength(2);
    expect(pool.hand).toHaveLength(1);
  });

  test("an out-of-range index is a no-op", () => {
    const pool = tablePool();
    removeCard(pool, 9);
    expect(pool.hand).toHaveLength(3);
    expect(pool.removed).toEqual([]);
  });
});

describe("removeFromDiscard (discard → removed)", () => {
  test("moves exactly the chosen discard card into removed", () => {
    const pool = tablePool();
    const [first, second] = titles(pool.discard);
    removeFromDiscard(pool, 0);
    expect(titles(pool.discard)).toEqual([second]);
    expect(titles(pool.removed)).toEqual([first]);
  });

  test("an out-of-range index is a no-op", () => {
    const pool = tablePool();
    removeFromDiscard(pool, 5);
    expect(pool.discard).toHaveLength(2);
    expect(pool.removed).toEqual([]);
  });
});

describe("returnRemoved (removed → discard)", () => {
  test("puts the chosen removed card back on the discard pile", () => {
    const pool = tablePool();
    removeCard(pool, 0);
    removeCard(pool, 0);
    const [first, second] = titles(pool.removed);
    returnRemoved(pool, 0);
    expect(titles(pool.removed)).toEqual([second]);
    expect(titles(pool.discard).slice(-1)).toEqual([first]);
    expect(pool.discard).toHaveLength(3);
  });

  test("a legacy pool with no removed zone is a no-op", () => {
    const pool = tablePool();
    delete pool.removed;
    returnRemoved(pool, 0);
    expect(pool.discard).toHaveLength(2);
  });
});

describe("shuffles never pull from removed", () => {
  test("shuffleDiscardIntoDeck leaves removed alone", () => {
    const pool = tablePool();
    removeCard(pool, 0);
    const removedBefore = titles(pool.removed);
    const deckBefore = pool.deck?.length ?? 0;
    shuffleDiscardIntoDeck(pool);
    expect(titles(pool.removed)).toEqual(removedBefore);
    expect(pool.deck).toHaveLength(deckBefore + 2);
  });

  test("shuffleRandomDiscardIntoDeck leaves removed alone", () => {
    const pool = tablePool();
    removeFromDiscard(pool, 0);
    shuffleRandomDiscardIntoDeck(pool, 3);
    expect(pool.removed).toHaveLength(1);
    expect(pool.discard).toEqual([]);
  });
});

describe("adjustExtraCharacterHp", () => {
  const withExtras = (): PoolType => {
    const pool = newPool(cloneDeep(_mockDeck));
    pool.extraCharacters = [
      {
        hero: { hp: 1, isRanged: false, move: 2, name: "skeleton", specialAbility: "" },
        sidekick: { hp: null, isRanged: false, name: "Sidekick", quantity: 0, quote: "" },
      },
      {
        hero: { hp: 4, isRanged: true, move: 2, name: "archer", specialAbility: "" },
        sidekick: { hp: 2, isRanged: false, name: "Momo", quantity: 1, quote: "" },
      },
    ];
    return pool;
  };

  test("adjusts only the indexed character's chosen pawn", () => {
    const pool = withExtras();
    adjustExtraCharacterHp(pool, 1, "hero", -3);
    expect(pool.extraCharacters[1].hero.hp).toBe(1);
    expect(pool.extraCharacters[0].hero.hp).toBe(1);
    expect(pool.extraCharacters[1].sidekick.hp).toBe(2);

    adjustExtraCharacterHp(pool, 1, "sidekick", 1);
    expect(pool.extraCharacters[1].sidekick.hp).toBe(3);
    expect(pool.extraCharacters[1].hero.hp).toBe(1);
  });

  test("leaves the primary hero and sidekick untouched", () => {
    const pool = withExtras();
    const heroHp = pool.hero.hp;
    const sidekickHp = pool.sidekick.hp;
    adjustExtraCharacterHp(pool, 0, "hero", 5);
    expect(pool.hero.hp).toBe(heroHp);
    expect(pool.sidekick.hp).toBe(sidekickHp);
    expect(pool.extraCharacters[0].hero.hp).toBe(6);
  });

  test("never conjures hp onto a pawn with none, and ignores bad indexes", () => {
    const pool = withExtras();
    adjustExtraCharacterHp(pool, 0, "sidekick", 1);
    expect(pool.extraCharacters[0].sidekick.hp).toBeNull();
    expect(() => adjustExtraCharacterHp(pool, 7, "hero", 1)).not.toThrow();
  });
});
