/**
 * Defeat topple bookkeeping (#962): which 3D minis are toppling right now.
 * A defeated fighter leaves the board in the batch that defeats it, so its 3D
 * mini is kept as a ghost (TableFallenMini) on the space it fell on, for the
 * topple's length. Only a fighter that stood as a 3D mini gets one, and never
 * under reduced motion (the piece just goes, as a sprite does) — including a
 * ghost already standing when reduced motion turns on.
 *
 * A combat K.O. falls on the strike's contact; its strike arrives a render
 * after the defeat, hence FALL_GRACE_MS before deciding "fall now vs fall at
 * contact". Anything with no strike by then falls at once.
 */
import { useEffect, useRef, useState } from "react";
import type { FighterId, SpaceId, ViewFighter } from "@/lib/pro/protocol";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import { TOPPLE_MS } from "@/lib/pro/minis3d/pose";
import type { TableStrike } from "./tableMiniCues";

/** How long a defeated 3D mini waits for its combat's strike beat before it
 *  falls on its own. The strike is set a render after the defeat. */
export const FALL_GRACE_MS = 150;
/** After the topple lands, how long the (faded) ghost stays before unmounting. */
export const FALL_TAIL_MS = 300;

export type StandingMini = { fighter: ViewFighter & { space: SpaceId }; mini: Mini3d };
export type FallenMini = StandingMini & { key: string; foe: FighterId | null; now: boolean };

/** When a ghost topples: at its strike's contact, at once after the grace, or
 *  not yet (null = keep standing). */
export const toppleFor = (x: FallenMini, strike: TableStrike | null): { key: string; delayMs: number } | null =>
  strike?.target === x.fighter.id ? { key: x.key, delayMs: strike.contactMs } : x.now ? { key: x.key, delayMs: 0 } : null;

export function useFallenMinis({
  fighters,
  standing,
  attack,
  strike,
  reducedMotion,
}: {
  /** The view's fighters — the diff is keyed on this array's identity. */
  fighters: ViewFighter[];
  /** Every fighter standing as a 3D mini this render. */
  standing: Map<FighterId, StandingMini>;
  attack: { attacker: FighterId; target: FighterId } | null;
  strike: TableStrike | null;
  reducedMotion: boolean;
}): FallenMini[] {
  const [fallen, setFallen] = useState<FallenMini[]>([]);
  const standingRef = useRef(new Map<FighterId, StandingMini>());
  const latestStanding = useRef(standing);
  latestStanding.current = standing;
  const strikeRef = useRef(strike);
  strikeRef.current = strike;
  const fallSeq = useRef(0);
  // Who each fighter last fought: its facing as it falls.
  const lastFoeRef = useRef(new Map<FighterId, FighterId>());
  // Live timers only — each one removes itself when it fires.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  };

  useEffect(() => clearTimers, []);
  useEffect(() => {
    if (attack) lastFoeRef.current.set(attack.target, attack.attacker);
  }, [attack]);
  // Reduced motion turned on mid-topple: drop every ghost now.
  useEffect(() => {
    if (!reducedMotion) return;
    clearTimers();
    setFallen([]);
  }, [reducedMotion]);

  useEffect(() => {
    const was = standingRef.current;
    const next = latestStanding.current;
    standingRef.current = next;
    if (reducedMotion) return;
    const falls = [...was.entries()]
      .filter(([id]) => !next.has(id) && fighters.find((x) => x.id === id)?.defeated)
      .map(([id, s]) => ({ ...s, key: `fall-${id}-${fallSeq.current++}`, foe: lastFoeRef.current.get(id) ?? null, now: false }));
    if (!falls.length) return;
    const keys = new Set(falls.map((x) => x.key));
    setFallen((cur) => [...cur, ...falls]);
    later(() => {
      setFallen((cur) => cur.map((x) => (keys.has(x.key) ? { ...x, now: true } : x)));
      const s = strikeRef.current;
      const wait = s && falls.some((x) => s.target === x.fighter.id) ? s.contactMs : 0;
      later(() => setFallen((cur) => cur.filter((x) => !keys.has(x.key))), wait + TOPPLE_MS + FALL_TAIL_MS);
    }, FALL_GRACE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the view's fighters only
  }, [fighters]);

  return reducedMotion ? [] : fallen;
}
