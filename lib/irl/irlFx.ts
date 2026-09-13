import { createContext, useContext, useEffect, useRef } from "react";

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

export type IrlFxHandler = (event: IrlFxEvent) => void;

export type IrlFxBus = {
  emit: IrlFxHandler;
  subscribe: (handler: IrlFxHandler) => () => void;
};

/** One bus per IrlGameProvider — no globals, no window events. */
export const createIrlFxBus = (): IrlFxBus => {
  const handlers = new Set<IrlFxHandler>();
  return {
    emit: (event) => handlers.forEach((handler) => handler(event)),
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
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
  useEffect(() => bus?.subscribe((event) => latest.current(event)), [bus]);
};
