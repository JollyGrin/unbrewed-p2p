/**
 * "Combat Callouts" — the on-screen flourish layer for Pro matches (issue #162).
 * Sibling to fxEvents.ts/useGameFx.ts: that channel owns board-anchored beats
 * (floating damage, K.O. bursts, the hurt vignette); THIS channel owns the three
 * full-screen decorative callouts — the YOUR-TURN banner, the DEFEND! pulse, and
 * the scheme/effect card-reveal — driven by the same snapshot diff plus the v10
 * `events` stream. Purely decorative: nothing here feeds back into play, gates an
 * action, or touches diffViews. Kept OUT of useGameFx so the board-FX loop stays
 * byte-identical; both hooks diff the same snapshots independently, exactly like
 * the log's own prevViewRef in game.tsx.
 */
import { useEffect, useRef, useState } from "react";
import { GameEvent, PlayerView } from "./protocol";

/** One derived flourish. `turn`/`defend` come from the view alone (work pre-v10);
 *  `reveal` needs the v10 `events` and carries the source card's instance id (or
 *  the redacted `'(hidden)'` placeholder, rendered generically). */
export type CombatCallout =
  | { kind: "turn"; mine: boolean }
  | { kind: "defend" }
  | { kind: "reveal"; source: string }
  // A delayed During/After-Combat effect (`EFFECT_FIRED`, issue #380) resolving.
  // Distinct from a plain reveal so the overlay can wear a combat-window ribbon
  // (⚡ DURING COMBAT / AFTER COMBAT) instead of looking identical to a scheme
  // being played. `source` follows the reveal rules (the source card's instance
  // id, or the redacted `'(hidden)'` placeholder). `window` is derived from the
  // event's `fireAt` (see EFFECT_WINDOW) — the SAME field the activity log reads,
  // so the ribbon and the log line can never disagree about a card's timing.
  | { kind: "effect"; source: string; window: "during" | "after" }
  // "The Snuff" (issue #346, hardened in #350): a cancel-effects card (Feint, …)
  // killed a combat card's TEXT. `role` names the cancelled (victim) side. EVERYTHING
  // the overlay draws is captured HERE at diff time, never re-read from the live view
  // at render: a Feint that ends the combat in one server drive already carries
  // `combat: null` by the time the overlay mounts, which used to degrade the face to
  // a blank "Attack card" placeholder. `victim`/`canceller` are the two combat-card
  // instance ids (victim = cancelled side, canceller = the opposite card that did it),
  // or null when neither the batch nor the surviving view can name them. `value` is
  // the pill's "STILL HITS" number: net COMBAT_DAMAGE when it resolved in the batch,
  // else the victim's printed catalog value (the number still hits; only the words burn).
  | {
      kind: "cancel";
      role: "ATTACK" | "DEFENSE";
      victim: string | null;
      canceller: string | null;
      value: number | null;
    };

/** A live callout on screen: a diffed `CombatCallout` plus a stable key. Reveals
 *  and effect ribbons also carry a `slot` — a cascade index the overlay turns
 *  into a small down-right offset so two callouts whose lifetimes overlap don't
 *  sit dead-center on top of each other. */
export type CombatCalloutItem = CombatCallout & { key: string; slot?: number };

/** Which combat window an `EFFECT_FIRED` wears on its ribbon, from the event's
 *  `fireAt`. `COMBAT_END` is the only fireAt that names the combat itself
 *  resolving — the log phrases it "at end of combat" (gameLog `FIRE_AT`) — so it
 *  reads as the "AFTER COMBAT" aftermath. `START`/`END` are turn-boundary delayed
 *  effects that fire while a combat callout is still the on-screen context, so
 *  they wear the "DURING COMBAT" ribbon. Deriving from the same `fireAt` field
 *  the activity log reads keeps ribbon and log line in lockstep. */
const EFFECT_WINDOW: Record<"START" | "END" | "COMBAT_END", "during" | "after"> = {
  START: "during",
  END: "during",
  COMBAT_END: "after",
};

/** How long each flourish lingers before its timer removes it (ms). */
const TTL_MS: Record<CombatCallout["kind"], number> = {
  turn: 1900,
  defend: 1700,
  reveal: 2300,
  // Matches reveals — effect ribbons ride the same stagger queue and motion, so
  // they linger for exactly as long (issue #380).
  effect: 2300,
  // Matches reveals so the snuff never outlives the floating damage numbers that
  // land right after it (EFFECT_CANCELED fires before COMBAT_DAMAGE) — issue #346.
  cancel: 2300,
};

