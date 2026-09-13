import {
  ContextType,
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/router";
import { cloneDeep } from "lodash";
import { toast } from "react-hot-toast";
import { WebGameContext, useWebGame } from "@/lib/contexts/WebGameProvider";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  commitCard,
  deckCard,
  deckCardBottom,
  discardCard,
  discardRandomCard,
  discardToDeckBottom,
  discardToDeckTop,
  draw,
  drawDiscard,
  drawMultiple,
  mill,
  removeCard,
  removeFromDiscard,
  reorderTop,
  returnRemoved,
  revealCommit,
  shuffleDeck,
  shuffleDiscardIntoDeck,
  shuffleRandomDiscardIntoDeck,
} from "@/components/DeckPool/PoolFns";
import { DeckLabel } from "@/components/Game/CommandMenu/deckCommands";
import {
  IRL_OPENING_HAND,
  boostFromHand,
  cancelBoosts,
  deckHasCards,
  discardInPlay,
  inPlayBoosts,
  initIrlPool,
  removeCommitted,
  returnCommitToHand,
} from "@/lib/irl/irlPool";
import { IrlCounter } from "@/lib/irl/irlCharacters";
import { clearIrlPool, loadIrlPool, saveIrlPool } from "@/lib/irl/irlStorage";

type WebGameValue = NonNullable<ContextType<typeof WebGameContext>>;

/**
 * The lone seat OfflineGameProvider writes to. Every reused game component
 * (GameMenus, ActionLog, the deck look-through modal) resolves "self" from
 * `?name=`, so pages/irl.tsx sets `?name=offline` to match it.
 */
export const IRL_SEAT = "offline";

type Apply = <R>(
  mutate: (pool: PoolType) => R,
  label?: DeckLabel<R>,
) => R | undefined;

type IrlGame = {
  /** the deck on the tray — printed stats (start HP, quote) are read from it */
  deck: DeckImportType;
  pool: PoolType | undefined;
  /** mutate a copy of the pool, publish it, log the line */
  apply: Apply;
  /** `apply`, deferred — the shape buildDeckCommands takes */
  act: <R>(mutate: (pool: PoolType) => R, label: DeckLabel<R>) => () => void;
};

const IrlGameContext = createContext<IrlGame | undefined>(undefined);

export const useIrlGame = (): IrlGame => {
  const context = useContext(IrlGameContext);
  if (!context) throw new Error("useIrlGame must be used inside <IrlGameProvider>");
  return context;
};

/**
 * IRL Mode's layer over the UNCHANGED {@link OfflineGameProvider} (issue #798).
 *
 * - Seeds the pool itself — the saved session for this deck if there is one,
 *   else a fresh five-card opening hand — since there's no HandContainer here.
 * - Persists the pool after every change (lib/irl/irlStorage).
 * - Re-provides the game context with IRL-aware reset / change-deck, so the
 *   shared NewGameModal and ChangeDeckModal work as-is: each runs the
 *   provider's own reseed (log line, reset epoch) and then lays down the IRL
 *   opening hand and drops the old save.
 */
export const IrlGameProvider = ({
  initialDeck,
  children,
}: PropsWithChildren<{ initialDeck: DeckImportType }>) => {
  const game = useWebGame();
  const router = useRouter();
  const [deck, setDeck] = useState(initialDeck);

  const players = game.gameState?.content?.players as
    | Record<string, { pool?: PoolType }>
    | undefined;
  const seat = players?.[IRL_SEAT];
  const pool = seat?.pool;

  // Latest pool for back-to-back applies inside one tick (a state update
  // hasn't re-rendered yet, so the closure's `pool` would be stale).
  const poolRef = useRef(pool);
  poolRef.current = pool;

  const { setPlayerState, logAction } = game;
  const publish = useCallback(
    (next: PoolType) => {
      poolRef.current = next;
      setPlayerState()({ pool: next });
    },
    [setPlayerState],
  );

  const apply: Apply = useCallback(
    (mutate, label) => {
      const current = poolRef.current;
      if (!current) return undefined;
      // A copy, so the pool's identity changes with every move — PoolFns
      // mutate in place, which would hide the change from anything memoised.
      const next = cloneDeep(current);
      const result = mutate(next);
      publish(next);
      const text = typeof label === "function" ? label(next, result) : label;
      if (text) logAction(text);
      return result;
    },
    [publish, logAction],
  );

  const act = useCallback(
    <R,>(mutate: (pool: PoolType) => R, label: DeckLabel<R>) =>
      () => {
        apply(mutate, label);
      },
    [apply],
  );

  // Seed once per deck: restore the saved session, else deal a fresh game.
  const seededFor = useRef<string>();
  useEffect(() => {
    if (pool || seededFor.current === deck.id) return;
    seededFor.current = deck.id;
    const saved = loadIrlPool(deck.id);
    publish(saved ?? initIrlPool(deck));
    logAction(
      saved
        ? "Picked the game back up"
        : `Shuffled and drew ${IRL_OPENING_HAND} cards`,
    );
  }, [pool, deck, publish, logAction]);

  // Persist after every change. Keyed on the seat, not the pool: the reused
  // deck look-through modal mutates the pool in place, so only the seat
  // object is guaranteed to be new when something moved.
  useEffect(() => {
    if (seat?.pool) saveIrlPool(deck.id, seat.pool);
  }, [seat, deck.id]);

  const value: WebGameValue = useMemo(() => {
    const resetWith = (reset: () => void) => () => {
      clearIrlPool(deck.id);
      reset();
      publish(initIrlPool(deck));
    };
    return {
      ...game,
      requestGameReset: resetWith(game.requestGameReset),
      forceGameReset: resetWith(game.forceGameReset),
      switchDeck: (next: DeckImportType) => {
        clearIrlPool(deck.id);
        game.switchDeck(next);
        seededFor.current = next.id;
        setDeck(next);
        publish(initIrlPool(next));
        // keep a reload on the new deck
        void router.replace(
          { query: { ...router.query, deckId: next.id } },
          undefined,
          { shallow: true },
        );
      },
    };
  }, [game, deck, publish, router]);

  return (
    <WebGameContext.Provider value={value}>
      <IrlGameContext.Provider value={{ deck, pool, apply, act }}>
        {children}
      </IrlGameContext.Provider>
    </WebGameContext.Provider>
  );
};

