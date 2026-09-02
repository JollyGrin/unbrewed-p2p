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
 *   - the board rings the NEW defender and chips it "defends instead",
 *   - `gameLog.ts` prints one line, which is also the replay's log entry.
 *
 * The event always arrives BEFORE `COMBAT_VALUE_BREAKDOWN` / `COMBAT_DAMAGE` for
 * its combat, so a beat derived here is on screen before the numbers land.
 *
 * ISSUE #694 WIDENED THE QUESTION. "Who is actually defending?" is not only asked
 * by a mid-combat substitution — Grievous's Multi-Arm Barrage opens Combat 2
 * against a target chosen at commit time, which no `COMBAT_DEFENDER_CHANGED` ever
 * describes. The second half of this module (`CombatTargeting` and friends) states
 * the family generically: the live combat's target versus the target its attacker
 * DECLARED. Same three channels, same copy helper, one extra wording.
 *
 * Pure and React-free on purpose (the `positionSwap.ts` split): `gameLog.ts`
 * imports `defenderChanges` without pulling React into its graph, and the hook
 * lives next door in `useDefenderSwap.ts`.
 */
import { FighterId, GameEvent, PlayerView, ViewCombat } from "./protocol";

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

/**
 * WHY the fighter taking this attack is not the one that was attacked. Two
 * different beats that end in the same place — "the damage is landing over
 * there" — and they must not be worded the same:
 *
 *  - `SUBSTITUTED`: the DEFENDER changed inside a live combat, cards already on
 *    the table (`setCombatDefender` — Ripley's *GET BEHIND ME*, Appa's
 *    *Hallucinations*). A different fighter is taking the blow that was already
 *    swinging.
 *  - `REDIRECTED`: the combat OPENED against somebody other than the fighter the
 *    attacker declared this action against (Grievous's Multi-Arm Barrage Combat 2,
 *    whose target is chosen at commit time, post-LUNGE). Nothing was substituted —
 *    the attack simply went somewhere else from the start.
 *
 * WHO CHOSE IS DELIBERATELY UNSAID (issue #737). The original wording was
 * "<X> steps in as the defender (<Y> steps back)", written against Ripley, where
 * the defending player plays GET BEHIND ME to protect their own fighter — a
 * voluntary act, by the seat that owns both fighters. Appa's *Hallucinations* is
 * the same event from the other side of the table: the ATTACKER plays it and
 * substitutes among the OPPONENT's fighters. "Steps in" then describes an act of
 * protection that nobody performed, and reads as if the defender chose it.
 *
 * The copy is otherwise seat-neutral already — it names fighters, never "your"
 * or "their", and the log line is emitted `who: "game"` for exactly that reason —
 * so the fix is one wording that states the FACT ("<X> takes <Y>'s place as the
 * defender") and leaves agency out of it. One helper, one wording, correct read
 * from either seat and for either card; a second SUBSTITUTED phrasing keyed on
 * who played the card would be two wordings for one event.
 */
export type DefenderChangeKind = "SUBSTITUTED" | "REDIRECTED";

/** Board/panel copy for a substitution, given the two fighters' display names.
 *  One function so the tag, the chip and the log line can never disagree. */
export function defenderSwapText(
  fromName: string,
  toName: string,
  kind: DefenderChangeKind = "SUBSTITUTED"
) {
  if (kind === "REDIRECTED") {
    return {
      /** compact chip on the board token */
      chip: "now defending",
      /** combat-panel tag */
      tag: `NOW DEFENDING: ${toName.toUpperCase()}`,
      /** hover title / aria label */
      full: `${toName} is defending this attack — it was redirected away from ${fromName}, so the damage lands on ${toName}`,
    };
  }
  return {
    chip: "defends instead",
    tag: `${toName.toUpperCase()} DEFENDS INSTEAD`,
    /** hover title / aria label, and the log line's wording */
    full: `${toName} takes ${fromName}'s place as the defender — the damage lands on ${toName}`,
  };
}

// ---------------------------------------------------------------------------
// The DECLARED target (issue #694) — the other half of the same question.
// ---------------------------------------------------------------------------

