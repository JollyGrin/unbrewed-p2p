/**
 * Combat-outcome presentation — ONE source of truth for the words every surface
 * puts on a `CombatOutcome` (issue #545, engine #303 "The Doppelgänger").
 *
 * The protocol's outcome has always been TERNARY (`ATTACKER_WON` /
 * `DEFENDER_WON` / `UNKNOWN`), but until the Doppelgänger no shipped deck could
 * emit `UNKNOWN`: the engine defaults a value tie to `DEFENDER_WON`, and the
 * third branch is reachable only through a `HeroDef.outcomeResolver`
 * (engine/combat.ts `applyResolver`). So every client surface treated UNKNOWN as
 * dead — and each did so DIFFERENTLY, all three of them wrong once a real
 * no-winner combat arrives:
 *
 *  - the combat-panel result banner suppressed the line entirely (silent resolve);
 *  - the log line printed the raw enum lowercased ("unknown — 0 damage");
 *  - the replay scrubber did the same.
 *
 * None of them rendered a defender win, which was the audit's main worry — but
 * "nothing happened" is not an outcome either. UNKNOWN now has explicit words on
 * every surface, taken from here so the banner, the log and the scrubber can
 * never drift apart again.
 *
 * NOTE on the "unresolved" sentinel: an in-flight combat carries
 * `ViewCombat.outcome === null` (engine/combat.ts sets `outcome: null` when the
 * combat is created), NEVER `'UNKNOWN'`. Client code that tested
 * `outcome !== 'UNKNOWN'` to mean "resolved" was reading the wrong sentinel; see
 * combatStrike.ts / fxEvents.ts, both corrected alongside this module.
 */
import { CombatOutcome } from "./protocol";

/** Human-readable banner/label wording — never the raw enum. */
export const COMBAT_OUTCOME_LABEL: Record<CombatOutcome, string> = {
  ATTACKER_WON: "Attacker wins",
  DEFENDER_WON: "Defender wins",
  UNKNOWN: "No winner",
};

/**
 * Log-line wording (lower case, past tense — the game log's register). The two
 * decided outcomes keep the exact text the log has always produced
 * (`outcome.replace(/_/g, " ").toLowerCase()`) so existing transcripts and CSV
 * exports read unchanged; only UNKNOWN gains real words in place of "unknown".
 */
export const COMBAT_OUTCOME_LOG_TEXT: Record<CombatOutcome, string> = {
  ATTACKER_WON: "attacker won",
  DEFENDER_WON: "defender won",
  UNKNOWN: "no winner",
};

/** True for the ternary branch with no victor — the Doppelgänger's whole deck. */
export const isNoWinner = (outcome: CombatOutcome | null | undefined): boolean =>
  outcome === "UNKNOWN";

/**
 * The full combat-result log line: `"attacker won — 3 damage"`, or
 * `"no winner — the values matched"` for a stalemate. A no-winner combat deals no
 * attack damage by construction (the engine's only resolver, `valuesEqualUnknown`,
 * fires on `effectiveAttack === effectiveDefense`), so "— 0 damage" would be noise
 * where the REASON is the interesting part.
 */
export const combatOutcomeLogText = (
  outcome: CombatOutcome,
  damage: number | null
): string => {
  if (isNoWinner(outcome)) return `${COMBAT_OUTCOME_LOG_TEXT.UNKNOWN} — the values matched`;
  return `${COMBAT_OUTCOME_LOG_TEXT[outcome]}${damage !== null ? ` — ${damage} damage` : ""}`;
};

/**
 * The result-banner text (combat panel + replay scrubber). Same reasoning as the
 * log line: the damage suffix is dropped for a no-winner resolve.
 */
export const combatOutcomeBannerText = (
  outcome: CombatOutcome,
  damage: number | null
): string => {
  if (isNoWinner(outcome)) return COMBAT_OUTCOME_LABEL.UNKNOWN;
  return `${COMBAT_OUTCOME_LABEL[outcome]}${damage !== null ? ` · ${damage} dmg` : ""}`;
};

/**
 * The floating board callout for a combat that resolved dealing zero damage. A
 * defender win is a BLOCK (the defense held); a no-winner resolve is neither
 * side holding anything, so it gets its own word rather than borrowing the
 * defender's. Both use the same neutral steel FX color, so this is the only thing
 * distinguishing them on the board.
 */
export const combatZeroDamageCallout = (noWinner: boolean): string =>
  noWinner ? "NO WINNER" : "BLOCKED";
