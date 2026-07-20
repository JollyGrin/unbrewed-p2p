import {
  PoolType,
  drawMultiple,
  mill,
  discardRandomCard,
  discardToDeckTop,
  discardToDeckBottom,
  drawDiscard,
  shuffleDeck,
  shuffleDiscardIntoDeck,
  shuffleRandomDiscardIntoDeck,
} from "@/components/DeckPool/PoolFns";
import { ModalType } from "@/pages/game";

export type CommandGroup = "Dice" | "Deck" | "Hand" | "Discard" | "Board";

export type DeckCommand = {
  id: string;
  label: string;
  group: CommandGroup;
  keywords?: string;
  /** Whether the command can run given the current pool. */
  enabled: (pool: PoolType) => boolean;
  run: () => void;
};

/**
 * A log/toast label. When a function it runs *after* the mutation with the
 * resulting pool and whatever the mutation returned (e.g. the milled cards),
 * so public-information actions can name the cards involved (issue #426, item
 * 4) — the log is the honor-system trust surface for opponents.
 */
export type DeckLabel<R> = string | ((pool: PoolType, moved: R) => string);

/**
 * Everything the command list needs from its host surface. The ⌘ Actions
 * palette and the pile split-button chevrons both build from this one factory
 * so the deck/discard/hand entries never fork — each surface just injects the
 * primitives it can provide and renders the resulting list its own way.
 */
export type DeckCommandCtx = {
  /**
   * Run `mutate` on the pool, then broadcast + log/toast `label`. Returning a
   * value from `mutate` lets the label name the affected cards.
   */
  act: <R>(mutate: (p: PoolType) => R, label: DeckLabel<R>) => () => void;
  openScry: () => void;
  openModal: (type: ModalType) => void;
  /** Palette-only: dice rolls need the shared 3D roll broadcast. */
  roll?: (sides: number, qty: number) => () => void;
  /** Palette-only: the board-token library. */
  openTokenLibrary?: () => void;
  /**
   * Deck-chevron-only: reveal the top deck card face-up on the table as a
   * boost (issue #426, item 2). Needs board access, so only surfaces that can
   * play to the table provide it.
   */
  boostFromDeck?: () => void;
};

/**
 * Build the full sandbox command list. Commands whose required ctx primitive
 * is absent (dice without `roll`, boost without `boostFromDeck`, the token
 * library without `openTokenLibrary`) are simply omitted, so each surface only
 * shows the actions it can actually perform.
 */
