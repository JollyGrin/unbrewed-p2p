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
  const newDeck: DeckImportCardType[] = pool.cards.flatMap(
    ({ quantity, ...rest }) => Array(quantity).fill({ quantity, ...rest })
  );
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
  adjustAmount: number
): PoolType => {
  if (adjustAmount === 0) return pool;
  if (!pool[selectedPawn] || !pool[selectedPawn]?.hp === null) return pool;
  const hp = pool[selectedPawn].hp ?? 0;
  pool[selectedPawn].hp = hp + adjustAmount;
  return pool;
};

export const adjustSidekickQuantity = (
  pool: PoolType,
  adjustAmount: number
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
  if (!pool.deck) return;
  pool.hand.push(pool.deck[cardIndex]);
  pool.deck.splice(cardIndex, 1);
};

//   /**
//    * Place hand[cardIndex] on top of deck
//    * @param cardIndex
//    */
export const deckCard = (pool: PoolType, cardIndex: number) => {
  if (!pool.deck) return;
  pool.deck.push(pool.hand[cardIndex]);
  pool.hand.splice(cardIndex, 1);
};

//   /**
//    * Place hand[cardIndex] on bottom of deck
//    * @param cardIndex
//    */
export const deckCardBottom = (pool: PoolType, cardIndex: number) => {
  if (!pool.deck) return;
  pool.deck.unshift(pool.hand[cardIndex]);
  pool.hand.splice(cardIndex, 1);
};

export const discardCard = (pool: PoolType, index: number): PoolType => {
  pool.discard.push(pool.hand[index]);
  pool.hand.splice(index, 1);
  return pool;
};

export const discardRandomCard = (pool: PoolType, cardIndex: number) => {
  const handSize = pool.hand.length - 1;
  const randomNumber = Math.floor(Math.random() * handSize);
  pool.discard.push(pool.hand[randomNumber]);
  pool.hand.splice(cardIndex, 1);
};

//   /**
//    * Draw discard[cardIndex] to hand
//    * @param cardIndex
//    */
export const drawDiscard = (pool: PoolType, cardIndex: number) => {
  pool.hand.push(pool.discard[cardIndex]);
  pool.discard.splice(cardIndex, 1);
};

export const commitCard = (pool: PoolType, cardIndex: number): PoolType => {
  if (!pool?.hand || pool?.commit?.main) return pool;
  pool.commit.main = pool.hand[cardIndex];
  pool.hand.splice(cardIndex, 1);
  return pool;
};

export const discardCommit = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  pool.discard.push(pool.commit.main);
  pool.commit.main = null;
  pool.commit.reveal = false;
  return pool;
};

export const cancelCommit = (pool: PoolType): PoolType => {
  if (!pool.commit.main) return pool;
  pool.hand.push(pool.commit.main);
  pool.commit.main = null;
  pool.commit.reveal = false;
  return pool;
};

export const revealCommit = (pool: PoolType): PoolType => {
  pool.commit.reveal
    ? (pool.commit.reveal = false)
    : (pool.commit.reveal = true);
  return pool;
};
