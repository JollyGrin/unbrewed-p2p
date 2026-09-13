import { createContext, useContext, useEffect, useRef } from "react";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";

/**
 * IRL Mode's effect-event spine (issue #809). Every tray action already knows
 * what it just did, so it says so here — an animation layer subscribes to
 * "what just happened" instead of diffing pool state.
 *
 * Emitted by `useIrlActions` only AFTER its move went through: a guarded
 * action that early-returns (an empty deck, a card that can't boost) emits
 * nothing.
 */
export type IrlFxEvent =
  | { type: "draw"; count: number }
  /** a fresh opening hand — never a restored session */
  | { type: "deal"; count: number }
  /** hand → commit.main, face-down */
  | { type: "play" }
  | { type: "reveal" }
  | { type: "hide" }
  /** `index` is the hand index the boost came from */
  | { type: "boost"; index: number }
  | { type: "cancelBoost"; count: number }
  | { type: "discard"; from: "hand" | "play"; count: number }
  | { type: "toDeck"; where: "top" | "bottom"; from: "hand" | "discard" }
  | { type: "toHand"; from: "discard" | "play" }
  | { type: "remove"; from: "hand" | "play" | "discard" }
  | { type: "shuffle" }
  /** discard → deck */
  | { type: "shuffleIn"; count: number }
  | { type: "mill" }
  | { type: "hp"; counterId: string; delta: number; value: number };

/**
 * What an event moved (issue #811) — what a card flight draws. Rides beside
 * the event rather than in it, so the event stays the move's name.
 */
export type IrlFxMoved = {
  /**
   * The cards that moved, in the order they moved (a discard from play: the
   * main card, then each boost). A shuffle lends the top of the deck, for
   * its back art.
   */
  cards: DeckImportCardType[];
  /** the hand or discard index a single card left from, when it has one */
  index?: number;
};

/**
 * A move that was asked for and refused (issue #811) — the deck tile's
 * wobble. Its own channel: a refused move is not a move, so it never reaches
 * `useIrlFx`.
 */
export type IrlFxRefusal = { type: "deckEmpty" };

export type IrlFxHandler = (event: IrlFxEvent, moved: IrlFxMoved) => void;
export type IrlFxRefusalHandler = (refusal: IrlFxRefusal) => void;

export type IrlFxBus = {
  emit: (event: IrlFxEvent, moved?: IrlFxMoved) => void;
  subscribe: (handler: IrlFxHandler) => () => void;
  refuse: IrlFxRefusalHandler;
  subscribeRefusals: (handler: IrlFxRefusalHandler) => () => void;
};

const channel = <H extends (...args: never[]) => void>() => {
  const handlers = new Set<H>();
  return {
    each: (call: (handler: H) => void) => handlers.forEach(call),
    subscribe: (handler: H) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
};

/** One bus per IrlGameProvider — no globals, no window events. */
export const createIrlFxBus = (): IrlFxBus => {
  const events = channel<IrlFxHandler>();
  const refusals = channel<IrlFxRefusalHandler>();
  return {
    emit: (event, moved = { cards: [] }) =>
      events.each((handler) => handler(event, moved)),
    subscribe: events.subscribe,
    refuse: (refusal) => refusals.each((handler) => handler(refusal)),
    subscribeRefusals: refusals.subscribe,
  };
};

export const IrlFxContext = createContext<IrlFxBus | undefined>(undefined);

/**
 * Hear every IRL effect event for this component's lifetime. The handler may
 * change every render — the latest one is always the one called.
 */
export const useIrlFx = (handler: IrlFxHandler) => {
  const bus = useContext(IrlFxContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(
    () => bus?.subscribe((event, moved) => latest.current(event, moved)),
    [bus],
  );
};

/** Hear every refused move, like {@link useIrlFx}. */
export const useIrlRefusals = (handler: IrlFxRefusalHandler) => {
  const bus = useContext(IrlFxContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(
    () => bus?.subscribeRefusals((refusal) => latest.current(refusal)),
    [bus],
  );
};
