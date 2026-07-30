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
import {
  CardInstanceId,
  CardMeta,
  CombatOutcome,
  GameEvent,
  PlayerView,
  ViewCombat,
  ViewCombatCard,
} from "./protocol";
import { LINGER_TTL_MS, STRIKE_TTL_MS } from "./combatTiming";
import { isNoWinner } from "./combatOutcome";

/** win = attacker dealt damage (defense knocked back); blocked = defender won / 0
 *  damage (attack bounces off a shield); tie = resolved but neither side dealt
 *  damage (a neutral mutual shove). The `tie` variant is also where a ternary
 *  `UNKNOWN` outcome lands — a genuine no-winner combat (the Doppelgänger, engine
 *  #303) is exactly the mutual shove this variant was choreographed for, and its
 *  neutral compare pulse is the correct read: nobody's value glows gold. */
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
  /** True when this resolve was a Feint / "The Snuff" (an EFFECT_CANCELED that ENDED
   *  the combat this batch): the strike beat is suppressed so it doesn't double-animate
   *  against the Snuff callout, but the descriptor is still returned so the panel can
   *  LINGER — the strike and the panel-linger are decoupled (issue #147). The hook
   *  reads this to skip `setStrike` while still freezing the panel snapshot. */
  suppressStrike: boolean;
}

/* Both TTLs are DERIVED from the damage arc's clock in combatTiming.ts and re-exported
 * here for the panel's existing call sites. They used to be hand-tuned numbers that
 * drifted under the arc, unmounting the panel mid-flight (issue #517). */
export { LINGER_TTL_MS, STRIKE_TTL_MS };

/** The instances that identify one combat — used to build the strike key so a new
 *  combat (fresh card instances) can never collide with the one just resolved. */
const combatKey = (attackerCard: string | null, defenderCard: string | null): string =>
  `strike:${attackerCard ?? "none"}->${defenderCard ?? "none"}`;

/** How a value pill pulses on the comparison beat (issue #382): the winner glows
 *  gold, the loser dims/cracks, a tie flashes both neutrally, null = no pulse. */
export type CompareBeat = "gold" | "dim" | "neutral" | null;

/**
 * The comparison beat, derived from the strike variant so the value pulse and the
 * strike choreography never disagree about who won:
 *  - win → the attacker's value glows gold, the defender's dims.
 *  - blocked (defender won) → the defender's value glows gold, the attacker's dims.
 *  - tie → BOTH values flash neutrally, so a 0-damage draw still reads as a resolved
 *    clash rather than "nothing happened" (the #382 0-damage regression).
 */
export function comparePulseFor(
  variant: StrikeVariant | undefined,
  role: "ATTACK" | "DEFENSE"
): CompareBeat {
  if (variant === "win") return role === "ATTACK" ? "gold" : "dim";
  if (variant === "blocked") return role === "DEFENSE" ? "gold" : "dim";
  if (variant === "tie") return "neutral";
  return null;
}

