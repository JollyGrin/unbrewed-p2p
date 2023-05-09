
import { clone } from "lodash";
import Pool from "./Pool";
import { DeckImportCardType, DeckImportType } from "./deck-import.type";


export type PoolType = {
  author: string;
  deckid: string;
  deckName: string;
  deckNote: string;
  cards: DeckImportCardType[];
  deck: DeckImportCardType[] | null;
  hero: PawnInfo & { move: number, specialAbility: string };
  sidekick: PawnInfo & { quantity: number | null, quote: string };
  hand: DeckImportCardType[];
  discard: DeckImportCardType[];
  commit: {
    main: DeckImportCardType | null;
    reveal: boolean;
    boost: DeckImportCardType | null
  }
}
export type PawnInfo = {
  hp: number | null;
  isRanged: boolean;
  name: string;
}

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
  }
}

//   /**
//    * Create a deck by expanding unique cards by their quantity number
//    */
export const makeDeck = (pool: PoolType): PoolType => {
  const newDeck: DeckImportCardType[] = pool.cards.flatMap(
    ({ quantity, ...rest }) => Array(quantity).fill({ quantity, ...rest })
  );
  return {
    ...pool,
    deck: newDeck
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
  return pool
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

  console.log('_pool', pool.deck?.length)
  return pool
};

//   /**
//    * Draw deck[cardIndex] into your hand
//    * @param cardIndex
//    * @returns
//    */
//   drawDeck = (cardIndex: number) => {
//     if (!this.deck) return;
//     this.hand.push(this.deck[cardIndex]);
//     this.deck.splice(cardIndex, 1);
//   };

//   /**
//    * Place hand[cardIndex] on top of deck
//    * @param cardIndex
//    */
//   deckCard = (cardIndex: number) => {
//     if (!this.deck) return;
//     this.deck.push(this.hand[cardIndex]);
//     this.hand.splice(cardIndex, 1);
//   };

//   /**
//    * Place hand[cardIndex] on bottom of deck
//    * @param cardIndex
//    */
//   deckCardBottom = (cardIndex: number) => {
//     if (!this.deck) return;
//     this.deck.unshift(this.hand[cardIndex]);
//     this.hand.splice(cardIndex, 1);
//   };

//   discardCard = (cardIndex: number) => {
//     this.discard.push(this.hand[cardIndex]);
//     this.hand.splice(cardIndex, 1);
//   };

//   discardRandomCard = (cardIndex: number) => {
//     const handSize = this.hand.length - 1;
//     const randomNumber = Math.floor(Math.random() * handSize);
//     this.discard.push(this.hand[randomNumber]);
//     this.hand.splice(cardIndex, 1);
//   };

//   /**
//    * Draw discard[cardIndex] to hand
//    * @param cardIndex
//    */
//   drawDiscard = (cardIndex: number) => {
//     this.hand.push(this.discard[cardIndex]);
//     this.discard.splice(cardIndex, 1);
//   };

//   commitCard = (cardIndex: number) => {
//     this.commit.main = this.hand[cardIndex];
//     this.hand.splice(cardIndex, 1);
//   };

//   discardCommit = () => {
//     if (!this.commit.main) return;
//     this.discard.push(this.commit.main);
//     this.commit.main = null;
//     this.commit.reveal = false;
//   };

//   cancelCommit = () => {
//     if (!this.commit.main) return;
//     this.hand.push(this.commit.main);
//     this.commit.main = null;
//     this.commit.reveal = false;
//   };

//   revealCommit = () => {
//     this.commit.reveal
//       ? (this.commit.reveal = false)
//       : (this.commit.reveal = true);
//   };
// }
