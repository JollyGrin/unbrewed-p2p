import {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportSidekickType,
  DeckImportType,
  PoolCardType,
} from "@/components/DeckPool/deck-import.type";
import { clone } from "lodash";

export default class Pool {
  author: string;
  deckid: string;
  deckName: string;
  deckNote: string;

  cards: DeckImportCardType[]; // unique cards in the deck
  deck: PoolCardType[] | null;
  hero: DeckImportHeroType;
  sidekick: DeckImportSidekickType;

  hand: PoolCardType[];
  discard: PoolCardType[];
  commit: {
    main: PoolCardType | null;
    reveal: boolean;
    boost?: PoolCardType | null;
  };

  constructor(deckData: DeckImportType) {
    // META
    const { user, family_id, name, note, deck_data } = deckData;
    this.author = user;
    this.deckid = family_id;
    this.deckName = name;
    this.deckNote = note;

    // DECK
    const { cards, hero, sidekick } = deck_data;
    this.cards = cards;
    this.deck = null;
    this.hero = {
      hp: hero.hp,
      isRanged: hero.isRanged,
      move: hero.move,
      name: hero.name,
      specialAbility: hero.specialAbility,
    };
    this.sidekick = {
      hp: sidekick.hp,
      isRanged: sidekick.isRanged,
      quantity: sidekick.quantity,
      name: sidekick.name,
      quote: sidekick.quote,
    };

    // CONTAINERS
    this.hand = [];
    this.discard = [];
    this.commit = {
      main: null,
      reveal: false,
      boost: null,
    };
  }

  /**
   * Create a deck by expanding unique cards by their quantity number
   */
  makeDeck = () => {
    const cards = clone(this.cards);
    const newDeck = cards.flatMap(({ quantity, ...rest }) =>
      Array(quantity).fill(rest)
    );
    this.deck = newDeck;
  };

  /**
   * Shuffle deck using the Fisher-Yates shuffle
   */
  shuffleDeck = () => {
    if (!this.deck) return;
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  };

  draw = () => {
    if (!this.deck || !this.hand) return;
    if (this.deck.length === 0) {
      alert("No cards left");
    }
    const card = this.deck.pop();
    if (card) {
      this.hand.push(card);
    }
  };

  /**
   * Draw deck[cardIndex] into your hand
   * @param cardIndex
   * @returns
   */
  drawDeck = (cardIndex: number) => {
    if (!this.deck) return;
    this.hand.push(this.deck[cardIndex]);
    this.deck.splice(cardIndex, 1);
  };

  /**
   * Place hand[cardIndex] on top of deck
   * @param cardIndex
   */
  deckCard = (cardIndex: number) => {
    if (!this.deck) return;
    this.deck.push(this.hand[cardIndex]);
    this.hand.splice(cardIndex, 1);
  };

  /**
   * Place hand[cardIndex] on bottom of deck
   * @param cardIndex
   */
  deckCardBottom = (cardIndex: number) => {
    if (!this.deck) return;
    this.deck.unshift(this.hand[cardIndex]);
    this.hand.splice(cardIndex, 1);
  };

  discardCard = (cardIndex: number) => {
    this.discard.push(this.hand[cardIndex]);
    this.hand.splice(cardIndex, 1);
  };

  discardRandomCard = (cardIndex: number) => {
    const handSize = this.hand.length - 1;
    const randomNumber = Math.floor(Math.random() * handSize);
    this.discard.push(this.hand[randomNumber]);
    this.hand.splice(cardIndex, 1);
  };

  /**
   * Draw discard[cardIndex] to hand
   * @param cardIndex
   */
  drawDiscard = (cardIndex: number) => {
    this.hand.push(this.discard[cardIndex]);
    this.discard.splice(cardIndex, 1);
  };

  commitCard = (cardIndex: number) => {
    this.commit.main = this.hand[cardIndex];
    this.hand.splice(cardIndex, 1);
  };

  discardCommit = () => {
    if (!this.commit.main) return;
    this.discard.push(this.commit.main);
    this.commit.main = null;
    this.commit.reveal = false;
  };

  cancelCommit = () => {
    if (!this.commit.main) return;
    this.hand.push(this.commit.main);
    this.commit.main = null;
    this.commit.reveal = false;
  };

  revealCommit = () => {
    this.commit.reveal
      ? (this.commit.reveal = false)
      : (this.commit.reveal = true);
  };
}
