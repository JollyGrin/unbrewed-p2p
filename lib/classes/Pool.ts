import {
  DeckImportCardType,
  DeckImportHeroType,
  DeckImportSidekickType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";

export default class Pool {
  author: string;
  deckid: string;
  deckName: string;
  deckNote: string;

  cards: DeckImportCardType[];
  deck: DeckImportCardType[];
  hero: DeckImportHeroType;
  sidekick: DeckImportSidekickType;

  hand: DeckImportCardType[] | null;
  discard: DeckImportCardType[];
  commit: {
    main: DeckImportCardType[] | null;
    reveal: boolean;
    boost?: DeckImportCardType[] | null;
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
    this.deck = cards;
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

  // FUNCTIONS
  makeDeck = () => {
    const cards = this.cards;
    let newDeck: DeckImportCardType[] = [];
    cards.forEach((spell) => {
      const { quantity } = spell;
      let i;
      for (i = 0; i < quantity; i++) {
        newDeck.push(spell);
      }
    });
    this.deck = newDeck;
  };

  shuffleDeck = () => {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  };

  //   draw =  () => {
  //     if (this.deck.length === 0) {
  //       alert("No cards left");
  //     }
  //       const local = this;
  //     this.hand.push(local.deck.pop());
  //   };

  //   drawDeck = function (cardIndex) {
  //     this.hand.push(this.deck[cardIndex]);
  //     this.deck.splice(cardIndex, 1);
  //   };

  //   deckCard = function (cardIndex) {
  //     this.deck.push(this.hand[cardIndex]);
  //     this.hand.splice(cardIndex, 1);
  //   };

  //   deckCardBottom = function (cardIndex) {
  //     this.deck.unshift(this.hand[cardIndex]);
  //     this.hand.splice(cardIndex, 1);
  //   };

  //   discardCard = function (cardIndex) {
  //     this.discard.push(this.hand[cardIndex]);
  //     this.hand.splice(cardIndex, 1);
  //   };

  //   discardRandomCard = function (cardIndex) {
  //     const handSize = this.hand.length - 1;
  //     const randomNumber = Math.floor(Math.random() * handSize);

  //     this.discard.push(this.hand[randomNumber]);
  //     this.hand.splice(cardIndex, 1);
  //   };

  //   drawDiscard = function (cardIndex) {
  //     this.hand.push(this.discard[cardIndex]);
  //     this.discard.splice(cardIndex, 1);
  //   };

  //   commitCard = function (cardIndex) {
  //     this.commit.main = this.hand[cardIndex];
  //     this.hand.splice(cardIndex, 1);
  //   };

  //   discardCommit = function () {
  //     this.discard.push(this.commit.main);
  //     this.commit.main = null;
  //     this.commit.reveal = false;
  //   };

  //   cancelCommit = function () {
  //     this.hand.push(this.commit.main);
  //     this.commit.main = null;
  //     this.commit.reveal = false;
  //   };

  //   revealCommit = function () {
  //     this.commit.reveal
  //       ? (this.commit.reveal = false)
  //       : (this.commit.reveal = true);
  //   };
}
