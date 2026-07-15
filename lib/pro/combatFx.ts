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
  // "The Snuff" (issue #346): a cancel-effects card (Feint, …) killed a combat
  // card's TEXT. `role` names the cancelled (victim) side — the overlay resolves
  // its face from combat.attackerCard/defenderCard and keeps its printed value
  // visibly "alive" (the number still hits; only the words burn away).
  | { kind: "cancel"; role: "ATTACK" | "DEFENSE" };

/** A live callout on screen: a diffed `CombatCallout` plus a stable key. Reveals
 *  also carry a `slot` — a cascade index the overlay turns into a small
 *  down-right offset so two reveals whose lifetimes overlap don't sit dead-center
 *  on top of each other. */
export type CombatCalloutItem = CombatCallout & { key: string; slot?: number };

/** How long each flourish lingers before its timer removes it (ms). */
const TTL_MS: Record<CombatCallout["kind"], number> = {
  turn: 1900,
  defend: 1700,
  reveal: 2300,
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

  // 3. Scheme / effect card-reveal — float the source card center-screen. Dedup
  //    identical sources within the batch so a doubled event isn't two stacked
  //    cards. `SCHEME_PLAYED.card` / `EFFECT_FIRED.source` may be `'(hidden)'`.
  //    Buster's nested STUNT and Cameraman reveal events are public reveal beats too.
  const seen = new Set<string>();
  const addReveal = (source: string) => {
    if (seen.has(source)) return;
    seen.add(source);
    out.push({ kind: "reveal", source });
  };
  for (const e of events) {
    if (e.type === "SCHEME_PLAYED" || e.type === "CARD_PLAYED_FROM_HAND" || e.type === "CARD_REVEALED") addReveal(e.card);
    else if (e.type === "EFFECT_FIRED") addReveal(e.source);
  }

  // 4. The Snuff (issue #346) — a cancel-effects card foiled a combat card. Dedup
  //    by cancelled side within the batch (a card can raise EFFECT_CANCELED per
  //    scope, but the callout is one victim per side). Only the v10 `events`
  //    carry this; a pre-v10/empty batch yields none, exactly like reveals.
  const cancelledRoles = new Set<"ATTACK" | "DEFENSE">();
  for (const e of events) {
    if (e.type === "EFFECT_CANCELED" && !cancelledRoles.has(e.role)) {
      cancelledRoles.add(e.role);
      out.push({ kind: "cancel", role: e.role });
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
  // Reveal-queue bookkeeping: the timestamp the next reveal may appear, and a
  // monotonic cascade counter that resets once the queue has fully drained.
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
      if (c.kind !== "reveal") {
        // Turn / defend are view-derived beats — fire immediately, as before.
        setItems((cur) => [...cur, { ...c, key }]);
        removeLater(key, TTL_MS[c.kind]);
        continue;
      }
      // Reveal: stagger the entrance, cap the backlog, cascade the position.
      const showAt = Math.max(now, revealFreeAtRef.current);
      if (showAt - now > REVEAL_MAX_LEAD_MS) continue; // drop overflow
      const delay = showAt - now;
      const slot = revealCycleRef.current++ % REVEAL_SLOTS;
      revealFreeAtRef.current = showAt + REVEAL_STAGGER_MS;
      const item: CombatCalloutItem = { ...c, key, slot };
      timersRef.current.push(setTimeout(() => setItems((cur) => [...cur, item]), delay));
      removeLater(key, delay + TTL_MS.reveal);
    }
  }, [snapshot]);

  return items;
}
