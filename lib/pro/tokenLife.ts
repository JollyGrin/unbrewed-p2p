/**
 * "Lively tokens" — the physical-life layer for Pro board tokens (issue #320).
 * Sibling to combatFx.ts / useGameFx.ts: those channels own board-anchored beats
 * (floating damage, K.O. bursts, sound) and full-screen callouts; THIS channel
 * makes the fighter tokens themselves react — a defender recoils when hit, the
 * attacker lunges, a block braces, a K.O. topples — and, at rest, breathe.
 *
 * Purely additive / presentation-only: nothing here feeds back into play, gates
 * an action, or touches diffViews. Like combatFx it diffs the same snapshots
 * independently (its own prevViewRef) so the useGameFx loop stays byte-identical,
 * and it reuses diffFxEvents so the semantic beats (damage/heal/blocked/defeated)
 * are derived exactly once, in one place.
 *
 * The whole channel is gated behind the opt-in `tokenLife` beta flag: with the
 * flag off the consumer passes `enabled: false`, this hook returns an empty map,
 * and ProBoard renders the token DOM byte-identically to today.
 */
import { useEffect, useRef, useState } from "react";
import { GameEvent, FighterId, PlayerView, SpaceId } from "./protocol";
import { diffFxEvents } from "./fxEvents";

/** Heavy hits (this much damage or more) add a short shake on top of the recoil. */
export const HEAVY_HIT_THRESHOLD = 3;

export type TokenGestureKind = "recoil" | "lunge" | "brace" | "topple";

/**
 * One discrete gesture to play on a single fighter's token. `key` is a monotonic
 * trigger id — the same fighter getting hit twice yields two gestures with
 * different keys, and the token layer re-fires whenever the key changes. `dx/dy`
 * is a unit vector in board-fraction space along the attacker→target axis (its
 * length is ~0 for non-combat damage, which the layer renders as an in-place
 * flinch rather than a directional slide).
 */
export interface TokenGesture {
  kind: TokenGestureKind;
  key: number;
  dx: number;
  dy: number;
  /** damage amount (recoil only) — scales recoil amplitude; >= threshold shakes */
  amount: number;
  /** the fighter's space at defeat (topple only) — the KO ghost renders here even
   *  after the fighter has left the live token list. */
  space?: SpaceId | null;
}

export type TokenGestures = Record<FighterId, TokenGesture>;

/** A gesture before the hook stamps it with a monotonic key. */
type RawGesture = Omit<TokenGesture, "key">;

const spacePos = (view: PlayerView, space: SpaceId | null): { x: number; y: number } | null => {
  if (!space) return null;
  const s = view.map.spaces.find((sp) => sp.id === space);
  return s ? { x: s.x, y: s.y } : null;
};

/** Unit vector along attacker→target (the "away from attacker" / "toward target"
 *  axis, shared by the defender's recoil and the attacker's lunge). Zero-length
 *  when the two share a space or a position is unknown. */
const combatAxis = (view: PlayerView): { dx: number; dy: number } => {
  const c = view.combat;
  if (!c) return { dx: 0, dy: 0 };
  const from = spacePos(view, view.fighters.find((f) => f.id === c.attacker)?.space ?? null);
  const to = spacePos(view, view.fighters.find((f) => f.id === c.target)?.space ?? null);
  if (!from || !to) return { dx: 0, dy: 0 };
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const len = Math.hypot(vx, vy);
  if (len < 1e-4) return { dx: 0, dy: 0 };
  return { dx: vx / len, dy: vy / len };
};

/**
 * Diff two consecutive snapshots into per-fighter gestures. Pure and
 * view-derived (mirrors diffFxEvents / diffCombatCallouts): the first snapshot
 * is a state dump, not a play, so it stays silent. Returns at most one gesture
 * per fighter — a killing blow yields a topple, not a topple *and* a recoil.
 */
export function diffTokenGestures(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[] = []
): Record<FighterId, RawGesture> {
  if (!prev) return {};
  const fx = diffFxEvents(prev, next, events);
  if (fx.length === 0) return {};

  const out: Record<FighterId, RawGesture> = {};
  const axis = combatAxis(next);
  const combat = next.combat;
  const attacker = combat?.attacker ?? null;

  // The attacker jabs toward its target on the strike (any resolution — a hit
  // OR a block). Fired once per snapshot that resolves the engagement.
  const lungeAttacker = () => {
    if (!attacker) return;
    out[attacker] = { kind: "lunge", dx: axis.dx, dy: axis.dy, amount: 0 };
  };

  for (const e of fx) {
    switch (e.type) {
      case "damage": {
        // Recoil away from the attacker. Combat damage on the current target
        // rides the combat axis; effect/exhaustion damage has no axis (0,0) and
        // reads as an in-place flinch. Never overwrite a topple queued earlier.
        if (out[e.fighter]?.kind === "topple") break;
        const onAxis = combat?.target === e.fighter;
        out[e.fighter] = {
          kind: "recoil",
          dx: onAxis ? axis.dx : 0,
          dy: onAxis ? axis.dy : 0,
          amount: e.amount,
        };
        if (onAxis) lungeAttacker();
        break;
      }
      case "blocked": {
        // The defense held — the target braces (a firm squash-and-settle) and
        // the attacker still lunges into the block.
        if (combat?.target) out[combat.target] = { kind: "brace", dx: 0, dy: 0, amount: 0 };
        lungeAttacker();
        break;
      }
      case "defeated": {
        // K.O. wins over any recoil queued for the same fighter this snapshot.
        // `e.space` is the fighter's last space (fxEvents falls back to its prior
        // space when the defeated fighter has already left the board).
        out[e.fighter] = { kind: "topple", dx: axis.dx, dy: axis.dy, amount: 0, space: e.space };
        break;
      }
      default:
        break;
    }
  }

  return out;
}

/**
 * Manage per-fighter gesture triggers for the board. Diffs each snapshot (its own
 * prevViewRef, independent of useGameFx) and stamps every fresh gesture with a
 * monotonic key so the token layer re-fires on change. Returns the latest gesture
 * per fighter; a fighter with no recent gesture is simply absent from the map.
 *
 * `enabled` reflects the `tokenLife` flag: prevViewRef always advances (so
 * toggling on mid-game diffs cleanly against the last snapshot) but no gestures
 * are emitted while off.
 */
export function useTokenLife(
  snapshot: { view: PlayerView; events?: GameEvent[] } | null,
  enabled: boolean
): TokenGestures {
  const [gestures, setGestures] = useState<TokenGestures>({});
  const prevViewRef = useRef<PlayerView | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    if (!enabled) return;
    const raw = diffTokenGestures(prev, snapshot.view, snapshot.events ?? []);
    const ids = Object.keys(raw);
    if (ids.length === 0) return;
    setGestures((cur) => {
      const merged = { ...cur };
      for (const id of ids) merged[id] = { ...raw[id], key: ++keyRef.current };
      return merged;
    });
  }, [snapshot, enabled]);

  return gestures;
}

/**
 * True while the tab is hidden — the token layer pauses its continuous idle
 * animation so a backgrounded board isn't burning GPU on breathing it can't show.
 * SSR-safe (starts visible; corrects after mount).
 */
export function usePageHidden(): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    onChange();
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}
