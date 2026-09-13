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
import { IrlCounter, irlCounters } from "@/lib/irl/irlCharacters";
import { IrlFxContext, IrlFxEvent, createIrlFxBus } from "@/lib/irl/irlFx";
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
 * - Carries the effect-event bus (lib/irl/irlFx, issue #809) that
 *   {@link useIrlActions} announces every move on.
 */
export const IrlGameProvider = ({
  initialDeck,
  children,
}: PropsWithChildren<{ initialDeck: DeckImportType }>) => {
  const game = useWebGame();
  const router = useRouter();
  const [deck, setDeck] = useState(initialDeck);
  const [fx] = useState(createIrlFxBus);

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

  /** publish a fresh opening hand — the one place `deal` is announced */
  const deal = useCallback(
    (from: DeckImportType) => {
      const fresh = initIrlPool(from);
      publish(fresh);
      fx.emit({ type: "deal", count: fresh.hand.length });
    },
    [publish, fx],
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
  // A restore is not a deal — nothing should fly in on a reload.
  const seededFor = useRef<string>();
  useEffect(() => {
    if (pool || seededFor.current === deck.id) return;
    seededFor.current = deck.id;
    const saved = loadIrlPool(deck.id);
    if (saved) publish(saved);
    else deal(deck);
    logAction(
      saved
        ? "Picked the game back up"
        : `Shuffled and drew ${IRL_OPENING_HAND} cards`,
    );
  }, [pool, deck, publish, deal, logAction]);

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
      deal(deck);
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
        deal(next);
        // keep a reload on the new deck
        void router.replace(
          { query: { ...router.query, deckId: next.id } },
          undefined,
          { shallow: true },
        );
      },
    };
  }, [game, deck, deal, router]);

  return (
    <WebGameContext.Provider value={value}>
      <IrlGameContext.Provider value={{ deck, pool, apply, act }}>
        <IrlFxContext.Provider value={fx}>{children}</IrlFxContext.Provider>
      </IrlGameContext.Provider>
    </WebGameContext.Provider>
  );
};

const titleOf = (card?: DeckImportCardType | null) => card?.title || "a card";

/**
 * Every tray action as one call. Draws are guarded here so
 * PoolFns' native `alert("No cards left")` can never fire on a phone.
 *
 * Each action announces what it did on the fx bus (lib/irl/irlFx) once the
 * move went through: its mutation reports what actually moved, and a move
 * that didn't happen (empty deck, unboostable card, nothing in play) is
 * announced as nothing.
 */
