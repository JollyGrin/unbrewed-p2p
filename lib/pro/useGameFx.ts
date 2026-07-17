/**
 * The "juice" hook for Pro matches: diffs each server snapshot into FxEvents
 * (fxEvents.ts), plays the matching sounds (sfx.ts) and manages the transient
 * board visuals (floating damage numbers, block/K.O. bursts) plus the
 * hurt-vignette trigger. Both channels have persistent toggles (localStorage)
 * surfaced as chips in the HUD.
 */
import { MutableRefObject, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { FighterId, GameEvent, PlayerView, SpaceId } from "./protocol";
import { diffFxEvents } from "./fxEvents";
import { sfx } from "./sfx";

/** one transient overlay on the board, anchored to a space */
export interface BoardFxItem {
  key: string;
  space: SpaceId;
  kind: "damage" | "heal" | "blocked" | "defeat";
  label: string;
}

/** A viewport point (px). Both endpoints of an arc are captured at LAUNCH. */
export interface ViewportPoint {
  x: number;
  y: number;
}

/** One in-flight damage projectile (issue #382 — the #379 battle-sequence epic).
 *  Arcs from the panel clash point to the defender's token, both as viewport rects
 *  captured at launch, so it lands correctly regardless of the board's zoom/pan
 *  transform. Rendered by the page as a fixed-position overlay; the board `−N` /
 *  ring / hit sound are delayed to its landing so cause and effect read together. */
export interface DamageArc {
  key: string;
  from: ViewportPoint;
  to: ViewportPoint;
  amount: number;
  /** amount ≥ 3 — matches the `hit-heavy` sound and sizes the projectile up. */
  heavy: boolean;
  /** flight duration (ms); the page tweens the projectile over this, then it's removed. */
  flightMs: number;
}

const BOARD_FX_TTL_MS = 1600;

/** When the arc leaves the panel — after the strike lands (~1.1s) and the comparison
 *  beat has begun pulsing. Kept in one place; the board damage beat is delayed by
 *  ARC_LAUNCH_MS + ARC_FLIGHT_MS so it fires exactly as the projectile arrives.
 *  Pushed later with the slowed sequence (#382 pacing) so the number leaves AFTER the
 *  winning value pulses, not on top of the strike. */
const ARC_LAUNCH_MS = 1900;
/** How long the projectile is in the air. */
const ARC_FLIGHT_MS = 620;

/** Optional refs the page threads in so the arc can measure its endpoints at launch:
 *  a registry of fighter-token elements (defender lookup) and the panel clash point. */
export interface GameFxRefs {
  fighterEls?: MutableRefObject<Map<FighterId, HTMLElement>>;
  clashRef?: RefObject<HTMLElement | null>;
}

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

const centerOf = (r: DOMRect): ViewportPoint => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
/** On-screen and measurable — a zero-size / detached rect means skip the arc. */
const usableRect = (r: DOMRect | undefined | null): r is DOMRect =>
  !!r && r.width > 0 && r.height > 0;

/** boolean persisted per-browser; defaults ON; hydration-safe (reads after mount) */
const useStoredToggle = (storageKey: string): [boolean, () => void] => {
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(storageKey) !== "off");
    } catch {
      /* storage blocked — stay on */
    }
  }, [storageKey]);
  const toggle = useCallback(() => {
    setOn((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(storageKey, next ? "on" : "off");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);
  return [on, toggle];
};

export function useGameFx(
  snapshot: { view: PlayerView; events?: GameEvent[] } | null,
  refs?: GameFxRefs
) {
  const [soundOn, toggleSoundStored] = useStoredToggle("pro-sound-fx");
  const [visualOn, toggleVisual] = useStoredToggle("pro-visual-fx");
  const [boardFx, setBoardFx] = useState<BoardFxItem[]>([]);
  // in-flight damage projectiles (issue #382) — panel clash point → defender token
  const [arcs, setArcs] = useState<DamageArc[]>([]);
  // increments when YOUR hero takes damage — keys the red vignette flash
  const [hurtKey, setHurtKey] = useState(0);

  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Latest refs read without re-subscribing the diff effect.
  const refsRef = useRef<GameFxRefs | undefined>(refs);
  refsRef.current = refs;
  // effects read the live toggle values without re-running on toggle
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const visualRef = useRef(visualOn);
  visualRef.current = visualOn;

  useEffect(() => {
    sfx.init();
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // toggling sound back on gives instant feedback (and the click unlocks audio)
  const toggleSound = useCallback(() => {
    if (!soundRef.current) sfx.play("turn", { volume: 0.7 });
    toggleSoundStored();
  }, [toggleSoundStored]);

  useEffect(() => {
    if (!snapshot) return;
    const prevView = prevViewRef.current;
    const events = diffFxEvents(prevView, snapshot.view, snapshot.events);
    prevViewRef.current = snapshot.view;
    if (events.length === 0) return;

    const sound = soundRef.current;
    const visual = visualRef.current;

    // Add one board overlay + schedule its expiry (batched-friendly: each add is
    // its own state update, but they coalesce within a render tick).
    const emitBoardFx = (space: SpaceId | null, kind: BoardFxItem["kind"], label: string) => {
      if (!visual || !space) return;
      const item: BoardFxItem = { key: `fx-${seqRef.current++}`, space, kind, label };
      setBoardFx((cur) => [...cur, item]);
      timersRef.current.push(
        setTimeout(() => setBoardFx((cur) => cur.filter((i) => i.key !== item.key)), BOARD_FX_TTL_MS)
      );
    };
    // The full "a hit landed" beat: floating number + ring + hit sound + (own hero)
    // vignette. Called immediately for ordinary damage, or at the arc's LANDING for
    // combat damage the projectile is carrying.
    const emitDamageBeat = (e: Extract<(typeof events)[number], { type: "damage" }>) => {
      if (sound) sfx.play(e.amount >= 3 ? "hit-heavy" : "hit");
      emitBoardFx(e.space, "damage", `−${e.amount}`);
      if (visual && e.mine && e.heroHit) setHurtKey((k) => k + 1);
    };

    // The combat's defender token — the arc's destination. combat.target is the
    // attacked fighter; captured from the resolving batch (prev, or the surviving
    // live view). A resolve this batch (COMBAT_DAMAGE/RESOLVED) is what lets a
    // damage beat arc; a plain effect/exhaustion hit never does.
    const defenderId =
      prevView?.combat?.target ?? snapshot.view.combat?.target ?? null;
    const combatResolved = (snapshot.events ?? []).some(
      (e) => e.type === "COMBAT_DAMAGE" || e.type === "COMBAT_RESOLVED"
    );
    const refsNow = refsRef.current;
    const reduced = prefersReducedMotion();
    let arcConsumed = false;

    for (const e of events) {
      switch (e.type) {
        case "commit":
          if (sound) sfx.play("commit");
          break;
        case "reveal":
          if (sound) {
            sfx.play("flip");
            // defender's card flips 0.18s after the attacker's (CombatSlot revealDelay)
            if (e.count === 2) sfx.play("flip", { delayMs: 180 });
          }
          break;
        case "draw":
          if (sound) sfx.play("draw");
          break;
        case "damage": {
          // Is THIS the combat's landed hit on the defender? If so, and an arc is
          // viable, defer the whole beat to the projectile's landing; otherwise the
          // beat fires now, exactly as before (the arc owns nothing it can't carry).
          const isDefenderHit =
            !arcConsumed && combatResolved && e.amount > 0 && !!defenderId && e.fighter === defenderId;
          const defEl = defenderId ? refsNow?.fighterEls?.current.get(defenderId) : undefined;
          // A K.O. removes the defender token before this effect runs (fightersOnBoard
          // filters defeated), so `defEl` is absent → no arc → the beat + topple fire
          // undelayed. Same for visual-off / reduced-motion / no refs wired.
          const willArc = isDefenderHit && visual && !reduced && !!defEl && !!refsNow?.clashRef;
          if (willArc) {
            arcConsumed = true;
            launchArc(e, defenderId!);
          } else {
            emitDamageBeat(e);
          }
          break;
        }
        case "heal":
          if (sound) sfx.play("heal");
          emitBoardFx(e.space, "heal", `+${e.amount}`);
          break;
        case "blocked":
          if (sound) sfx.play("blocked");
          emitBoardFx(e.space, "blocked", "BLOCKED");
          break;
        case "defeated":
          // your own fighter falling tolls lower
          if (sound) sfx.play("defeat", e.mine ? { rate: 0.8 } : undefined);
          emitBoardFx(e.space, "defeat", "K.O.");
          break;
        case "turn":
          if (sound) sfx.play("turn");
          break;
        case "cancel":
          // "The Snuff" (#346) — the fuse-fizzle punctuating a cancelled card.
          if (sound) sfx.play("snuff");
          break;
        case "victory":
          if (sound) sfx.play("victory");
          break;
        case "loss":
          if (sound) sfx.play("loss");
          break;
      }
    }

    // Schedule the projectile: at ARC_LAUNCH_MS measure both endpoints (do NOT track
    // a moving/zooming target — snapshot the rects here), spawn the fixed-position
    // arc, and land the board damage beat + sound at ARC_FLIGHT_MS. If either rect
    // is gone by launch (panel unmounted / token off-screen), the beat fires then,
    // undelayed relative to launch — no dropped damage indicator, no duplicate.
    function launchArc(
      e: Extract<(typeof events)[number], { type: "damage" }>,
      defId: FighterId
    ) {
      timersRef.current.push(
        setTimeout(() => {
          const clash = refsRef.current?.clashRef?.current?.getBoundingClientRect();
          const defRect = refsRef.current?.fighterEls?.current.get(defId)?.getBoundingClientRect();
          if (!usableRect(clash) || !usableRect(defRect)) {
            emitDamageBeat(e);
            return;
          }
          const arc: DamageArc = {
            key: `arc-${seqRef.current++}`,
            from: centerOf(clash),
            to: centerOf(defRect),
            amount: e.amount,
            heavy: e.amount >= 3,
            flightMs: ARC_FLIGHT_MS,
          };
          setArcs((cur) => [...cur, arc]);
          timersRef.current.push(
            setTimeout(() => setArcs((cur) => cur.filter((a) => a.key !== arc.key)), ARC_FLIGHT_MS)
          );
          timersRef.current.push(setTimeout(() => emitDamageBeat(e), ARC_FLIGHT_MS));
        }, ARC_LAUNCH_MS)
      );
    }
  }, [snapshot]);

  return { boardFx, arcs, hurtKey, soundOn, visualOn, toggleSound, toggleVisual };
}