/**
 * Diff two consecutive snapshots into at most one strike beat, or null. Pure and
 * view+event derived (mirrors combatFx/fxEvents):
 *  - The first snapshot (prev === null) is a state dump / reconnect, never a play,
 *    so it stays silent — no ghost strike on rejoin.
 *  - A strike fires only when the combat RESOLVES this batch: a COMBAT_RESOLVED or
 *    COMBAT_DAMAGE event, or `view.combat.outcome` transitioning off null.
 *    An empty `events` join/reconnect batch yields none (there is no resolve event
 *    and no outcome transition on a mid-combat rejoin).
 *  - The STRIKE is suppressed (but the descriptor is still returned, flagged
 *    `suppressStrike`) when the batch's EFFECT_CANCELED ENDS the combat (a Feint /
 *    "The Snuff", #346/#350): that callout owns the moment, so we don't double-animate
 *    the slam — yet the panel still needs to LINGER so both committed cards + values
 *    stay visible (issue #147). A during-combat cancel that still resolves to a real
 *    hit later keeps its strike.
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
  // COMBAT_RESOLVED event (pre-v10 batch) but where the combat survives carrying a
  // fresh outcome. When combat ends in the same batch, next.combat is already null
  // so this can't fire — the events carry the resolve instead.
  //
  // The "unresolved" sentinel is `null`, NOT 'UNKNOWN': engine/combat.ts creates a
  // combat with `outcome: null` and only ever writes a value in resolveCombat. This
  // used to also exclude 'UNKNOWN', which silently dropped the Doppelgänger's
  // no-winner resolve (engine #303) on this fallback path — an UNKNOWN outcome is a
  // RESOLVE, not a placeholder.
  const prevOutcome = prev.combat?.outcome ?? null;
  const nextOutcome = next.combat?.outcome ?? null;
  const resolvedByView = nextOutcome !== null && prevOutcome !== nextOutcome;

  if (!resolvedEvent && !damageEvent && !resolvedByView) return null;

  // The Snuff owns the feint-cancel moment, so the STRIKE beat is suppressed when the
  // cancel ENDS the combat this batch — a normal combat also ends (COMBAT_ENDED at
  // cleanup) but has no EFFECT_CANCELED, so it is never suppressed. The descriptor is
  // still returned (flagged) rather than dropped to null: the panel-linger is
  // decoupled from the strike so the calm side-by-side reveal stays visible for the
  // Feint-ends-combat case (issue #147).
  const suppressStrike = canceled && ended;

  const outcome: CombatOutcome | null =
    (resolvedEvent?.type === "COMBAT_RESOLVED" ? resolvedEvent.outcome : null) ??
    nextOutcome;

  const damage =
    damageEvent?.type === "COMBAT_DAMAGE"
      ? damageEvent.amount
      : next.combat?.attackDamageDealt ?? 0;

  // UNKNOWN is checked FIRST and defensively: a no-winner combat cannot deal attack
  // damage under the engine's only resolver (`valuesEqualUnknown` fires on equal
  // values), but if some future resolver ever returned UNKNOWN alongside damage, the
  // neutral shove is still the honest choreography — never the attacker's gold win.
  const variant: StrikeVariant = isNoWinner(outcome)
    ? "tie"
    : damage > 0
      ? "win"
      : outcome === "DEFENDER_WON"
        ? "blocked"
        : "tie";

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

  return {
    key: combatKey(attackerCard, defenderCard),
    variant,
    damage,
    outcome,
    suppressStrike,
  };
}

/** The printed value of a card instance, from the view catalog (0 when unknown —
 *  a missing pill reads better than a wrong one). */
const printedValueOf = (
  instance: CardInstanceId,
  catalog: Record<string, CardMeta>
): number => catalog[instance.split("#")[0]]?.value ?? 0;

/** The last effective value announced for a role this batch (VALUE_SET wins over an
 *  earlier VALUE_MODIFIED, both in event order), or the printed value if the server
 *  announced no adjustment. Only used for a face the live view never carried. */
const effectiveValueFor = (
  role: "ATTACK" | "DEFENSE",
  instance: CardInstanceId,
  events: GameEvent[],
  catalog: Record<string, CardMeta>
): number => {
  let value = printedValueOf(instance, catalog);
  for (const e of events) {
    if (e.type === "VALUE_SET" && e.role === role) value = e.to;
    else if (e.type === "VALUE_MODIFIED" && e.role === role) value = e.newEffective;
  }
  return value;
};

/** Reconstruct the ViewCombatCard for a face that was revealed by EVENT in the same
 *  batch that ended the combat — the live view never got to publish it. */
const faceFromEvents = (
  instance: CardInstanceId,
  role: "ATTACK" | "DEFENSE",
  events: GameEvent[],
  catalog: Record<string, CardMeta>
): ViewCombatCard => ({
  instance,
  role,
  boosts: events.flatMap((e) =>
    e.type === "CARD_BOOSTED" && e.role === role ? [e.card] : []
  ),
  effectiveValue: effectiveValueFor(role, instance, events, catalog),
});

/**
 * Freeze the just-resolved combat into a ViewCombat the panel can keep rendering
 * for the strike's duration after the live `view.combat` has already cleared. Built
 * from the last live combat (prev.combat) with the resolved outcome/damage stamped on,
 * so both faces + the outcome text survive the unmount.
 *
 * The batch's CARDS_REVEALED is GRAFTED over any face `prev.combat` was still hiding
 * (issue #517): when commit → reveal → resolve → end all arrive in ONE server drive
 * (declined defense, a bot acting in a single batch, a Feint snuff), `prev.combat` is
 * still the PRE-reveal stage with `attackerCard`/`defenderCard` null — freezing it
 * verbatim froze the dashed "no card" placeholder, so the damage arc flew out of a
 * blank card. Everything the panel draws must be captured HERE, at diff time.
 *
 * `strike` may be null when the combat's resolve landed in an EARLIER batch than its
 * end; the base combat already carries the outcome/damage in that case.
 *
 * Returns null when there was no live combat to freeze (defensive — a resolve always
 * has a preceding combat).
 */
