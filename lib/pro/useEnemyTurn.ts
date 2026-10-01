import { useEffect, useRef, useState } from "react";
import type { GameEvent, PlayerView } from "./protocol";
import { nextEnemyTurnState } from "./enemyTurn";
import type { EnemyTurnState } from "./enemyTurn";

/**
 * Enemy-turn card state across STATE batches (#1156). Each distinct `events` array is
 * folded once; an Adventure-less game (`enabled` false) never produces state.
 */
export const useEnemyTurn = (
  view: PlayerView | null | undefined,
  events: readonly GameEvent[] | undefined,
  enabled = true,
): EnemyTurnState | null => {
  const [state, setState] = useState<EnemyTurnState | null>(null);
  const seen = useRef<readonly GameEvent[] | undefined>(undefined);
  useEffect(() => {
    if (!enabled || !view || !events || seen.current === events) return;
    seen.current = events;
    setState((prev) => nextEnemyTurnState(prev, events, view));
  }, [enabled, view, events]);
  return enabled ? state : null;
};