/** Reveals never mount on top of each other: each one waits this long after the
 *  previous reveal *appeared*, so a multi-reveal turn deals them out one at a
 *  time instead of flashing a whole stack at once. */
const REVEAL_STAGGER_MS = 650;
/** Cap the reveal backlog. A redacted combo (nested STUNTs, cascading effects)
 *  could queue a dozen reveals, which would drift far behind the board; past
 *  this lead we drop the overflow — reveals are decorative. */
const REVEAL_MAX_LEAD_MS = 2600;
/** Distinct cascade positions. Any reveals still overlapping in time step
 *  down-right through these slots (wrapping) instead of stacking dead-center. */
const REVEAL_SLOTS = 4;

/** The defender is on the clock: combat has reached its commit-defense stage and
 *  YOU are the one who must answer. Precise enough to never fire while you are the
 *  attacker committing an attack card (both share the COMMIT_COMBAT_CARD prompt). */
const mustDefend = (v: PlayerView): boolean =>
  v.combat?.stage === "COMMIT_DEFENSE" && v.combat.defenderPlayer === v.you;

/**
 * Diff consecutive snapshots into decorative callouts. Pure and view-derived
 * (mirrors fxEvents/diffViews): the first snapshot is a state dump, not a play,
 * so it stays silent. `reveal`s come only from the v10 `events` — an empty
 * `events` array (pre-v10 server, or a join/reconnect batch) yields none.
 */
export function diffCombatCallouts(
  prev: PlayerView | null,
  next: PlayerView,
  events: GameEvent[]
): CombatCallout[] {
  if (!prev) return [];
  const out: CombatCallout[] = [];

  // 1. YOUR TURN — a banner on every turn flip (dimmer for the opponent's).
  if (prev.activePlayer !== next.activePlayer) {
    out.push({ kind: "turn", mine: next.activePlayer === next.you });
  }

  // 2. DEFEND! — the moment the combat asks YOU to commit a defense.
  if (mustDefend(next) && !mustDefend(prev)) out.push({ kind: "defend" });

  // 3. Scheme card-reveal — float the source card center-screen with the plain
  //    look. Dedup identical sources within the batch so a doubled event isn't
  //    two stacked cards. `SCHEME_PLAYED.card` may be `'(hidden)'`. Buster's
  //    nested STUNT and Cameraman reveal events are public reveal beats too.
  const seen = new Set<string>();
  const addReveal = (source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    out.push({ kind: "reveal", source });
  };
  //    Effect ribbons (issue #380) — a delayed During/After-Combat effect fired.
  //    Kept distinct from reveals: same rise, but the overlay draws a combat-window
  //    ribbon so it never looks like a scheme being played. Deduped on their own
  //    set so a card that both plays AND fires an effect this batch still shows one
  //    of each (a plain reveal + a ribboned effect), not a single collapsed card.
  //    `EFFECT_FIRED.source` may be `'(hidden)'`, rendered generically.
  const seenEffect = new Set<string>();
  const addEffect = (source: string, fireAt: "START" | "END" | "COMBAT_END") => {
    if (seenEffect.has(source)) return;
    seenEffect.add(source);
    out.push({ kind: "effect", source, window: EFFECT_WINDOW[fireAt] });
  };
  for (const e of events) {
    if (e.type === "SCHEME_PLAYED" || e.type === "CARD_PLAYED_FROM_HAND" || e.type === "CARD_REVEALED") addReveal(e.card);
    else if (e.type === "EFFECT_FIRED") addEffect(e.source, e.fireAt);
  }

  // 4. The Snuff (issue #346, hardened in #350) — a cancel-effects card foiled a
  //    combat card. Resolve EVERYTHING the overlay draws HERE, from the batch, so a
  //    Feint that drives COMBAT_DAMAGE/RESOLVED/ENDED in the same STATE message (its
  //    view already `combat: null`) can't degrade the callout to a blank placeholder.
  //    Dedup by cancelled side within the batch (a card can raise EFFECT_CANCELED
  //    per scope, but the callout is one victim per side). Only the v10 `events`
  //    carry this; a pre-v10/empty batch yields none, exactly like reveals.
  //
  //    Faces: CARDS_REVEALED (same STATE message, always carries both ids — the
  //    reveal callout's trick) is authoritative; fall back to the surviving combat
  //    view when the cancel lands in a LATER batch (e.g. after a prompt pause) where
  //    no fresh reveal event rides along.
  const revealed = events.find((e) => e.type === "CARDS_REVEALED");
  const attackerId =
    (revealed?.type === "CARDS_REVEALED" ? revealed.attackerCard : null) ??
    prev.combat?.attackerCard?.instance ??
    next.combat?.attackerCard?.instance ??
    null;
  const defenderId =
    (revealed?.type === "CARDS_REVEALED" ? revealed.defenderCard : null) ??
    prev.combat?.defenderCard?.instance ??
    next.combat?.defenderCard?.instance ??
    null;
  //    Pill: net damage that still landed this batch (COMBAT_DAMAGE) is the truth
  //    when present; otherwise fall back to the victim's printed catalog value —
  //    the same static source the activity log reads for its "(2/2)" stats.
  const damage = events.find((e) => e.type === "COMBAT_DAMAGE");
  const netDamage = damage?.type === "COMBAT_DAMAGE" ? damage.amount : null;
  const printedValue = (instance: string | null): number | null =>
    instance ? next.catalog[instance.split("#")[0]]?.value ?? null : null;

  const cancelledRoles = new Set<"ATTACK" | "DEFENSE">();
  for (const e of events) {
    if (e.type === "EFFECT_CANCELED" && !cancelledRoles.has(e.role)) {
      cancelledRoles.add(e.role);
      const victim = e.role === "ATTACK" ? attackerId : defenderId;
      const canceller = e.role === "ATTACK" ? defenderId : attackerId;
      const value = netDamage ?? printedValue(victim);
      out.push({ kind: "cancel", role: e.role, victim, canceller, value });
    }
  }

  return out;
}