export const useIrlActions = () => {
  const { deck, pool, apply } = useIrlGame();
  const fx = useContext(IrlFxContext);

  /** `apply`, then announce the move — `fx` maps what moved to its event */
  const run = <R,>(
    mutate: (pool: PoolType) => R,
    label: DeckLabel<R>,
    event: (result: R) => IrlFxEvent | false | null | undefined,
  ) => {
    let moved = false;
    let result: R | undefined;
    apply((p) => {
      result = mutate(p);
      moved = true;
      return result;
    }, label);
    const emitted = moved && event(result as R);
    if (emitted) fx?.emit(emitted);
  };

  const needsDeck = (go: () => void) => {
    if (deckHasCards(pool)) go();
    else toast.error("Your deck is empty", { id: "irl-deck-empty" });
  };

  const drawn = (p: PoolType, go: () => void) => {
    const before = p.hand.length;
    go();
    return p.hand.length - before;
  };

  /** run `go`; report whether `card` (read before it ran) was there to move */
  const had = (card: unknown, go: () => void) => {
    go();
    return !!card;
  };

  return {
    draw: () =>
      needsDeck(() =>
        run(
          (p) => drawn(p, () => draw(p)),
          "Drew a card",
          (count) => count > 0 && { type: "draw", count },
        ),
      ),
    drawMany: (count: number) =>
      needsDeck(() =>
        run(
          (p) => drawn(p, () => drawMultiple(p, count)),
          `Drew ${count} cards`,
          (n) => n > 0 && { type: "draw", count: n },
        ),
      ),
    shuffle: () => run(shuffleDeck, "Shuffled their deck", () => ({ type: "shuffle" })),
    discardTop: () =>
      needsDeck(() =>
        run(
          (p) => {
            mill(p, 1);
            return p.discard[p.discard.length - 1];
          },
          (_p, card) => `Discarded the top card of their deck: ${titleOf(card)}`,
          (card) => !!card && { type: "mill" },
        ),
      ),
    reorderTop: (top: DeckImportCardType[], bottom: DeckImportCardType[]) =>
      apply((p) => reorderTop(p, top, bottom), "Reordered the top of their deck"),

    toDeckTop: (index: number) =>
      run(
        (p) => deckCard(p, index),
        "Placed a card on top of their deck",
        (done) => !!done && { type: "toDeck", where: "top", from: "hand" },
      ),
    toDeckBottom: (index: number) =>
      run(
        (p) => deckCardBottom(p, index),
        "Placed a card on the bottom of their deck",
        (done) => !!done && { type: "toDeck", where: "bottom", from: "hand" },
      ),
    discard: (index: number) =>
      run(
        (p) => {
          const card = p.hand[index];
          discardCard(p, index);
          return card;
        },
        (_p, card) => `Discarded ${titleOf(card)}`,
        (card) => !!card && { type: "discard", from: "hand", count: 1 },
      ),
    discardRandom: () =>
      run(
        (p) => {
          const before = p.hand.length;
          discardRandomCard(p);
          return p.hand.length < before ? p.discard[p.discard.length - 1] : undefined;
        },
        (_p, card) => (card ? `Discarded a random card: ${titleOf(card)}` : ""),
        (card) => !!card && { type: "discard", from: "hand", count: 1 },
      ),
    removeFromHand: (index: number) =>
      run(
        (p) => {
          const card = p.hand[index];
          removeCard(p, index);
          return card;
        },
        (_p, card) => `Removed ${titleOf(card)} from the game`,
        (card) => !!card && { type: "remove", from: "hand" },
      ),

    play: (index: number) =>
      run(
        (p) => !p.commit?.main && had(p.hand[index], () => commitCard(p, index)),
        "Played a card face-down",
        (played) => played && { type: "play" },
      ),
    toggleReveal: () =>
      run(
        revealCommit,
        (p) =>
          p.commit.reveal
            ? `Revealed ${titleOf(p.commit.main)}`
            : "Turned their card in play face-down",
        (p) => ({ type: p.commit.reveal ? "reveal" : "hide" }),
      ),
    // Rules §5.4: a boost is a card from HAND — never the top of the deck.
    boostFromHand: (index: number) =>
      run(
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
        (card) => !!card && { type: "boost", index },
      ),
    cancelBoost: () =>
      run(
        (p) => {
          const count = inPlayBoosts(p).length;
          cancelBoosts(p);
          return count;
        },
        "Took their boost back into hand",
        (count) => count > 0 && { type: "cancelBoost", count },
      ),
    discardInPlay: () =>
      run(
        (p) => {
          const count = p.commit.main ? 1 + inPlayBoosts(p).length : 0;
          discardInPlay(p);
          return count;
        },
        "Discarded the card in play",
        (count) => count > 0 && { type: "discard", from: "play", count },
      ),
    returnInPlay: () =>
      run(
        (p) => had(p.commit.main, () => returnCommitToHand(p)),
        "Took the card in play back into hand",
        (done) => done && { type: "toHand", from: "play" },
      ),
    removeInPlay: () =>
      run(
        (p) => had(p.commit.main, () => removeCommitted(p)),
        "Removed the card in play from the game",
        (done) => done && { type: "remove", from: "play" },
      ),

    discardToHand: (index: number) =>
      run(
        (p) => had(p.discard[index], () => drawDiscard(p, index)),
        "Returned a card from discard to hand",
        (done) => done && { type: "toHand", from: "discard" },
      ),
    discardToTop: (index: number) =>
      run(
        (p) => had(p.deck && p.discard[index], () => discardToDeckTop(p, index)),
        "Put a discarded card on top of their deck",
        (done) => done && { type: "toDeck", where: "top", from: "discard" },
      ),
    discardToBottom: (index: number) =>
      run(
        (p) => had(p.deck && p.discard[index], () => discardToDeckBottom(p, index)),
        "Put a discarded card on the bottom of their deck",
        (done) => done && { type: "toDeck", where: "bottom", from: "discard" },
      ),
    removeDiscarded: (index: number) =>
      run(
        (p) => {
          const card = p.discard[index];
          removeFromDiscard(p, index);
          return card;
        },
        (_p, card) => `Removed ${titleOf(card)} from the game`,
        (card) => !!card && { type: "remove", from: "discard" },
      ),
    returnRemoved: (index: number) =>
      apply(
        (p) => returnRemoved(p, index),
        "Returned a removed card to the discard",
      ),
    shuffleDiscardIn: () =>
      run(
        (p) => {
          const count = p.deck ? p.discard.length : 0;
          shuffleDiscardIntoDeck(p);
          return count;
        },
        "Shuffled their discard into their deck",
        (count) => count > 0 && { type: "shuffleIn", count },
      ),
    shuffleRandomIn: (count: number) =>
      run(
        (p) => shuffleRandomDiscardIntoDeck(p, count),
        (_p, moved) =>
          moved.length === 1
            ? `Shuffled ${titleOf(moved[0])} from discard into their deck`
            : `Shuffled ${moved.length} random discards into their deck`,
        (moved) => moved.length > 0 && { type: "shuffleIn", count: moved.length },
      ),

    adjust: (counter: IrlCounter, delta: number) =>
      run(
        (p) => {
          // read off the pool being changed, not the render's `counter`: two
          // taps in one tick would otherwise both start from the same value
          const valueOf = () =>
            irlCounters(deck, p).find((c) => c.id === counter.id)?.value;
          const before = valueOf();
          counter.adjust(p, delta);
          return { before, after: valueOf() };
        },
        `${counter.name}: ${delta > 0 ? "+" : "−"}${Math.abs(delta)}${
          counter.kind === "hp" ? " HP" : ""
        }`,
        ({ before, after }) =>
          before !== undefined &&
          after !== undefined &&
          after !== before && {
            type: "hp",
            counterId: counter.id,
            delta: after - before,
            value: after,
          },
      ),
  };
};

export type IrlActions = ReturnType<typeof useIrlActions>;