/**
 * WHAT THIS ADDS OVER `COMBAT_DEFENDER_CHANGED`. The event above is the client's
 * only signal for a substitution INSIDE one combat. It is not the only way the
 * fighter eating an attack ends up different from the one the attacker picked:
 * General Grievous's *Multi-Arm Barrage* commits a second attack face down during
 * Combat 1 and only chooses its target at COMMIT time, after the LUNGE placement
 * — so Combat 2 arrives as a WHOLE NEW combat (`BONUS_ATTACK_STARTED`) against
 * somebody the player never declared against. No defender ever "changed": the
 * second combat simply opened somewhere else, so nothing on the v34 path fires
 * and, before this module, nothing on screen said the attack had moved (Discord
 * bug report, 2026-08-23 — "nothing is rly showing that").
 *
 * The generic statement of the whole family is therefore NOT "an event told us"
 * but: **the live combat's target is not the target this attacker declared**.
 * That is derivable from the view plus the events that OPEN a combat, it is a
 * standing fact rather than a one-frame beat (so it holds for the whole combat,
 * through reveals and the damage step), and it covers the substitution case too —
 * `combat.target` moves off the declared fighter there as well.
 *
 * Deliberately keyed on the ATTACKER: a droid's sub-attack ("Fire, you fools!")
 * and an effect-initiated attack (Boba's SEISMIC CHARGE) open combats that were
 * never declared by anybody, and calling those "redirected" would be a lie.
 */
export interface CombatTargeting {
  /** the fighter the attacker DECLARED this attack action against, held across the
   *  bonus attacks that action spawns. Null when nothing has been declared. */
  declared: FighterId | null;
  /** whose declaration `declared` is. A combat by anybody else makes no claim. */
  attacker: FighterId | null;
}

export const EMPTY_COMBAT_TARGETING: CombatTargeting = { declared: null, attacker: null };

/**
 * Fold one STATE batch's events into the running declaration. Pure; the page holds
 * the value across batches (the declaration is made in Combat 1's batch and read in
 * Combat 2's, which can be a different broadcast entirely).
 *
 * - `ATTACK_DECLARED` is the declaration itself.
 * - `SUB_ATTACK_INITIATED` / `EFFECT_ATTACK_INITIATED` open a combat that nobody
 *   declared, so they REPLACE the declaration with their own target — that combat
 *   is on-target by definition and must never wear a redirect tag.
 * - `BONUS_ATTACK_STARTED` KEEPS the standing declaration when it is the same
 *   attacker's (that is the Grievous case, and the whole point), and otherwise
 *   falls back to its own target rather than inventing provenance.
 * - `TURN_ENDED` clears it: an attack action cannot outlive its turn, and a stale
 *   declaration must never colour next turn's combat.
 */
export function advanceCombatTargeting(prev: CombatTargeting, events: GameEvent[]): CombatTargeting {
  let cur = prev;
  for (const e of events) {
    switch (e.type) {
      case "ATTACK_DECLARED":
      case "SUB_ATTACK_INITIATED":
      case "EFFECT_ATTACK_INITIATED":
        cur = { declared: e.target, attacker: e.attacker };
        break;
      case "BONUS_ATTACK_STARTED":
        if (cur.attacker !== e.attacker) cur = { declared: e.target, attacker: e.attacker };
        break;
      case "TURN_ENDED":
        cur = EMPTY_COMBAT_TARGETING;
        break;
      default:
        break;
    }
  }
  return cur;
}

/**
 * The standing "this is not who was attacked" fact for `combat`, or null when the
 * defender IS the declared target (the overwhelmingly common case) — or when the
 * client cannot honestly say (a reconnect mid-combat carries no events, so there is
 * no declaration to compare against, and silence is better than a guess).
 *
 * Takes a `ViewCombat` rather than the whole view so the caller can ask it of the
 * combat it is actually RENDERING — the panel keeps a frozen combat on screen
 * through the strike beat, which is the frame the damage lands in and precisely
 * when "who is taking this?" is being asked.
 */
export function defenderRedirect(
  targeting: CombatTargeting,
  combat: ViewCombat | null | undefined
): DefenderChange | null {
  if (!combat || !targeting.declared) return null;
  if (targeting.attacker !== combat.attacker) return null;
  if (targeting.declared === combat.target) return null;
  return { from: targeting.declared, to: combat.target };
}
