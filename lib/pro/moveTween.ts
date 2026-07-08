/**
 * Incoming-move tween (issue #149) — makes an OPPONENT's fighter glide through
 * the circles instead of teleporting.
 *
 * Your own moves already tween: the click handler sets `pendingMove`
 * optimistically the instant you commit (game.tsx). But an opponent's move only
 * ever arrives as an authoritative STATE view update — nothing set a
 * `pendingMove`, so the enemy token snapped to its new space. This hook fills
 * that gap by diffing consecutive snapshots (exactly like combatFx/useGameFx do)
 * and, when an opponent-owned fighter's `space` changed, producing a
 * `PendingMove` for the board to animate.
 *
 * Scope is deliberately OPPONENT-ONLY (`owner !== you`): your own commits stay on
 * the optimistic path, so this never double-drives a move you already started.
 * Route source, in order of preference: the structured v10 `FIGHTER_MOVED` event
 * carries the real path; absent that (older server, or a redacted batch) we fall
 * back to a straight two-node `[from, to]` — a clean A→B glide beats a teleport.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MOVE_STEP_SECONDS, PendingMove } from "@/components/Pro/ProBoard";
import { GameEvent, PlayerView, SpaceId } from "./protocol";

// Install the tween BEFORE the browser paints: the STATE view already shows the
// opponent at the destination, so a post-paint (useEffect) hook would flash the
// token there for a frame before framer-motion rewound it to the start of the
// path. A layout effect beats framer's first animation frame, so the keyframes
// play from `from` with no flash. Falls back to useEffect during SSR (no window).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Diff consecutive views into at most one opponent move to tween. Pure and
 * view-derived (mirrors diffViews/diffCombatCallouts): the first snapshot is a
 * state dump, not a play, so it stays silent. Placements (null → space) and your
 * own fighters are ignored. When several opponent fighters moved in one batch we
 * animate a single one (ProBoard tweens one token at a time) — the one carrying a
 * structured event wins, else the first found.
 */
export function diffIncomingMove(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[]
): PendingMove | null {
  if (!prev) return null;
  const prevSpace = new Map(prev.fighters.map((f) => [f.id, f.space]));

  // Opponent fighters that changed from one on-board space to another.
  const moved = next.fighters.filter((f) => {
    if (f.owner === next.you) return false; // your own moves tween optimistically
    const from = prevSpace.get(f.id);
    return !!from && !!f.space && from !== f.space;
  });
  if (moved.length === 0) return null;

  // Prefer a fighter the engine reported a real path for; else the first mover.
  const paths = new Map<string, SpaceId[]>();
  for (const e of events) {
    if (e.type === "FIGHTER_MOVED" && e.path.length >= 2 && !paths.has(e.fighter)) {
      paths.set(e.fighter, e.path);
    }
  }
  const chosen = moved.find((f) => paths.has(f.id)) ?? moved[0];
  const origin = prevSpace.get(chosen.id) as SpaceId;
  const dest = chosen.space as SpaceId;

  // The event path may or may not include the fighter's starting space as
  // path[0] — prepend it if missing so the tween always begins where the token
  // actually is (same rule the local click handler applies).
  const eventPath = paths.get(chosen.id);
  const path =
    eventPath && eventPath[eventPath.length - 1] === dest
      ? eventPath[0] === origin
        ? eventPath
        : [origin, ...eventPath]
      : [origin, dest];

  return path.length >= 2 ? { fighterId: chosen.id, path } : null;
}

/**
 * Track the current opponent move to tween. Mirrors useCombatCallouts: it keeps
 * its own `prevViewRef` and diffs each snapshot independently of the log's diff,
 * so the existing FX/log loops stay byte-identical. A fallback timer clears the
 * move on the same schedule as usePendingMoveTimeout (in case the board's
 * onAnimationComplete never fires); `clearIncoming` lets the caller clear it the
 * moment the tween settles.
 */
export function useIncomingMoveTween(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): { incomingMove: PendingMove | null; clearIncoming: () => void } {
  const [incomingMove, setIncomingMove] = useState<PendingMove | null>(null);
  const prevViewRef = useRef<PlayerView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useIsoLayoutEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    const move = diffIncomingMove(prev, snapshot.view, snapshot.events);
    if (!move) return;
    setIncomingMove(move);
    if (timerRef.current) clearTimeout(timerRef.current);
    const ms = (move.path.length - 1) * MOVE_STEP_SECONDS * 1000 + 500;
    timerRef.current = setTimeout(() => setIncomingMove(null), ms);
  }, [snapshot]);

  const clearIncoming = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIncomingMove(null);
  };

  return { incomingMove, clearIncoming };
}
