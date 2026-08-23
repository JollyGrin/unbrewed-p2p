/**
 * Mid-combat defender substitution (protocol v34 ↔ engine #494, DSL v0.62.0).
 *
 * `COMBAT_DEFENDER_CHANGED { from, to }` says the DEFENDING FIGHTER of the live
 * combat changed — same combat, same defending player, same revealed cards, but
 * the damage will land on `to` instead of `from`. Ellen Ripley's *GET BEHIND ME*
 * is the first card that emits it: "Ripley and Newt may swap spaces, if they do,
 * the other fighter is now the defender."
 *
 * WHY THE CLIENT CANNOT IGNORE IT. `to` is the fighter that takes the damage and
 * the one every later DURING/AFTER effect, range check and adjacency test reads.
 * The view's own `combat.target` does move with it — the engine writes it live —
 * so a client that only ever mirrors the view is not *wrong*, it is SILENT: the
 * attack arrow quietly re-points to a different figure between two frames, with
 * nothing anywhere saying a substitution happened. That is a rules-relevant beat
 * arriving as an unexplained jump. This module is the explanation, on the three
 * channels a Pro match speaks:
 *
 *   - the combat panel (`ProDock`) wears a tag naming who stepped in,
 *   - the board rings the NEW defender and chips it "steps in",
 *   - `gameLog.ts` prints one line, which is also the replay's log entry.
 *
 * The event always arrives BEFORE `COMBAT_VALUE_BREAKDOWN` / `COMBAT_DAMAGE` for
 * its combat, so a beat derived here is on screen before the numbers land.
 *
 * Pure and React-free on purpose (the `positionSwap.ts` split): `gameLog.ts`
 * imports `defenderChanges` without pulling React into its graph, and the hook
 * lives next door in `useDefenderSwap.ts`.
 */
import { FighterId, GameEvent, PlayerView } from "./protocol";

/** One `COMBAT_DEFENDER_CHANGED`: the defending fighter moved `from` → `to`. */
export interface DefenderChange {
  from: FighterId;
  to: FighterId;
}

/**
 * Every defender substitution in this batch, in order. A pre-v34 server (or any
 * batch without one) yields `[]`, so callers that filter on it stay
 * byte-identical to their pre-v34 behaviour.
 */
export function defenderChanges(events: GameEvent[]): DefenderChange[] {
  const out: DefenderChange[] = [];
  for (const e of events) {
    if (e.type === "COMBAT_DEFENDER_CHANGED") out.push({ from: e.from, to: e.to });
  }
  return out;
}

/**
 * The substitution that is STILL IN FORCE after this batch: the last one, since
 * a chain (A → B → C) leaves C defending. Null when the batch carried none.
 */
export function latestDefenderChange(events: GameEvent[]): DefenderChange | null {
  const all = defenderChanges(events);
  return all.length ? all[all.length - 1] : null;
}

/** A substitution the UI is currently showing, plus a monotonic key so a second
 *  one in the same combat replays the board beat. */
export interface DefenderSwap extends DefenderChange {
  key: number;
}

/**
 * Is `swap` still the truth about the view on screen? A substitution is scoped
 * to ONE combat: it dies with the combat that made it, and it is superseded the
 * moment the view's own defender is somebody else (a later substitution, or a
 * brand-new combat that happens to arrive in the same batch).
 *
 * Deliberately validated against `view.combat.target` rather than being run down
 * by a timer: this is not a flourish, it is a statement about who is defending,
 * and it must not outlive the fact by so much as a frame.
 */
export function defenderSwapStillLive(swap: DefenderChange, view: PlayerView): boolean {
  return !!view.combat && view.combat.target === swap.to;
}

/**
 * "Attacker → defender", for a surface that shows a combat WITHOUT an event
 * stream — the replay scrubber, whose steps carry `ViewCombat` but no `events`
 * (see `ReplayStep`). There a substitution has no beat to play: the only way it
 * can be read at all is that the named defender CHANGES from one step to the
 * next, which is why the scrubber names both sides rather than just the cards.
 */
export function combatSidesLine(attackerName: string, defenderName: string): string {
  return `${attackerName} → ${defenderName}`;
}

/** Board/panel copy for a substitution, given the two fighters' display names.
 *  One function so the tag, the chip and the log line can never disagree. */
export function defenderSwapText(fromName: string, toName: string) {
  return {
    /** compact chip on the board token */
    chip: "steps in",
    /** combat-panel tag */
    tag: `${toName.toUpperCase()} STEPS IN`,
    /** hover title / aria label, and the log line's wording */
    full: `${toName} steps in as the defender (${fromName} steps back) — the damage lands on ${toName}`,
  };
}
