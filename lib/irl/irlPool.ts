import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  adjustSidekickQuantity,
  boostCard,
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
 * table differs from the sandbox, each built on the PoolFns it extends.
 */

/** An Unmatched opening hand. */
export const IRL_OPENING_HAND = 5;

/**
 * Build → shuffle → draw the opening hand. The sandbox's `initPool` opens with
 * ONE card (players there draw up as they like); a paper game starts at five.
 */
export const initIrlPool = (deck: DeckImportType): PoolType =>
  drawMultiple(shuffleDeck(makeDeck(newPool(deck))), IRL_OPENING_HAND);

/** True when the deck has a card to draw. */
export const deckHasCards = (pool?: PoolType): boolean =>
  (pool?.deck?.length ?? 0) > 0;

// --- boosts -----------------------------------------------------------------
//
// Rules §5.4 (unbrewed-pro-server docs/02-unmatched-rules.md): a boost is a
// card discarded FROM HAND for its BOOST value — its own effect ignored — and
// only when a card or ability grants one. Never the top of the deck. Two
// separate grants stack, so the first boost fills PoolFns' `commit.boost`
// slot and any further one stacks in `commit.extraBoosts`.

/** A card can boost only with a printed, positive BOOST value. */
export const isBoostable = (
  card?: DeckImportCardType | null,
): card is DeckImportCardType =>
  typeof card?.boost === "number" && card.boost > 0;

/** Hand indexes that may be picked as a boost — the rest are never offered. */
export const boostChoices = (pool?: PoolType): number[] =>
  (pool?.hand ?? []).flatMap((card, index) => (isBoostable(card) ? [index] : []));

/** Every boost on the card in play, first slot first. */
export const inPlayBoosts = (pool?: PoolType): DeckImportCardType[] => {
  const commit = pool?.commit;
  if (!commit) return [];
  return [commit.boost, ...(commit.extraBoosts ?? [])].filter(
    (card): card is DeckImportCardType => !!card,
  );
};

/** Sum of the boost values on the card in play. */
export const boostTotal = (pool?: PoolType): number =>
  inPlayBoosts(pool).reduce((sum, card) => sum + (card.boost ?? 0), 0);

/** Boost the card in play with hand[cardIndex]. */
export const boostFromHand = (pool: PoolType, cardIndex: number): PoolType => {
  const card = pool.hand?.[cardIndex];
  if (!pool.commit?.main || !isBoostable(card)) return pool;
  if (!pool.commit.boost) return boostCard(pool, cardIndex);
  pool.commit.extraBoosts = [...(pool.commit.extraBoosts ?? []), card];
  pool.hand.splice(cardIndex, 1);
  return pool;
};

/** Lift the stacked boosts off the card in play. */
const takeExtraBoosts = (pool: PoolType): DeckImportCardType[] => {
  const extras = pool.commit.extraBoosts ?? [];
  delete pool.commit.extraBoosts;
  return extras;
};

/** "Cancel boost": every boost card goes back to the hand it came from. */
export const cancelBoosts = (pool: PoolType): PoolType => {
  pool.hand.unshift(...takeExtraBoosts(pool));
  return cancelBoost(pool);
};

/** "Return to hand": the played card and every boost come back. */
export const returnCommitToHand = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  const extras = takeExtraBoosts(pool);
  cancelCommit(pool);
  pool.hand.push(...extras);
  return pool;
};

/**
 * "Discard both": `discardCommit`, then the spent cards moved to the END of
 * the discard (main, then each boost) — where discardCard / mill put a fresh
 * discard — so the Discard sheet's "newest on top" holds for them too.
 */
export const discardInPlay = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  const extras = takeExtraBoosts(pool);
  const spent = pool.commit.boost ? 2 : 1;
  discardCommit(pool);
  // discardCommit unshifts main then boost, leaving [boost, main, ...older]
  pool.discard.push(...pool.discard.splice(0, spent).reverse(), ...extras);
  return pool;
};

/**
 * "Remove from game" on the card in play: the committed card leaves the game,
 * its boosts are spent into the discard as they would be after combat.
 */
export const removeCommitted = (pool: PoolType): PoolType => {
  const { main } = pool.commit;
  if (!main) return pool;
  const boosts = inPlayBoosts(pool);
  pool.removed = [...(pool.removed ?? []), main];
  pool.discard.push(...boosts);
  pool.commit = { main: null, reveal: false, boost: null };
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
