import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { cloneDeep } from "lodash";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { newPool } from "@/components/DeckPool/PoolFns";
import { irlCharacterCount, irlCounters, parseQuote } from "./irlCharacters";

const stubSidekick = { hp: null, isRanged: false, name: "Sidekick", quantity: 0, quote: "" };

/** Skeleton King (yd8d4) shape: a solo hero plus two summonable skeleton types. */
const skeletonKing = (): DeckImportType => {
  const deck = cloneDeep(_mockDeck);
  deck.deck_data.hero = { ...deck.deck_data.hero, name: "Skeleton King", hp: 14, move: 2 };
  deck.deck_data.sidekick = { hp: null, isRanged: false, name: "", quantity: 0, quote: "" };
  deck.deck_data.extraCharacters = [
    { hero: { hp: 1, isRanged: false, move: 2, name: "Skeleton", specialAbility: "" }, sidekick: stubSidekick },
    { hero: { hp: 1, isRanged: true, move: 2, name: "Skeleton Archer", specialAbility: "" }, sidekick: stubSidekick },
  ] as typeof deck.deck_data.extraCharacters;
  return deck;
};

/** A starter-style squad: three sidekicks of 1 hp each. */
const squad = (): DeckImportType => {
  const deck = cloneDeep(_mockDeck);
  deck.deck_data.sidekick = { hp: 1, isRanged: true, name: "Merry Men", quantity: 3, quote: "" };
  deck.deck_data.extraCharacters = [];
  return deck;
};

/** One sidekick with health. */
const duo = (): DeckImportType => {
  const deck = cloneDeep(_mockDeck);
  deck.deck_data.sidekick = { hp: 6, isRanged: false, name: "The Monster", quantity: 1, quote: "" };
  deck.deck_data.extraCharacters = [];
  return deck;
};

describe("irlCounters", () => {
  test("hero + one counter per extra character (Skeleton King)", () => {
    const deck = skeletonKing();
    const pool = newPool(deck);
    const counters = irlCounters(deck, pool);
    expect(counters.map((c) => [c.id, c.kind, c.value, c.start])).toEqual([
      ["hero", "hp", 14, 14],
      ["extra-0-hero", "hp", 1, 1],
      ["extra-1-hero", "hp", 1, 1],
    ]);

    // each extra counter moves only its own character
    counters[2].adjust(pool, 1);
    expect(pool.extraCharacters[1].hero.hp).toBe(2);
    expect(pool.extraCharacters[0].hero.hp).toBe(1);
    expect(pool.hero.hp).toBe(14);
    expect(irlCounters(deck, pool)[2].value).toBe(2);
  });

  test("a squad (quantity > 1) gets a count counter, not HP", () => {
    const deck = squad();
    const pool = newPool(deck);
    const sidekick = irlCounters(deck, pool).find((c) => c.id === "sidekick")!;
    expect(sidekick.kind).toBe("count");
    expect([sidekick.value, sidekick.start]).toEqual([3, 3]);

    sidekick.adjust(pool, -1);
    expect(pool.sidekick.quantity).toBe(2);
    expect(pool.sidekick.hp).toBe(1); // hp untouched
  });

  test("a squad keeps its count counter down to 0, and can come back from 0", () => {
    const deck = squad();
    const pool = newPool(deck);
    const counter = () => irlCounters(deck, pool).find((c) => c.id === "sidekick")!;
    counter().adjust(pool, -1);
    counter().adjust(pool, -1);
    expect(counter().kind).toBe("count"); // at 1, still counting
    counter().adjust(pool, -1);
    counter().adjust(pool, -1); // floored
    expect(counter().value).toBe(0);
    counter().adjust(pool, 1);
    expect(counter().value).toBe(1);
  });

  test("a lone sidekick (quantity ≤ 1) tracks health", () => {
    const deck = duo();
    const pool = newPool(deck);
    const sidekick = irlCounters(deck, pool).find((c) => c.id === "sidekick")!;
    expect(sidekick.kind).toBe("hp");
    sidekick.adjust(pool, -2);
    expect(pool.sidekick.hp).toBe(4);
    expect(pool.sidekick.quantity).toBe(1);
  });

  test("health never goes below zero", () => {
    const deck = duo();
    const pool = newPool(deck);
    irlCounters(deck, pool)[0].adjust(pool, -99);
    expect(pool.hero.hp).toBe(0);
  });

  test("no sidekick counter for the API's blank stub", () => {
    const deck = skeletonKing();
    expect(irlCounters(deck, newPool(deck)).some((c) => c.id === "sidekick")).toBe(false);
  });
});

describe("irlCharacterCount", () => {
  test("counts the hero, a fielded sidekick and every extra character", () => {
    expect(irlCharacterCount(skeletonKing())).toBe(3);
    expect(irlCharacterCount(squad())).toBe(2);
  });
});

describe("parseQuote", () => {
  test("splits unmatched.cards' quote blob into words and attribution", () => {
    const raw =
      '"I will pioneer a new way, explore unknown powers, and unfold to the world the deepest mysteries of creation."\n                                                 -Mary Shelley\n';
    expect(parseQuote(raw)).toEqual({
      text: "I will pioneer a new way, explore unknown powers, and unfold to the world the deepest mysteries of creation.",
      by: "– Mary Shelley",
    });
  });

  test("an unattributed quote and a blank one", () => {
    expect(parseQuote("Onward!")).toEqual({ text: "Onward!", by: undefined });
    expect(parseQuote("  \n ")).toBeUndefined();
    expect(parseQuote(undefined)).toBeUndefined();
  });
});
