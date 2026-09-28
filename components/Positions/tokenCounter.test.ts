import { mockDeck as _mockDeck } from "@/_mocks_/deck";
import { cloneDeep } from "lodash";
import { PoolType, adjustHp, newPool } from "../DeckPool/PoolFns";
import { TokenCounter } from "./position.type";
import {
  adjustTokenCounter,
  clampToCounter,
  counterDisplay,
  counterLimits,
} from "./tokenCounter";

/** A pool whose hero has 12 hp and one extra character, Piper, with 10. */
const lucyPool = (): PoolType => {
  const pool = newPool(cloneDeep(_mockDeck));
  pool.hero.hp = 12;
  pool.extraCharacters = [
    {
      hero: { hp: 10, isRanged: false, move: 2, name: "Piper", specialAbility: "" },
      sidekick: { hp: null, isRanged: false, name: "Sidekick", quantity: null, quote: "" },
    },
  ];
  return pool;
};

/** Apply a free counter's adjust the way GameShell patches the token. */
const bumpFree = (counter: TokenCounter, delta: number): TokenCounter => {
  const next = adjustTokenCounter(counter, undefined, delta);
  return next && "counter" in next ? next.counter : counter;
};

describe("free counter limits (#1004)", () => {
  test("clamps at both ends", () => {
    let c: TokenCounter = { value: 1, min: 0, max: 3 };
    c = bumpFree(c, -1);
    expect(c.value).toBe(0);
    expect(adjustTokenCounter(c, undefined, -1)).toBeNull();
    c = bumpFree(bumpFree(bumpFree(bumpFree(c, 1), 1), 1), 1);
    expect(c).toEqual({ value: 3, min: 0, max: 3 });
    expect(adjustTokenCounter(c, undefined, 5)).toBeNull();
  });

  test("a big step lands on the limit, not past it", () => {
    expect(bumpFree({ value: 2, min: 0, max: 12 }, -5).value).toBe(0);
    expect(bumpFree({ value: 2, min: 0, max: 12 }, 50).value).toBe(12);
  });

  test("one limit alone clamps only that end", () => {
    expect(bumpFree({ value: 0, min: 0 }, 100).value).toBe(100);
    expect(bumpFree({ value: 0, min: 0 }, -1).value).toBe(0);
    expect(bumpFree({ value: 5, max: 5 }, -20).value).toBe(-15);
  });

  test("missing limits behave as today: no floor, no ceiling", () => {
    expect(bumpFree({ value: 0 }, -3)).toEqual({ value: -3 });
    expect(bumpFree({ value: 99 }, 1)).toEqual({ value: 100 });
    expect(bumpFree({}, 1)).toEqual({ value: 1 });
  });

  test("junk or crossed limits are no limit, never a crash", () => {
    const junk = { value: 4, min: "0", max: null } as unknown as TokenCounter;
    expect(counterLimits(junk)).toEqual({ min: undefined, max: undefined });
    expect(bumpFree(junk, -10).value).toBe(-6);
    expect(counterLimits({ min: 5, max: 1 })).toEqual({});
    expect(clampToCounter(9, { min: 5, max: 1 })).toBe(9);
    expect(clampToCounter(Infinity, { max: NaN })).toBe(Infinity);
  });

  test("keeps the limits (and anything else) on the counter it writes", () => {
    expect(bumpFree({ value: 3, min: 0, max: 10 }, 1)).toEqual({ value: 4, min: 0, max: 10 });
  });

  test("shows its value; a counter without one shows 0", () => {
    expect(counterDisplay({ value: 7, min: 0, max: 10 }, undefined)).toBe(7);
    expect(counterDisplay({}, undefined)).toBe(0);
    expect(counterDisplay(undefined, undefined)).toBeUndefined();
  });
});

describe("a counter an old client stripped to {value}", () => {
  // An old tab replaces the whole counter with `{value}` on every adjust
  // (GameShell / token library before #1004).
  const oldAdjust = (c: TokenCounter, delta: number): TokenCounter => ({
    value: (c.value ?? 0) + delta,
  });

  test("still renders and adjusts, just without limits", () => {
    const stripped = oldAdjust({ value: 0, min: 0, max: 10 }, -1);
    expect(stripped).toEqual({ value: -1 });
    expect(counterDisplay(stripped, undefined)).toBe(-1);
    expect(bumpFree(stripped, -1)).toEqual({ value: -2 });
    expect(bumpFree(stripped, 3)).toEqual({ value: 2 });
  });
});

