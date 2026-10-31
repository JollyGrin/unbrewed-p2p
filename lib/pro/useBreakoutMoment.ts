import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent, PlayerView } from "./protocol";
import { breakoutMoment, overflowAwaitingOpen, withLateSpawn } from "./breakoutMoment";
import type { BreakoutMoment } from "./breakoutMoment";

/**
 * Adventure breakout interstitial state (#1158): once per batch carrying the overflow→open
 * chain, or per overflow batch + the later batch that opens the team-picked space (#1494). Each
 * distinct `view` is one STATE batch; the first view seen (join / reconnect) witnessed nothing, so
 * it never yields a moment (nor holds an overflow over).
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
  // An overflow whose SPACE_OPENED hasn't landed yet (the team picks the enclosure, #1494), with the
  // view before it so `pushedBy` still reads the overflow batch's threat delta.
  const awaitingOpenRef = useRef<{ overflow: GameEvent; prev: PlayerView } | null>(null);
  useEffect(() => {
    const prev = prevViewRef.current;
    if (prev === view) return;
    prevViewRef.current = view;
    if (!prev) return;
    const batch = events ?? [];
    const awaitingOpen = awaitingOpenRef.current;
    const held = overflowAwaitingOpen(batch);
    const opens = batch.some((e) => e.type === "SPACE_OPENED");
    // a fresh overflow-without-open replaces the held one; a batch that opens a space consumes it
    awaitingOpenRef.current = held ? { overflow: held, prev } : opens ? null : awaitingOpen;
    const next =
      breakoutMoment(batch, prev, view) ??
      (awaitingOpen && opens && !held
        ? breakoutMoment([awaitingOpen.overflow, ...batch], awaitingOpen.prev, view)
        : null);
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
