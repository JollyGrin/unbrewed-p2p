/**
 * The number badge on a board token (#1004): what it shows and what a click
 * does. Hero and sidekick links behave exactly as they always have (no
 * limits); a detached counter and the extra-character link clamp to the
 * counter's optional `min`/`max`.
 */
import {
  PoolType,
  adjustExtraCharacterHp,
  adjustHp,
} from "../DeckPool/PoolFns";
import { TokenCounter } from "./position.type";

const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/** A counter's limits. Missing, non-numeric or crossed (min > max) = none. */
export const counterLimits = (
  counter?: TokenCounter,
): { min?: number; max?: number } => {
  const min = num(counter?.min);
  const max = num(counter?.max);
  if (min !== undefined && max !== undefined && min > max) return {};
  return { min, max };
};

export const clampToCounter = (value: number, counter?: TokenCounter) => {
  const { min, max } = counterLimits(counter);
  if (max !== undefined && value > max) return max;
  if (min !== undefined && value < min) return min;
  return value;
};

const extraHp = (counter: TokenCounter, pool?: PoolType) => {
  const hp = pool?.extraCharacters?.[counter.extra ?? -1]?.hero?.hp;
  return num(hp);
};

/**
 * The badge number: undefined = no badge, null = linked but nothing to read
 * (no pool yet, no such character, or a link this client doesn't know).
 */
export const counterDisplay = (
  counter: TokenCounter | undefined,
  pool: PoolType | undefined,
): number | null | undefined => {
  if (!counter) return undefined;
  switch (counter.link) {
    case undefined:
      return num(counter.value) ?? 0;
    case "hero":
    case "sidekick":
      return pool?.[counter.link]?.hp ?? null;
    case "extra":
      return extraHp(counter, pool) ?? null;
    default:
      return null;
  }
};

export type CounterAdjust =
  | { pool: PoolType }
  | { counter: TokenCounter }
  | null;

/**
 * What a badge click by the owner writes: a new pool (linked counters), a
 * new counter for the token (detached), or nothing (at a limit, or nothing
 * to adjust). The detached counter keeps every other field it carries.
 */
export const adjustTokenCounter = (
  counter: TokenCounter | undefined,
  pool: PoolType | undefined,
  delta: number,
): CounterAdjust => {
  if (!counter || delta === 0) return null;
  switch (counter.link) {
    case undefined: {
      const value = num(counter.value) ?? 0;
      const next = clampToCounter(value + delta, counter);
      return next === value ? null : { counter: { ...counter, value: next } };
    }
    case "hero":
    case "sidekick":
      return pool ? { pool: adjustHp(pool, counter.link, delta) } : null;
    case "extra": {
      const hp = extraHp(counter, pool);
      if (!pool || hp === undefined) return null;
      const next = clampToCounter(hp + delta, counter);
      if (next === hp) return null;
      return {
        pool: adjustExtraCharacterHp(pool, counter.extra!, "hero", next - hp),
      };
    }
    default:
      return null;
  }
};
