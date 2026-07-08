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
  | { kind: "reveal"; source: string };

/** A live callout on screen: a diffed `CombatCallout` plus a stable key. */
export type CombatCalloutItem = CombatCallout & { key: string };

/** How long each flourish lingers before its timer removes it (ms). */
const TTL_MS: Record<CombatCallout["kind"], number> = {
  turn: 1900,
  defend: 1700,
  reveal: 2300,
};

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

  return out;
}

/**
 * Manage the live set of combat callouts for the page. Each new flourish is
 * appended with a stable key and a per-kind timer removes it. `enabled` (the
 * `combatFx` flag) gates production only: `prevViewRef` still advances while off,
 * so flipping the flag on mid-game diffs against the CURRENT view (no stale burst
 * of banners). Off → returns `[]` and creates no state, so the flag-off path is
 * byte-identical to today.
 */
export function useCombatCallouts(
  snapshot: { view: PlayerView; events: GameEvent[] } | null,
  enabled: boolean
): CombatCalloutItem[] {
  const [items, setItems] = useState<CombatCalloutItem[]>([]);
  const prevViewRef = useRef<PlayerView | null>(null);
  const seqRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const prev = prevViewRef.current;
    prevViewRef.current = snapshot.view;
    if (!enabledRef.current) return;
    const callouts = diffCombatCallouts(prev, snapshot.view, snapshot.events);
    if (callouts.length === 0) return;
    const added = callouts.map((c) => ({ ...c, key: `cx-${seqRef.current++}` }));
    setItems((cur) => [...cur, ...added]);
    for (const item of added) {
      timersRef.current.push(
        setTimeout(
          () => setItems((cur) => cur.filter((i) => i.key !== item.key)),
          TTL_MS[item.kind]
        )
      );
    }
  }, [snapshot]);

  return enabled ? items : [];
}
