import { DeckImportCardType, DeckImportType } from "./deck-import.type";

export type PoolType = {
  author: string;
  deckid: string;
  deckName: string;
  deckNote: string;
  cards: DeckImportCardType[];
  deck: DeckImportCardType[] | null;
  hero: PawnInfo & { move: number; specialAbility: string };
  sidekick: PawnInfo & { quantity: number | null; quote: string };
  hand: DeckImportCardType[];
  discard: DeckImportCardType[];
  commit: {
    main: DeckImportCardType | null;
    reveal: boolean;
    boost: DeckImportCardType | null;
  };
};
export type PawnInfo = {
  hp: number | null;
  isRanged: boolean;
  name: string;
};

export const newPool = (deckData: DeckImportType): PoolType => {
  const { user, family_id, name, note, deck_data } = deckData;
  const { cards, hero, sidekick } = deck_data;
  return {
    author: user,
    deckid: family_id,
    deckName: name,
    deckNote: note,
    cards: cards,
    deck: null,
    hero: {
      hp: hero.hp,
      isRanged: hero.isRanged,
      move: hero.move,
      name: hero.name,
      specialAbility: hero.specialAbility,
    },
    sidekick: {
      hp: sidekick.hp,
      isRanged: sidekick.isRanged,
      quantity: sidekick.quantity,
      name: sidekick.name,
      quote: sidekick.quote,
    },
    hand: [],
    discard: [],
    commit: {
      main: null,
      reveal: false,
      boost: null,
    },
  };
};

//   /**
//    * Create a deck by expanding unique cards by their quantity number
//    */
export const makeDeck = (pool: PoolType): PoolType => {
  const newDeck: DeckImportCardType[] = pool.cards
    // hero/rule cards (e.g. from TTS imports) stay out of the draw deck
    .filter((card) => !card.isCharacterCard)
    .flatMap(({ quantity, ...rest }) => Array(quantity).fill({ quantity, ...rest }));
  return {
    ...pool,
    deck: newDeck,
  };
};

//   /**
//    * Shuffle deck using the Fisher-Yates shuffle
//    */
export const shuffleDeck = (pool: PoolType): PoolType => {
  if (!pool.deck) return pool;

  for (let i = pool.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool.deck[i], pool.deck[j]] = [pool.deck[j], pool.deck[i]];
  }
  return pool;
};

export const draw = (pool: PoolType): PoolType => {
  if (!pool?.deck || !pool?.hand) return pool;
  if (pool.deck.length === 0) {
    alert("No cards left");
  }
  const card = pool?.deck?.pop();
  if (card) {
    pool.hand.push(card);
  }

  return pool;
};

export const adjustHp = (
  pool: PoolType,
  selectedPawn: "hero" | "sidekick",
  adjustAmount: number,
): PoolType => {
  if (adjustAmount === 0) return pool;
  if (!pool[selectedPawn] || !pool[selectedPawn]?.hp === null) return pool;
  const hp = pool[selectedPawn].hp ?? 0;
  pool[selectedPawn].hp = hp + adjustAmount;
  return pool;
};

export const adjustSidekickQuantity = (
  pool: PoolType,
  adjustAmount: number,
): PoolType => {
  if (adjustAmount === 0) return pool;
  if (!pool || !pool.sidekick.quantity) return pool;
  const quantity = pool.sidekick.quantity ?? 0;
  pool.sidekick.quantity = quantity + adjustAmount;
  return pool;
};

