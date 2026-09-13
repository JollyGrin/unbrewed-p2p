import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  addCardToDeckTop,
  adjustSidekickQuantity,
  cancelBoost,
  cancelCommit,
  discardCommit,
  drawMultiple,
  makeDeck,
  newPool,
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";

/**
 * Pool helpers that only IRL Mode (issue #798) needs. Everything else IRL does
 * is a straight call into PoolFns — these are the few places where a paper
 * table differs from the sandbox, each built on the PoolFns it corrects.
 */

/** An Unmatched opening hand. */
export const IRL_OPENING_HAND = 5;

/**
 * Build → shuffle → draw the opening hand. The sandbox's `initPool` opens with
 * ONE card (players there draw up as they like); a paper game starts at five.
 */
export const initIrlPool = (deck: DeckImportType): PoolType =>
  drawMultiple(shuffleDeck(makeDeck(newPool(deck))), IRL_OPENING_HAND);

/** True when the deck has a card to draw or boost with. */
export const deckHasCards = (pool?: PoolType): boolean =>
  (pool?.deck?.length ?? 0) > 0;

/**
 * "Remove from game" on the card in play: the committed card leaves the game,
 * its boost (if any) is spent into the discard as it would be after combat.
 */
export const removeCommitted = (pool: PoolType): PoolType => {
  const { main, boost } = pool.commit;
  if (!main) return pool;
  pool.removed = [...(pool.removed ?? []), main];
  if (boost) pool.discard.unshift(boost);
  pool.commit = { main: null, reveal: false, boost: null };
  return pool;
};

/**
 * Undo "Boost from deck": the boost goes back on top of the deck it came from.
 * `cancelBoost` sends it to the HAND — right for a boost played from hand, but
 * IRL only boosts from the deck, where that would be a free draw.
 */
export const undoDeckBoost = (pool: PoolType): PoolType => {
  const boost = pool.commit.boost;
  if (!boost) return pool;
  if (!pool.deck) return cancelBoost(pool);
  pool.commit.boost = null;
  return addCardToDeckTop(pool, boost);
};

/** "Return to hand": the played card comes back, a deck boost goes back on the deck. */
export const returnCommitToHand = (pool: PoolType): PoolType =>
  cancelCommit(undoDeckBoost(pool));

/**
 * "Discard both": `discardCommit`, then the spent cards moved to the END of
 * the discard (main, then boost) — where discardCard / mill put a fresh
 * discard — so the Discard sheet's "newest on top" holds for them too.
 */
export const discardInPlay = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  const spent = pool.commit.boost ? 2 : 1;
  discardCommit(pool);
  // discardCommit unshifts main then boost, leaving [boost, main, ...older]
  pool.discard.push(...pool.discard.splice(0, spent).reverse());
  return pool;
};

/**
 * A sidekick squad's count counter, floored at 0. `adjustSidekickQuantity`
 * refuses to move off 0, so a mis-tapped last clone could never come back.
 */
export const adjustSidekickCount = (pool: PoolType, delta: number): PoolType => {
  const quantity = pool.sidekick.quantity ?? 0;
  if (quantity === 0) {
    if (delta > 0) pool.sidekick.quantity = delta;
    return pool;
  }
  return adjustSidekickQuantity(pool, Math.max(delta, -quantity));
};