/**
 * Manage the live set of combat callouts for the page. Each new flourish is
 * appended with a stable key and a per-kind timer removes it.
 */
export function useCombatCallouts(
  snapshot: { view: PlayerView; events: GameEvent[] } | null
): CombatCalloutItem[] {
  const [items, setItems] = useState<CombatCalloutItem[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Reveal/effect-queue bookkeeping: the timestamp the next staggered callout may
  // appear, and a monotonic cascade counter that resets once the queue has drained.
  const revealFreeAtRef = useRef(0);
  const revealCycleRef = useRef(0);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    const callouts = diffCombatCallouts(prev, snapshot.view, snapshot.events);
    if (callouts.length === 0) return;

    const removeLater = (key: string, delay: number) =>
      timersRef.current.push(
        setTimeout(() => setItems((cur) => cur.filter((i) => i.key !== key)), delay)
      );

    const now = Date.now();
    // A drained queue restarts the cascade at slot 0 (dead-center) so a fresh
    // burst isn't offset by wherever the last one happened to stop.
    if (revealFreeAtRef.current <= now) revealCycleRef.current = 0;

    for (const c of callouts) {
      const key = `cx-${seqRef.current++}`;
      if (c.kind !== "reveal" && c.kind !== "effect") {
        // Turn / defend / cancel are view-derived beats — fire immediately, as before.
        setItems((cur) => [...cur, { ...c, key }]);
        removeLater(key, TTL_MS[c.kind]);
        continue;
      }
      // Reveal + effect ribbon share ONE stagger queue (issue #380): stagger the
      // entrance, cap the backlog, cascade the position so simultaneous callouts
      // deal out one at a time instead of stacking dead-center.
      const showAt = Math.max(now, revealFreeAtRef.current);
      if (showAt - now > REVEAL_MAX_LEAD_MS) continue; // drop overflow
      const delay = showAt - now;
      const slot = revealCycleRef.current++ % REVEAL_SLOTS;
      revealFreeAtRef.current = showAt + REVEAL_STAGGER_MS;
      const item: CombatCalloutItem = { ...c, key, slot };
      timersRef.current.push(setTimeout(() => setItems((cur) => [...cur, item]), delay));
      removeLater(key, delay + TTL_MS[c.kind]);
    }
  }, [snapshot]);

  return items;
}
