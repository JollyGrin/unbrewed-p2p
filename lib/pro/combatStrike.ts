/**
 * "The strike beat" (issue #381, part of the #379 battle-sequence epic). After the
 * combat flip settles, the attack card lunges across the panel and slams into the
 * defense card; the defense card reacts by outcome (knocked back on a win, a
 * shield-bounce when blocked, a mutual shove on a tie). This module owns the PURE
 * derivation: diffing a snapshot into a single `CombatStrike` descriptor (variant +
 * damage + a stable per-combat key), and freezing the just-resolved combat into a
 * `ViewCombat` the panel can keep rendering while the strike plays.
 *
 * Presentation only — nothing here feeds back into play. Everything the strike
 * draws is captured HERE at diff time (faces, effective values, outcome, damage),
 * never re-read from the live view mid-animation, exactly like combatFx.ts's snuff
 * callout: a combat that RESOLVES and ENDS in one STATE batch already carries
 * `combat: null` by the time the panel would mount, so the strike would have no
 * panel to play in. The linger snapshot bridges that gap.
 */
import { useEffect, useRef, useState } from "react";
import { CombatOutcome, GameEvent, PlayerView, ViewCombat } from "./protocol";

/** win = attacker dealt damage (defense knocked back); blocked = defender won / 0
 *  damage (attack bounces off a shield); tie = resolved but neither side dealt
 *  damage (a neutral mutual shove). */
export type StrikeVariant = "win" | "blocked" | "tie";

export interface CombatStrike {
  /** Stable per-combat identity — the hook emits each key exactly once, so the
   *  strike plays once even if two consecutive batches satisfy the resolve test. */
  key: string;
  variant: StrikeVariant;
  /** Net damage dealt this combat (0 for blocked/tie); scales the knockback. */
  damage: number;
  /** The resolved outcome, stamped onto the frozen linger combat's outcome text. */
  outcome: CombatOutcome | null;
}

/** How long the strike descriptor stays live (ms). Kept just PAST the linger TTL so
 *  the defense card's `both`-held knocked/dimmed pose is still applied when a
 *  lingered panel unmounts — the panel disappears rather than snapping back to rest. */
export const STRIKE_TTL_MS = 1800;
/** How long a frozen combat lingers after `view.combat` clears (ms). Covers the
 *  full strike (wind-up ~0.85s + lunge/reaction ~0.5s) plus a short settled hold. */
export const LINGER_TTL_MS = 1700;

/** The instances that identify one combat — used to build the strike key so a new
 *  combat (fresh card instances) can never collide with the one just resolved. */
const combatKey = (attackerCard: string | null, defenderCard: string | null): string =>
  `strike:${attackerCard ?? "none"}->${defenderCard ?? "none"}`;

/**
 * Diff two consecutive snapshots into at most one strike beat, or null. Pure and
 * view+event derived (mirrors combatFx/fxEvents):
 *  - The first snapshot (prev === null) is a state dump / reconnect, never a play,
 *    so it stays silent — no ghost strike on rejoin.
 *  - A strike fires only when the combat RESOLVES this batch: a COMBAT_RESOLVED or
 *    COMBAT_DAMAGE event, or `view.combat.outcome` transitioning off UNKNOWN/null.
 *    An empty `events` join/reconnect batch yields none (there is no resolve event
 *    and no outcome transition on a mid-combat rejoin).
 *  - Suppressed when the batch's EFFECT_CANCELED ENDS the combat (a Feint / "The
 *    Snuff", #346/#350): that callout owns the moment, so we don't double-animate.
 *    A during-combat cancel that still resolves to a real hit later keeps its strike.
 */
