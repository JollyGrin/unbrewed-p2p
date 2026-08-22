/**
 * The React half of `positionSwap.ts` (protocol v31 ↔ engine #445): tracks the
 * atomic position swaps currently playing on the board.
 *
 * Mirrors useCombatCallouts / useIncomingMoveTween — its own `prevViewRef` so
 * the existing FX loops stay byte-identical, a monotonic key per beat so a
 * second swap of the same fighter replays it, and a timer that drops each batch
 * once its animation has finished. Split from the pure module so `gameLog.ts`
 * can read `swappedFighters` without pulling React into its import graph.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GameEvent, PlayerView } from "./protocol";
import { PendingSwap, SWAP_SECONDS, diffPositionSwaps } from "./positionSwap";

/** How long a swap beat stays live before the hook drops it (ms). Slightly
 *  longer than the board's own animation so the keyframes always finish. */
const SWAP_TTL_MS = SWAP_SECONDS * 1000 + 200;

// Install the beat BEFORE the browser paints, for the same reason the incoming
// move tween does (moveTween.ts): the STATE view already shows both fighters at
// their landing spaces, so a post-paint hook would flash them there for a frame
// before framer-motion rewound the crossfade to the pose they came from.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function usePositionSwaps(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): PendingSwap[] {
  const [swaps, setSwaps] = useState<PendingSwap[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useIsoLayoutEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    const fresh = diffPositionSwaps(prev, snapshot.view, snapshot.events);
    if (fresh.length === 0) return;
    const stamped = fresh.map((s) => ({ ...s, key: seqRef.current++ }));
    setSwaps((cur) => [...cur, ...stamped]);
    const keys = new Set(stamped.map((s) => s.key));
    timersRef.current.push(
      setTimeout(() => setSwaps((cur) => cur.filter((s) => !keys.has(s.key))), SWAP_TTL_MS)
    );
  }, [snapshot]);

  return swaps;
}
