import { PoolType } from "@/components/DeckPool/PoolFns";
import { safeRemoveItem, safeSetItem } from "@/lib/storage/quota";

/**
 * IRL Mode session persistence (issue #798). A phone at a table gets locked,
 * backgrounded and evicted by mobile Safari; losing the game mid-match is the
 * one failure that makes the mode useless. So the whole pool — hand, deck
 * order, discard, removed pile, the card in play and every HP counter (they
 * live on `pool.hero` / `pool.sidekick` / `pool.extraCharacters`) — is written
 * after every change and restored when the same deck is opened again.
 *
 * Nothing else in the app reads these keys. Writes go through `safeSetItem` so
 * a full device surfaces the shared quota toast instead of throwing.
 */

const VERSION = 1;

type IrlSave = { v: number; deckId: string; pool: PoolType };

export const irlStorageKey = (deckId: string): string => `irl:${deckId}`;

export const saveIrlPool = (deckId: string, pool: PoolType): boolean => {
  const save: IrlSave = { v: VERSION, deckId, pool };
  return safeSetItem(irlStorageKey(deckId), JSON.stringify(save));
};

/** The saved pool for `deckId`, or undefined when there is none (or it's junk). */
export const loadIrlPool = (deckId: string): PoolType | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(irlStorageKey(deckId));
    if (!raw) return undefined;
    const save = JSON.parse(raw) as Partial<IrlSave>;
    const pool = save?.pool;
    if (
      save?.v !== VERSION ||
      save.deckId !== deckId ||
      !pool ||
      !Array.isArray(pool.hand) ||
      !Array.isArray(pool.deck) ||
      !Array.isArray(pool.discard) ||
      !pool.commit
    ) {
      return undefined;
    }
    return { ...pool, removed: pool.removed ?? [] };
  } catch {
    return undefined;
  }
};

export const clearIrlPool = (deckId: string): void => {
  try {
    safeRemoveItem(irlStorageKey(deckId));
  } catch {
    // storage blocked (private mode) — nothing was saved to clear
  }
};
