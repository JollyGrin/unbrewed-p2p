/**
 * "Combat pace" — player feedback after a Pro match: the combat animations and
 * the "what just happened" beats are too fast to read. This module is the one
 * pure piece of the feature: the pace options a player can pick, and a
 * `scale()` helper that turns a duration into its paced equivalent.
 *
 * Deliberately just a multiplier, not new timing numbers. Every module that
 * owns a piece of the combat sequence's clock (combatTiming.ts, combatFx.ts's
 * reveal stagger, battleTimeline.ts's lead cap, useGameFx.ts's board-FX life)
 * keeps deriving its own values exactly as it does today — see the #517
 * invariant in combatTiming.ts — and only multiplies its inputs by this
 * factor. Pace never mutates an exported constant.
 */

export type Pace = "normal" | "relaxed" | "slow";

export interface PaceOption {
  id: Pace;
  /** English UI label — the app carries no i18n, so every surface (desktop
   *  chip, mobile menu item) renders this string verbatim. */
  label: string;
  /** Multiplier applied to every leg of the combat sequence's clock. 1 = the
   *  pace the game shipped with before this feature. */
  factor: number;
}

/** Normal (today's pace) plus two slower steps. Ordered — `nextPace` cycles
 *  through this array, wrapping back to the front. */
export const PACE_OPTIONS: readonly PaceOption[] = [
  { id: "normal", label: "Normal", factor: 1 },
  { id: "relaxed", label: "Relaxed", factor: 1.5 },
  { id: "slow", label: "Slow", factor: 2 },
];

export const DEFAULT_PACE: Pace = "normal";

const OPTION_BY_ID: Record<Pace, PaceOption> = Object.fromEntries(
  PACE_OPTIONS.map((option) => [option.id, option])
) as Record<Pace, PaceOption>;

/** True for any string that names a real pace — the guard a stored/URL value
 *  must pass before it is trusted (an older build or a hand-edited
 *  localStorage entry must fall back, never throw). */
export function isPace(value: string): value is Pace {
  return value in OPTION_BY_ID;
}

export function paceOption(pace: Pace): PaceOption {
  return OPTION_BY_ID[pace];
}

/** The multiplier for a pace — 1 for Normal, >1 for anything slower. */
export function paceFactor(pace: Pace): number {
  return OPTION_BY_ID[pace].factor;
}

/** Scale a duration (ms) by the pace's factor, rounded to a whole ms — the
 *  helper every timing module multiplies its own constants by. */
export function scale(ms: number, pace: Pace): number {
  return Math.round(ms * paceFactor(pace));
}

/** The option that follows `pace` in `PACE_OPTIONS`, wrapping back to the
 *  front — backs the one-tap cycling control in the HUD (desktop chip +
 *  mobile menu item), so there is nothing to pick from, only to tap through. */
export function nextPace(pace: Pace): Pace {
  const index = PACE_OPTIONS.findIndex((option) => option.id === pace);
  const at = index === -1 ? 0 : index;
  return PACE_OPTIONS[(at + 1) % PACE_OPTIONS.length].id;
}
