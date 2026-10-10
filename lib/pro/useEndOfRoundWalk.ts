import { useEffect, useRef, useState } from "react";
import type { GameEvent, PlayerView } from "./protocol";
import { endOfRoundSteps } from "./endOfRoundWalk";

/** How long the row dwells on each resolving END OF ROUND box during the replay. */
export const END_OF_ROUND_STEP_MS = 1200;

/**
 * The END OF ROUND walk replayed on the round strip (#1149): once per batch that resolved
 * boxes, highlight each resolved card left to right, then hand the strip back to the live
 * view. Returns the view to draw the row from (the pre-batch row for a finished round — the
 * live row is already the next round's) and the card resolving now; null when idle.
 */
export const useEndOfRoundWalk = (
  view: PlayerView,
  events: readonly GameEvent[] | undefined,
): { view: PlayerView; resolvingId: string } | null => {
  const prevViewRef = useRef<PlayerView | null>(null);
  const [walk, setWalk] = useState<{ view: PlayerView; ids: string[]; at: number } | null>(null);
  useEffect(() => {
    const prev = prevViewRef.current;
    if (prev === view) return;
    prevViewRef.current = view;
    const steps = endOfRoundSteps(prev, view, events ?? []);
    if (steps) setWalk({ view: steps.view, ids: steps.cards.map((c) => c.id), at: 0 });
  }, [view, events]);
  useEffect(() => {
    if (!walk) return;
    const t = setTimeout(
      () => setWalk((w) => (w && w.at + 1 < w.ids.length ? { ...w, at: w.at + 1 } : null)),
      END_OF_ROUND_STEP_MS,
    );
    return () => clearTimeout(t);
  }, [walk]);
  return walk ? { view: walk.view, resolvingId: walk.ids[walk.at]! } : null;
};