export function diffCombatStrike(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[]
): CombatStrike | null {
  if (!prev) return null;

  const resolvedEvent = events.find((e) => e.type === "COMBAT_RESOLVED");
  const damageEvent = events.find((e) => e.type === "COMBAT_DAMAGE");
  const ended = events.some((e) => e.type === "COMBAT_ENDED");
  const canceled = events.some((e) => e.type === "EFFECT_CANCELED");

  // The outcome-transition path covers a resolve that arrives without an explicit
  // COMBAT_RESOLVED event (pre-v10 batch) but where combat survives with a fresh,
  // non-UNKNOWN outcome. When combat ends in the same batch, next.combat is already
  // null so this can't fire — the events carry the resolve instead.
  const prevOutcome = prev.combat?.outcome ?? null;
  const nextOutcome = next.combat?.outcome ?? null;
  const resolvedByView =
    nextOutcome !== null && nextOutcome !== "UNKNOWN" && prevOutcome !== nextOutcome;

  if (!resolvedEvent && !damageEvent && !resolvedByView) return null;

  // The Snuff owns the feint-cancel moment. Suppress only when the cancel ENDS the
  // combat this batch — a normal combat also ends (COMBAT_ENDED at cleanup) but has
  // no EFFECT_CANCELED, so it is never suppressed here.
  if (canceled && ended) return null;

  const outcome: CombatOutcome | null =
    (resolvedEvent?.type === "COMBAT_RESOLVED" ? resolvedEvent.outcome : null) ??
    nextOutcome;

  const damage =
    damageEvent?.type === "COMBAT_DAMAGE"
      ? damageEvent.amount
      : next.combat?.attackDamageDealt ?? 0;

  const variant: StrikeVariant =
    damage > 0 ? "win" : outcome === "DEFENDER_WON" ? "blocked" : "tie";

  // Card faces identify the combat. CARDS_REVEALED (same STATE batch when a combat
  // resolves at reveal) is authoritative; otherwise fall back to the surviving view.
  const revealed = events.find((e) => e.type === "CARDS_REVEALED");
  const attackerCard =
    (revealed?.type === "CARDS_REVEALED" ? revealed.attackerCard : null) ??
    prev.combat?.attackerCard?.instance ??
    next.combat?.attackerCard?.instance ??
    null;
  const defenderCard =
    (revealed?.type === "CARDS_REVEALED" ? revealed.defenderCard : null) ??
    prev.combat?.defenderCard?.instance ??
    next.combat?.defenderCard?.instance ??
    null;

  return { key: combatKey(attackerCard, defenderCard), variant, damage, outcome };
}

/**
 * Freeze the just-resolved combat into a ViewCombat the panel can keep rendering
 * for the strike's duration after the live `view.combat` has already cleared in the
 * resolving batch. Built from the last live combat (prev.combat) with the resolved
 * outcome/damage stamped on, so both faces + the outcome text survive the unmount.
 * Returns null when there was no live combat to freeze (defensive — a resolve
 * always has a preceding combat).
 */
export function captureLingeringCombat(
  prev: PlayerView,
  strike: CombatStrike
): ViewCombat | null {
  const base = prev.combat;
  if (!base) return null;
  return {
    ...base,
    stage: "CLEANUP",
    outcome: strike.outcome ?? base.outcome,
    attackDamageDealt: strike.damage,
  };
}

/**
 * Manage the strike beat for the page. Returns the live `strike` descriptor (or
 * null) and a `lingeringCombat` snapshot to render the panel from once the live
 * `view.combat` has cleared in the resolving batch.
 *
 *  - Each combat's strike is emitted exactly once (deduped by its stable key).
 *  - When the combat ends in the resolving batch, the just-resolved combat is
 *    frozen so the panel lingers ~1.7s and the strike has somewhere to play.
 *  - A new live combat (or any new `view.combat`) cancels a pending linger
 *    immediately, so a fast follow-up combat never renders the stale frozen one.
 */
export function useCombatStrike(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): { strike: CombatStrike | null; lingeringCombat: ViewCombat | null } {
  const [strike, setStrike] = useState<CombatStrike | null>(null);
  const [lingeringCombat, setLingeringCombat] = useState<ViewCombat | null>(null);
  const prevViewRef = useRef<PlayerView | null>(null);
  const lastKeyRef = useRef<string | null>(null);
  const strikeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lingerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (strikeTimerRef.current) clearTimeout(strikeTimerRef.current);
      if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    const next = snapshot.view;
    prevViewRef.current = next;

    // A live combat on screen cancels any lingering frozen combat immediately —
    // this is what "a new combat starting during the linger cancels it" means.
    if (next.combat && lingerTimerRef.current) {
      clearTimeout(lingerTimerRef.current);
      lingerTimerRef.current = null;
      setLingeringCombat(null);
    }

    const s = diffCombatStrike(prev, next, snapshot.events);
    if (!s || s.key === lastKeyRef.current) return;
    lastKeyRef.current = s.key;

    setStrike(s);
    if (strikeTimerRef.current) clearTimeout(strikeTimerRef.current);
    strikeTimerRef.current = setTimeout(() => setStrike(null), STRIKE_TTL_MS);

    // Combat ended in this very batch (view.combat already null) → freeze it so the
    // panel keeps rendering while the strike plays.
    if (!next.combat && prev) {
      const frozen = captureLingeringCombat(prev, s);
      if (frozen) {
        setLingeringCombat(frozen);
        if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
        lingerTimerRef.current = setTimeout(
          () => setLingeringCombat(null),
          LINGER_TTL_MS
        );
      }
    }
  }, [snapshot]);

  return { strike, lingeringCombat };
}
