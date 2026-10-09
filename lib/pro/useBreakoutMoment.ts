import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent, PlayerView } from "./protocol";
import { breakoutMoment, withLateSpawn } from "./breakoutMoment";
import type { BreakoutMoment } from "./breakoutMoment";

/**
 * Adventure breakout interstitial state (#1158): once per batch carrying the overflow→open
 * chain. Each distinct `view` is one STATE batch; the first view seen (join / reconnect)
 * witnessed nothing, so it never yields a moment.
 */
export const useBreakoutMoment = (
  view: PlayerView,
  events: readonly GameEvent[] | undefined,
): { moment: BreakoutMoment | null; dismiss: () => void } => {
  const [moment, setMoment] = useState<BreakoutMoment | null>(null);
  const dismiss = useCallback(() => setMoment(null), []);
  const prevViewRef = useRef<PlayerView | null>(null);
  // A breakout whose ENEMY_SPAWNED hasn't landed yet (it arrives after a human places the token).
  const awaitingSpawnRef = useRef<BreakoutMoment | null>(null);
  useEffect(() => {
    const prev = prevViewRef.current;
    if (prev === view) return;
    prevViewRef.current = view;
    if (!prev) return;
    const batch = events ?? [];
    const next = breakoutMoment(batch, prev, view);
    if (next) {
      setMoment(next);
      awaitingSpawnRef.current = next.enemy ? null : next;
    } else if (awaitingSpawnRef.current) {
      const filled = withLateSpawn(awaitingSpawnRef.current, batch, view);
      if (filled) {
        awaitingSpawnRef.current = null;
        setMoment(filled);
      }
    }
  }, [view, events]);
  return { moment, dismiss };
};