describe("extra-character link (#1004)", () => {
  const piper: TokenCounter = { link: "extra", extra: 0, min: 0, max: 10 };

  test("reads the linked character's health", () => {
    expect(counterDisplay(piper, lucyPool())).toBe(10);
  });

  test("writes that character's health, clamped to the dial", () => {
    const pool = lucyPool();
    let next = adjustTokenCounter(piper, pool, -4);
    expect(next && "pool" in next && next.pool.extraCharacters[0].hero.hp).toBe(6);
    // The hero is untouched.
    expect(pool.hero.hp).toBe(12);

    next = adjustTokenCounter(piper, pool, -50);
    expect(next && "pool" in next && next.pool.extraCharacters[0].hero.hp).toBe(0);
    expect(adjustTokenCounter(piper, pool, -1)).toBeNull();

    pool.extraCharacters[0].hero.hp = 10;
    expect(adjustTokenCounter(piper, pool, 1)).toBeNull();
    expect(pool.extraCharacters[0].hero.hp).toBe(10);
  });

  test("with no limits it does not clamp", () => {
    const pool = lucyPool();
    adjustTokenCounter({ link: "extra", extra: 0 }, pool, 5);
    expect(pool.extraCharacters[0].hero.hp).toBe(15);
  });

  test("the second character, not the first", () => {
    const pool = lucyPool();
    pool.extraCharacters.push({
      hero: { hp: 9, isRanged: false, move: 2, name: "White Spy", specialAbility: "" },
      sidekick: { hp: null, isRanged: false, name: "Sidekick", quantity: null, quote: "" },
    });
    const second: TokenCounter = { link: "extra", extra: 1, min: 0, max: 20 };
    expect(counterDisplay(second, pool)).toBe(9);
    adjustTokenCounter(second, pool, -2);
    expect(pool.extraCharacters[1].hero.hp).toBe(7);
    expect(pool.extraCharacters[0].hero.hp).toBe(10);
  });

  test("no pool, no such character, or no health: '–' and no write", () => {
    expect(counterDisplay(piper, undefined)).toBeNull();
    expect(adjustTokenCounter(piper, undefined, 1)).toBeNull();
    const missing: TokenCounter = { link: "extra", extra: 3 };
    expect(counterDisplay(missing, lucyPool())).toBeNull();
    expect(adjustTokenCounter(missing, lucyPool(), 1)).toBeNull();
    const pool = lucyPool();
    pool.extraCharacters[0].hero.hp = null;
    expect(counterDisplay(piper, pool)).toBeNull();
    expect(adjustTokenCounter(piper, pool, 1)).toBeNull();
    const noExtras = lucyPool();
    delete (noExtras as Partial<PoolType>).extraCharacters;
    expect(counterDisplay(piper, noExtras)).toBeNull();
  });

  test("an old client: shows '–' and a click writes nothing new", () => {
    // GameShell before #1004, verbatim.
    const oldDisplay = (c: TokenCounter, pool?: PoolType) =>
      c.link
        ? (pool as unknown as Record<string, { hp?: number | null } | undefined>)?.[c.link]?.hp ?? null
        : c.value ?? 0;
    const pool = lucyPool();
    const before = cloneDeep(pool);
    expect(oldDisplay(piper, pool)).toBeNull();
    // Its click path: adjustHp(pool, link, delta) → the pool back unchanged.
    expect(() => adjustHp(pool, "extra" as "hero", 1)).not.toThrow();
    expect(pool).toEqual(before);
  });
});

describe("hero and sidekick links are never clamped", () => {
  test("limits on a hero link are ignored", () => {
    const pool = lucyPool();
    const c: TokenCounter = { link: "hero", min: 0, max: 12 };
    adjustTokenCounter(c, pool, 5);
    expect(pool.hero.hp).toBe(17);
    adjustTokenCounter(c, pool, -30);
    expect(pool.hero.hp).toBe(-13);
  });

  test("reads the owner's HUD health; null without a pool", () => {
    expect(counterDisplay({ link: "hero" }, lucyPool())).toBe(12);
    expect(counterDisplay({ link: "hero" }, undefined)).toBeNull();
    expect(adjustTokenCounter({ link: "sidekick" }, undefined, 1)).toBeNull();
  });

  test("a link this client doesn't know shows '–' and ignores clicks", () => {
    const future = { link: "villain" } as unknown as TokenCounter;
    expect(counterDisplay(future, lucyPool())).toBeNull();
    expect(adjustTokenCounter(future, lucyPool(), 1)).toBeNull();
  });
});