export function buildDeckCommands(ctx: DeckCommandCtx): DeckCommand[] {
  const { act, openScry, openModal, roll, openTokenLibrary, boostFromDeck } =
    ctx;
  const hasDeck = (p: PoolType) => (p.deck?.length ?? 0) > 0;
  const hasDiscard = (p: PoolType) => (p.discard?.length ?? 0) > 0;
  const hasHand = (p: PoolType) => (p.hand?.length ?? 0) > 0;

  const dice: DeckCommand[] = roll
    ? [
        { sides: 20, qty: 1, id: "rolld20", label: "Roll d20", kw: "d20" },
        { sides: 6, qty: 1, id: "rolld6", label: "Roll d6", kw: "d6" },
        { sides: 6, qty: 2, id: "roll2d6", label: "Roll 2d6", kw: "2d6 two" },
        {
          sides: 100,
          qty: 1,
          id: "rolld100",
          label: "Roll d100 (percentile)",
          kw: "d100 percent",
        },
        { sides: 4, qty: 1, id: "rolld4", label: "Roll d4", kw: "d4" },
        { sides: 8, qty: 1, id: "rolld8", label: "Roll d8", kw: "d8" },
        { sides: 10, qty: 1, id: "rolld10", label: "Roll d10", kw: "d10" },
        { sides: 12, qty: 1, id: "rolld12", label: "Roll d12", kw: "d12" },
      ].map(({ sides, qty, id, label, kw }) => ({
        id,
        group: "Dice" as const,
        label,
        keywords: `dice die roll random ${kw}`,
        enabled: () => true,
        run: roll(sides, qty),
      }))
    : [];

  const deck: DeckCommand[] = [
    {
      id: "draw1",
      group: "Deck",
      label: "Draw 1 card",
      keywords: "single",
      enabled: hasDeck,
      run: act((p) => drawMultiple(p, 1), "Drew a card"),
    },
    {
      id: "draw2",
      group: "Deck",
      label: "Draw 2 cards",
      keywords: "multiple",
      enabled: hasDeck,
      run: act((p) => drawMultiple(p, 2), "Drew 2 cards"),
    },
    {
      id: "draw3",
      group: "Deck",
      label: "Draw 3 cards",
      keywords: "multiple",
      enabled: hasDeck,
      run: act((p) => drawMultiple(p, 3), "Drew 3 cards"),
    },
    {
      id: "scry",
      group: "Deck",
      label: "Scry — peek & reorder top of deck",
      keywords: "peek look top order surveil",
      enabled: hasDeck,
      run: openScry,
    },
    {
      id: "mill1",
      group: "Deck",
      label: "Mill 1 (top of deck → discard)",
      keywords: "discard top",
      enabled: hasDeck,
      run: act(
        (p) => {
          mill(p, 1);
          return p.discard.slice(-1);
        },
        (_p, milled) =>
          milled.length ? `Milled ${milled[0].title}` : "Milled 1 card",
      ),
    },
    {
      id: "mill3",
      group: "Deck",
      label: "Mill 3 (top of deck → discard)",
      keywords: "discard top",
      enabled: hasDeck,
      run: act(
        (p) => {
          const before = p.discard.length;
          mill(p, 3);
          return p.discard.slice(before);
        },
        (_p, milled) =>
          milled.length
            ? `Milled ${milled.length}: ${milled
                .map((c) => c.title)
                .join(", ")}`
            : "Milled 3 cards",
      ),
    },
    {
      id: "search",
      group: "Deck",
      label: "Search deck (browse — reshuffles on close)",
      keywords: "tutor find open",
      enabled: hasDeck,
      run: () => openModal("deck"),
    },
    {
      id: "shuffle",
      group: "Deck",
      label: "Shuffle deck",
      keywords: "randomize",
      enabled: hasDeck,
      run: act((p) => shuffleDeck(p), "Shuffled deck"),
    },
    ...(boostFromDeck
      ? [
          {
            id: "boostFromDeck",
            group: "Deck" as const,
            label: "Boost from deck (reveal top)",
            keywords: "boost reveal top flip table",
            enabled: hasDeck,
            run: boostFromDeck,
          },
        ]
      : []),
  ];

  const hand: DeckCommand[] = [
    {
      id: "discardRandom",
      group: "Hand",
      label: "Discard a random card from hand",
      keywords: "ambush force",
      enabled: hasHand,
      run: act(
        (p) => {
          discardRandomCard(p);
          return p.discard[p.discard.length - 1];
        },
        (_p, card) =>
          card ? `Randomly discarded ${card.title}` : "Discarded a random card",
      ),
    },
  ];

  const discard: DeckCommand[] = [
    {
      id: "discardTopToDeck",
      group: "Discard",
      label: "Put top of discard on top of deck",
      keywords: "houdini return recur",
      enabled: hasDiscard,
      run: act(
        (p) => discardToDeckTop(p, p.discard.length - 1),
        "Moved top of discard to deck",
      ),
    },
    {
      id: "discardTopToDeckBottom",
      group: "Discard",
      label: "Put top of discard on bottom of deck",
      keywords: "return recur bottom",
      enabled: hasDiscard,
      run: act(
        (p) => discardToDeckBottom(p, p.discard.length - 1),
        "Moved top of discard to bottom of deck",
      ),
    },
    {
      id: "discardTopToHand",
      group: "Discard",
      label: "Return top of discard to hand",
      keywords: "recur bruce lee",
      enabled: hasDiscard,
      run: act(
        (p) => drawDiscard(p, p.discard.length - 1),
        "Returned top of discard to hand",
      ),
    },
    {
      id: "shuffleDiscardIn",
      group: "Discard",
      label: "Shuffle discard into deck",
      keywords: "reset reshuffle",
      enabled: hasDiscard,
      run: act((p) => shuffleDiscardIntoDeck(p), "Shuffled discard into deck"),
    },
    {
      id: "shuffleRandom1DiscardIn",
      group: "Discard",
      label: "Shuffle 1 random card into deck",
      keywords: "recur recycle random partial",
      enabled: hasDiscard,
      run: act(
        (p) => shuffleRandomDiscardIntoDeck(p, 1),
        (_p, moved) =>
          moved.length
            ? `Shuffled ${moved[0].title} into deck`
            : "Shuffled 1 random card into deck",
      ),
    },
    {
      id: "shuffleRandom3DiscardIn",
      group: "Discard",
      label: "Shuffle 3 random cards into deck",
      keywords: "recur recycle random partial",
      enabled: hasDiscard,
      run: act(
        (p) => shuffleRandomDiscardIntoDeck(p, 3),
        (_p, moved) =>
          moved.length
            ? `Shuffled ${moved.length} into deck: ${moved
                .map((c) => c.title)
                .join(", ")}`
            : "Shuffled 3 random cards into deck",
      ),
    },
    {
      id: "openDiscard",
      group: "Discard",
      label: "Open discard pile",
      keywords: "view browse",
      enabled: () => true,
      run: () => openModal("discard"),
    },
  ];

  const board: DeckCommand[] = openTokenLibrary
    ? [
        {
          id: "addToken",
          group: "Board",
          label: "Add a board token (icons, images, overlays)",
          keywords: "pawn marker map overlay icon image",
          enabled: () => true,
          run: openTokenLibrary,
        },
      ]
    : [];

  return [...dice, ...deck, ...hand, ...discard, ...board];
}
