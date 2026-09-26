/**
 * CSS animation durations/delays for the combat sequence (issue: player feedback
 * after Combat pace shipped — "make the animation itself slow enough to read the
 * card, without having to change a setting first"). Sibling to combatTiming.ts,
 * which derives the JS-side linger/hold clock (when the panel unmounts); THIS
 * module derives the durations the CSS keyframes/transitions in pages/pro/game.tsx
 * actually play at. The two clocks are related but distinct: combatTiming.ts only
 * ever stretched how long the panel stayed mounted, so before this module a slower
 * pace held the pose longer without the strike/flip/chip motion itself taking any
 * longer to play — exactly the "just its dwell" complaint.
 *
 * Base constants below are the 1× (today's) values — moved here verbatim from
 * game.tsx, byte-identical, so `scaledCombatAnimTiming(1)` reproduces exactly what
 * shipped before Combat pace. Every derived value (contact delay, compare delay) is
 * computed the SAME WAY at every factor — summed from already-scaled legs, never
 * hand-tuned against a target — so the sequence stays internally coherent (attack
 * lunge still arrives exactly as the defense reacts) at any pace.
 */

/** The two-layer card flip's CSS transition duration (commit → reveal). */
export const FLIP_TRANSITION_DUR = 0.55;
/** The defense slot's flip starts a beat after the attack's (staggered reveal). */
export const DEFENSE_FLIP_DELAY = 0.18;

/** Wind-up before the lunge — the defender's flip delay + the flip itself + a beat. */
export const STRIKE_DELAY = 0.85;
/** The attack card's lunge/recoil. */
export const STRIKE_LUNGE_DUR = 0.68;
/** The defense card's knockback/brace/shove. */
export const STRIKE_REACT_DUR = 0.68;
/** The panel shake at the contact moment. */
export const STRIKE_SHAKE_DUR = 0.4;
/** The impact/shield ring flashed at contact. */
export const STRIKE_RING_DUR = 0.5;

/** Chip on-screen lifetime — matches CHIP_TTL_MS in combatValueFx.ts (both scaled
 *  by the same factor) so the fly-in + fade covers exactly the window the hook
 *  keeps the chip mounted. */
export const CHIP_FLY_DUR = 0.9;

/** The pill's per-tick pop when the count-up steps (no comparison pulse active). */
export const VALUE_TICK_DUR = 0.28;

/** Comparison pulse durations, keyed by CompareBeat (combatStrike.ts). */
export const COMPARE_DUR = { gold: 1.1, dim: 1.0, neutral: 1.0 } as const;

/** Every duration/delay the combat sequence's CSS reads, scaled by the player's
 *  pace factor (lib/pro/pace.ts, 1 = today's pace). */
export interface CombatAnimTiming {
  flipTransitionDur: number;
  defenseFlipDelay: number;
  strikeDelay: number;
  strikeLungeDur: number;
  strikeReactDur: number;
  /** The defense reaction begins as the attack arrives (~55% through the lunge). */
  strikeContactDelay: number;
  strikeShakeDur: number;
  strikeRingDur: number;
  chipFlyDur: number;
  valueTickDur: number;
  /** Comparison beat begins just after the strike lands. */
  compareDelay: number;
  compareDur: { gold: number; dim: number; neutral: number };
}

/**
 * Derive the whole combat-animation clock at `factor`. Every leg is `BASE * factor`;
 * every derived value (strikeContactDelay, compareDelay) is summed from ALREADY
 * scaled legs, exactly like scaledCombatTiming in combatTiming.ts — so the derived
 * relationships (contact lands mid-lunge, compare starts just after contact) hold at
 * every factor by construction, not by re-tuning a magic offset per pace.
 */
export function scaledCombatAnimTiming(factor: number): CombatAnimTiming {
  const strikeDelay = STRIKE_DELAY * factor;
  const strikeLungeDur = STRIKE_LUNGE_DUR * factor;
  const strikeContactDelay = strikeDelay + strikeLungeDur * 0.44;
  return {
    flipTransitionDur: FLIP_TRANSITION_DUR * factor,
    defenseFlipDelay: DEFENSE_FLIP_DELAY * factor,
    strikeDelay,
    strikeLungeDur,
    strikeReactDur: STRIKE_REACT_DUR * factor,
    strikeContactDelay,
    strikeShakeDur: STRIKE_SHAKE_DUR * factor,
    strikeRingDur: STRIKE_RING_DUR * factor,
    chipFlyDur: CHIP_FLY_DUR * factor,
    valueTickDur: VALUE_TICK_DUR * factor,
    compareDelay: strikeContactDelay + 0.15 * factor,
    compareDur: {
      gold: COMPARE_DUR.gold * factor,
      dim: COMPARE_DUR.dim * factor,
      neutral: COMPARE_DUR.neutral * factor,
    },
  };
}