//   /**
//    * Draw deck[cardIndex] into your hand
//    * @param cardIndex
//    * @returns
//    */
export const drawDeck = (pool: PoolType, cardIndex: number) => {
  if (!pool.deck) return pool;
  if (!pool.deck[cardIndex]) return pool;
  pool.hand.push(pool.deck[cardIndex]);
  pool.deck.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Place hand[cardIndex] on top of deck
//    * @param cardIndex
//    */
export const deckCard = (pool: PoolType, cardIndex: number) => {
  if (!pool.deck) return;
  pool.deck.push(pool.hand[cardIndex]);
  pool.hand.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Place hand[cardIndex] on bottom of deck
//    * @param cardIndex
//    */
export const deckCardBottom = (pool: PoolType, cardIndex: number) => {
  if (!pool.deck) return;
  pool.deck.unshift(pool.hand[cardIndex]);
  pool.hand.splice(cardIndex, 1);
  return pool;
};

export const discardCard = (pool: PoolType, index: number): PoolType => {
  pool.discard.push(pool.hand[index]);
  pool.hand.splice(index, 1);
  return pool;
};

//   /**
//    * Discard one random card from hand (e.g. Robin Hood's "Ambush").
//    * The same random index is discarded and spliced, unlike the old buggy
//    * version which spliced a different index than it discarded.
//    */
export const discardRandomCard = (pool: PoolType): PoolType => {
  if (!pool.hand || pool.hand.length === 0) return pool;
  const randomIndex = Math.floor(Math.random() * pool.hand.length);
  pool.discard.push(pool.hand[randomIndex]);
  pool.hand.splice(randomIndex, 1);
  return pool;
};

//   /**
//    * Draw the top `count` cards of the deck into hand. Top = end of array.
//    */
export const drawMultiple = (pool: PoolType, count: number): PoolType => {
  if (!pool?.deck || !pool?.hand) return pool;
  for (let i = 0; i < count; i++) {
    const card = pool.deck.pop();
    if (!card) break;
    pool.hand.push(card);
  }
  return pool;
};

//   /**
//    * Mill: move the top `count` cards of the deck to the discard pile,
//    * topmost first. Unmatched never reshuffles discard back in, so a milled
//    * card is effectively spent.
//    */
export const mill = (pool: PoolType, count: number): PoolType => {
  if (!pool?.deck) return pool;
  for (let i = 0; i < count; i++) {
    const card = pool.deck.pop();
    if (!card) break;
    pool.discard.push(card);
  }
  return pool;
};

//   /**
//    * Scry / reorder the top of the deck without shuffling. The caller peeked
//    * at the top N cards and split them into two ordered groups:
//    *   - topCards:    index 0 = the next card to be drawn (topmost)
//    *   - bottomCards: index 0 = the card that ends up closest to the bottom
//    * Everything below the peeked window is untouched.
//    */
export const reorderTop = (
  pool: PoolType,
  topCards: DeckImportCardType[],
  bottomCards: DeckImportCardType[],
): PoolType => {
  if (!pool.deck) return pool;
  const n = topCards.length + bottomCards.length;
  const rest = pool.deck.slice(0, pool.deck.length - n);
  // Front of the array is the bottom of the deck; end of the array is the top.
  // topCards[0] must be drawn first, so it goes last in the array.
  pool.deck = [...bottomCards, ...rest, ...[...topCards].reverse()];
  return pool;
};

//   /**
//    * Move discard[cardIndex] to the top of the deck (e.g. Houdini returning a
//    * Trick). Top = end of array.
//    */
export const discardToDeckTop = (
  pool: PoolType,
  cardIndex: number,
): PoolType => {
  if (!pool.deck) return pool;
  if (!pool.discard[cardIndex]) return pool;
  pool.deck.push(pool.discard[cardIndex]);
  pool.discard.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Move discard[cardIndex] to the bottom of the deck. Bottom = front of array.
//    */
export const discardToDeckBottom = (
  pool: PoolType,
  cardIndex: number,
): PoolType => {
  if (!pool.deck) return pool;
  if (!pool.discard[cardIndex]) return pool;
  pool.deck.unshift(pool.discard[cardIndex]);
  pool.discard.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Shuffle the entire discard pile back into the deck. Not a real Unmatched
//    * rule (decks never reshuffle on exhaustion) but useful for sandbox setups,
//    * house rules, and TTS parity.
//    */
export const shuffleDiscardIntoDeck = (pool: PoolType): PoolType => {
  if (!pool.deck) return pool;
  pool.deck = pool.deck.concat(pool.discard);
  pool.discard = [];
  return shuffleDeck(pool);
};

//   /**
//    * Draw discard[cardIndex] to hand
//    * @param cardIndex
//    */
export const drawDiscard = (pool: PoolType, cardIndex: number) => {
  if (!pool.discard[cardIndex]) return pool;
  pool.hand.push(pool.discard[cardIndex]);
  pool.discard.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Remove hand[cardIndex] without sending it to another pile — the caller
//    * is moving the card somewhere outside the pool (e.g. onto the table as a
//    * board token). Grab the card before calling this.
//    */
export const removeHandCard = (pool: PoolType, cardIndex: number): PoolType => {
  if (!pool?.hand?.[cardIndex]) return pool;
  pool.hand.splice(cardIndex, 1);
  return pool;
};

//   /**
//    * Add a card object back into a pool zone — the reverse of removeHandCard,
//    * used when a card token leaves the table. Top of deck = end of array.
//    */
export const addCardToHand = (
  pool: PoolType,
  card: DeckImportCardType,
): PoolType => {
  pool.hand.push(card);
  return pool;
};

export const addCardToDiscard = (
  pool: PoolType,
  card: DeckImportCardType,
): PoolType => {
  pool.discard.push(card);
  return pool;
};

export const addCardToDeckTop = (
  pool: PoolType,
  card: DeckImportCardType,
): PoolType => {
  if (!pool.deck) return pool;
  pool.deck.push(card);
  return pool;
};

export const addCardToDeckBottom = (
  pool: PoolType,
  card: DeckImportCardType,
): PoolType => {
  if (!pool.deck) return pool;
  pool.deck.unshift(card);
  return pool;
};

/**
 * @deprecated The pool.commit zone (commitCard / boostCard / boostFromTopDeck /
 * cancelBoost / revealCommit / discardCommit / cancelCommit) backs the commit
 * modal, which is superseded by playing cards to the table (face-down card
 * tokens). Kept functional while the modal still exists for stray commits;
 * delete the family together when the modal goes.
 */
export const commitCard = (pool: PoolType, cardIndex: number): PoolType => {
  if (!pool?.hand || pool?.commit?.main) return pool;
  pool.commit.main = pool.hand[cardIndex];
  pool.hand.splice(cardIndex, 1);
  return pool;
};

export const boostCard = (pool: PoolType, cardIndex: number): PoolType => {
  if (!pool?.hand) return pool;
  if (pool.commit.boost) return pool;
  pool.commit.boost = pool.hand[cardIndex];
  pool.hand.splice(cardIndex, 1);
  return pool;
};

export const boostFromTopDeck = (pool: PoolType): PoolType => {
  if (!pool?.deck) return pool;
  if (!pool?.hand) return pool;
  if (pool.commit.boost) return pool;

  if (pool.deck.length === 0) {
    alert("No cards left");
  }
  const card = pool?.deck?.pop();
  if (card) {
    pool.commit.boost = card;
  }

  return pool;
};

export const cancelBoost = (pool: PoolType): PoolType => {
  if (!pool?.commit.boost) return pool;
  pool.hand.unshift(pool.commit.boost);
  pool.commit.boost = null;
  return pool;
};

export const discardCommit = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  pool.discard.unshift(pool.commit.main);
  pool.commit.main = null;

  if (pool.commit.boost) {
    pool.discard.unshift(pool.commit.boost);
    pool.commit.boost = null;
  }

  pool.commit.reveal = false;
  return pool;
};

export const cancelCommit = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  pool.hand.push(pool.commit.main);
  pool.commit.main = null;
  pool.commit.reveal = false;

  if (pool.commit.boost) {
    pool.hand.push(pool.commit.boost);
    pool.commit.boost = null;
  }

  return pool;
};

export const revealCommit = (pool: PoolType): PoolType => {
  pool.commit.reveal
    ? (pool.commit.reveal = false)
    : (pool.commit.reveal = true);
  return pool;
};