export function captureLingeringCombat(
  prev: PlayerView,
  strike: CombatStrike | null,
  events: GameEvent[] = []
): ViewCombat | null {
  const base = prev.combat;
  if (!base) return null;

  const revealed = events.find((e) => e.type === "CARDS_REVEALED");
  const reveal = revealed?.type === "CARDS_REVEALED" ? revealed : null;
  const catalog = prev.catalog ?? {};

  // Prefer the live faces (they carry the server's boosts + effective values); only
  // fill a slot the view still had hidden. A null defenderCard in CARDS_REVEALED means
  // the defense was declined — the empty slot is then the truth, not a bug.
  const attackerCard =
    base.attackerCard ??
    (reveal ? faceFromEvents(reveal.attackerCard, "ATTACK", events, catalog) : null);
  const defenderCard =
    base.defenderCard ??
    (reveal?.defenderCard
      ? faceFromEvents(reveal.defenderCard, "DEFENSE", events, catalog)
      : null);

  return {
    ...base,
    attackerCard,
    defenderCard,
    stage: "CLEANUP",
    outcome: strike?.outcome ?? base.outcome,
    attackDamageDealt: strike ? strike.damage : base.attackDamageDealt,
  };
}

/**
 * Manage the strike beat for the page. Returns the live `strike` descriptor (or
 * null) and a `lingeringCombat` snapshot to render the panel from once the live
 * `view.combat` has cleared in the resolving batch.
 *
 *  - Each combat's strike is emitted exactly once (deduped by its stable key).
 *  - The panel freezes on the combat → null TRANSITION, whichever batch that lands in
 *    — not only when the resolving batch itself ends the combat (issue #517). A combat
 *    that resolves in batch A (outcome stamped, combat survives for AFTER-window
 *    prompts) and ends in a later batch B used to get NO linger at all: `diffCombatStrike(B)`
 *    is null, so the panel unmounted instantly at B — mid-arc when bot cleanup drives
 *    follow fast. The last live combat is frozen instead, carrying A's outcome.
 *  - The linger is DECOUPLED from the strike: a Feint that ends combat
 *    (`suppressStrike`) fires no strike, yet the panel still lingers so both cards +
 *    values are seen (issue #147) while the Snuff callout plays over the top.
 *  - Only a RESOLVED combat lingers: a combat that vanishes without ever resolving has
 *    nothing to hold on screen, so it unmounts as before.
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
  /** The most recent strike descriptor, kept so a combat whose END arrives in a LATER
   *  batch than its resolve can still stamp the frozen panel with that outcome/damage. */
  const lastStrikeRef = useRef<CombatStrike | null>(null);
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
    const fresh = !!s && s.key !== lastKeyRef.current;
    if (fresh && s) {
      lastKeyRef.current = s.key;
      lastStrikeRef.current = s;

      // The strike beat fires only when NOT suppressed. On a Feint that ends the combat
      // (`suppressStrike`), the Snuff callout owns the slam, so we skip the strike — but
      // the panel-linger below still runs so both committed cards + values stay on screen
      // (issue #147).
      if (!s.suppressStrike) {
        setStrike(s);
        if (strikeTimerRef.current) clearTimeout(strikeTimerRef.current);
        strikeTimerRef.current = setTimeout(() => setStrike(null), STRIKE_TTL_MS);
      }
    }

    // The combat left the view THIS batch → freeze it so the panel keeps rendering
    // while the strike plays (or, on a suppressed Feint, while the Snuff callout
    // resolves over the top). This runs on the transition itself, not only inside the
    // resolving batch, so a resolve-now/end-later combat still lingers (#517).
    if (!prev?.combat || next.combat) return;

    // …but only for a combat that actually RESOLVED: either this batch's descriptor, the
    // one remembered from the resolving batch (same combat), or an outcome the surviving
    // combat was already carrying. A combat that vanishes unresolved has nothing to hold.
    const carried =
      lastStrikeRef.current &&
      lastStrikeRef.current.key ===
        combatKey(prev.combat.attackerCard?.instance ?? null, prev.combat.defenderCard?.instance ?? null)
        ? lastStrikeRef.current
        : null;
    // Any non-null outcome counts as resolved — `null` is the unresolved sentinel
    // (see diffCombatStrike). Excluding 'UNKNOWN' here denied the panel-linger to a
    // Doppelgänger stalemate whose end arrived in a later batch (engine #303).
    const resolved = !!s || !!carried || prev.combat.outcome !== null;
    if (!resolved) return;

    const frozen = captureLingeringCombat(prev, s ?? carried, snapshot.events);
    if (!frozen) return;
    setLingeringCombat(frozen);
    if (lingerTimerRef.current) clearTimeout(lingerTimerRef.current);
    lingerTimerRef.current = setTimeout(() => setLingeringCombat(null), LINGER_TTL_MS);
  }, [snapshot]);

  return { strike, lingeringCombat };
}
