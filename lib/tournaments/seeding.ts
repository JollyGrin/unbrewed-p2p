/**
 * The organizer's drag-to-reorder seeding (#1217), before the bracket starts.
 *
 * The list is entry ids, best seed first. `PUT /tournaments/:slug/seeds` takes
 * `{ order }` with every ACTIVE entry exactly once; the api answers
 * `400 invalid_seed_order` otherwise, so `seedPayload` refuses to build one.
 */
import { activeEntries } from "./joinState";
import { seedOrder } from "./bracket";
import type { Entry } from "./types";

/**
 * Starting order: the organizer's saved seeds when every active entry has one
 * (what Start will use), else join order (Start would randomise; this is just
 * the list the organizer begins dragging from).
 */
export const initialSeedOrder = (entries: readonly Entry[]): string[] => {
  const active = activeEntries(entries);
  const seeded = active.every((e) => e.seed !== null);
  return [...active]
    .sort((x, y) =>
      seeded ? (x.seed as number) - (y.seed as number) : x.joinedAt.localeCompare(y.joinedAt),
    )
    .map((e) => e.id);
};

/** True when every active entry already has a seed (Start keeps this order). */
export const hasSavedSeeds = (entries: readonly Entry[]): boolean => {
  const active = activeEntries(entries);
  return active.length > 0 && active.every((e) => e.seed !== null);
};

/** Move the entry at `from` to index `to` (drag, or the ↑/↓ buttons). */
export const moveSeed = (order: readonly string[], from: number, to: number): string[] => {
  if (from === to || from < 0 || from >= order.length) return [...order];
  const next = [...order];
  const [id] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
  return next;
};

/** Fisher–Yates with an injectable rng, for the "Shuffle" button. */
export const shuffleSeeds = (order: readonly string[], rng: () => number = Math.random): string[] => {
  const next = [...order];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

/**
 * The `PUT …/seeds` body, or null when `order` isn't exactly the active
 * entries (someone joined or left since the list was built — reload first).
 */
export const seedPayload = (
  order: readonly string[],
  entries: readonly Entry[],
): { order: string[] } | null => {
  const active = new Set(activeEntries(entries).map((e) => e.id));
  if (order.length !== active.size || new Set(order).size !== order.length) return null;
  if (!order.every((id) => active.has(id))) return null;
  return { order: [...order] };
};

/**
 * Round-1 pairings the order produces in a bracket of `size`: `[seedA, seedB]`
 * by bracket position, `null` for a bye seat. 8 seats, 6 entrants →
 * [[1,null],[4,5],[2,null],[3,6]].
 */
export const roundOnePairs = (size: number, entrants: number): [number | null, number | null][] => {
  const order = seedOrder(size).map((s) => (s <= entrants ? s : null));
  const pairs: [number | null, number | null][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
};

/** "Seed 1 meets seed 8" for the hint line; byes once entrants < size. */
export const opponentOfSeed = (seed: number, size: number, entrants: number): number | null => {
  for (const [a, b] of roundOnePairs(size, entrants)) {
    if (a === seed) return b;
    if (b === seed) return a;
  }
  return null;
};