const titleOf = (card?: DeckImportCardType | null) => card?.title || "a card";

/**
 * Every tray action as one call. Draws are guarded here so
 * PoolFns' native `alert("No cards left")` can never fire on a phone.
 */
export const useIrlActions = () => {
  const { pool, apply } = useIrlGame();

  const needsDeck = (run: () => void) => {
    if (deckHasCards(pool)) run();
    else toast.error("Your deck is empty", { id: "irl-deck-empty" });
  };

  return {
    draw: () => needsDeck(() => apply(draw, "Drew a card")),
    drawMany: (count: number) =>
      needsDeck(() =>
        apply((p) => drawMultiple(p, count), `Drew ${count} cards`),
      ),
    shuffle: () => apply(shuffleDeck, "Shuffled their deck"),
    discardTop: () =>
      needsDeck(() =>
        apply(
          (p) => {
            mill(p, 1);
            return p.discard[p.discard.length - 1];
          },
          (_p, card) => `Discarded the top card of their deck: ${titleOf(card)}`,
        ),
      ),
    reorderTop: (top: DeckImportCardType[], bottom: DeckImportCardType[]) =>
      apply((p) => reorderTop(p, top, bottom), "Reordered the top of their deck"),

    toDeckTop: (index: number) =>
      apply((p) => deckCard(p, index), "Placed a card on top of their deck"),
    toDeckBottom: (index: number) =>
      apply(
        (p) => deckCardBottom(p, index),
        "Placed a card on the bottom of their deck",
      ),
    discard: (index: number) =>
      apply(
        (p) => {
          const card = p.hand[index];
          discardCard(p, index);
          return card;
        },
        (_p, card) => `Discarded ${titleOf(card)}`,
      ),
    discardRandom: () =>
      apply(
        (p) => {
          const before = p.hand.length;
          discardRandomCard(p);
          return p.hand.length < before ? p.discard[p.discard.length - 1] : undefined;
        },
        (_p, card) => (card ? `Discarded a random card: ${titleOf(card)}` : ""),
      ),
    removeFromHand: (index: number) =>
      apply(
        (p) => {
          const card = p.hand[index];
          removeCard(p, index);
          return card;
        },
        (_p, card) => `Removed ${titleOf(card)} from the game`,
      ),

    play: (index: number) =>
      apply((p) => commitCard(p, index), "Played a card face-down"),
    toggleReveal: () =>
      apply(revealCommit, (p) =>
        p.commit.reveal
          ? `Revealed ${titleOf(p.commit.main)}`
          : "Turned their card in play face-down",
      ),
    // Rules §5.4: a boost is a card from HAND — never the top of the deck.
    boostFromHand: (index: number) =>
      apply(
        (p) => {
          const card = p.hand[index];
          const before = inPlayBoosts(p).length;
          boostFromHand(p, index);
          return inPlayBoosts(p).length > before ? card : undefined;
        },
        (p, card) =>
          !card
            ? ""
            : p.commit.reveal
              ? `Boosted with ${titleOf(card)} (+${card.boost})`
              : "Added a boost face-down",
      ),
    cancelBoost: () => apply(cancelBoosts, "Took their boost back into hand"),
    discardInPlay: () => apply(discardInPlay, "Discarded the card in play"),
    returnInPlay: () =>
      apply(returnCommitToHand, "Took the card in play back into hand"),
    removeInPlay: () =>
      apply(removeCommitted, "Removed the card in play from the game"),

    discardToHand: (index: number) =>
      apply((p) => drawDiscard(p, index), "Returned a card from discard to hand"),
    discardToTop: (index: number) =>
      apply(
        (p) => discardToDeckTop(p, index),
        "Put a discarded card on top of their deck",
      ),
    discardToBottom: (index: number) =>
      apply(
        (p) => discardToDeckBottom(p, index),
        "Put a discarded card on the bottom of their deck",
      ),
    removeDiscarded: (index: number) =>
      apply(
        (p) => {
          const card = p.discard[index];
          removeFromDiscard(p, index);
          return card;
        },
        (_p, card) => `Removed ${titleOf(card)} from the game`,
      ),
    returnRemoved: (index: number) =>
      apply(
        (p) => returnRemoved(p, index),
        "Returned a removed card to the discard",
      ),
    shuffleDiscardIn: () =>
      apply(shuffleDiscardIntoDeck, "Shuffled their discard into their deck"),
    shuffleRandomIn: (count: number) =>
      apply(
        (p) => shuffleRandomDiscardIntoDeck(p, count),
        (_p, moved) =>
          moved.length === 1
            ? `Shuffled ${titleOf(moved[0])} from discard into their deck`
            : `Shuffled ${moved.length} random discards into their deck`,
      ),

    adjust: (counter: IrlCounter, delta: number) =>
      apply(
        (p) => counter.adjust(p, delta),
        `${counter.name}: ${delta > 0 ? "+" : "−"}${Math.abs(delta)}${
          counter.kind === "hp" ? " HP" : ""
        }`,
      ),
  };
};

export type IrlActions = ReturnType<typeof useIrlActions>;
