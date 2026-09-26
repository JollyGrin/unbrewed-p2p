import {
  CHIP_FLY_DUR,
  COMPARE_DUR,
  DEFENSE_FLIP_DELAY,
  FLIP_TRANSITION_DUR,
  STRIKE_DELAY,
  STRIKE_LUNGE_DUR,
  STRIKE_REACT_DUR,
  STRIKE_RING_DUR,
  STRIKE_SHAKE_DUR,
  VALUE_TICK_DUR,
  scaledCombatAnimTiming,
} from "./combatAnimTiming";

/**
 * Player feedback after Combat pace shipped: the strike/flip/chip animations
 * themselves stayed at 1× while only the panel's dwell (combatTiming.ts) stretched.
 * These tests guard the fix — every leg genuinely lengthens at a slower pace, the
 * base constants (1× / today's pace) are untouched, and the derived beats (contact,
 * compare) stay correctly sequenced relative to the legs they ride on, at any factor.
 */
describe("scaledCombatAnimTiming", () => {
  it("is the identity at factor 1 — exactly today's shipped durations", () => {
    const t = scaledCombatAnimTiming(1);
    expect(t.flipTransitionDur).toBe(FLIP_TRANSITION_DUR);
    expect(t.defenseFlipDelay).toBe(DEFENSE_FLIP_DELAY);
    expect(t.strikeDelay).toBe(STRIKE_DELAY);
    expect(t.strikeLungeDur).toBe(STRIKE_LUNGE_DUR);
    expect(t.strikeReactDur).toBe(STRIKE_REACT_DUR);
    expect(t.strikeShakeDur).toBe(STRIKE_SHAKE_DUR);
    expect(t.strikeRingDur).toBe(STRIKE_RING_DUR);
    expect(t.chipFlyDur).toBe(CHIP_FLY_DUR);
    expect(t.valueTickDur).toBe(VALUE_TICK_DUR);
    expect(t.compareDur).toEqual(COMPARE_DUR);
    // Derived from the 1× legs, same formula the module-scope constants in
    // game.tsx used before this module existed.
    expect(t.strikeContactDelay).toBeCloseTo(STRIKE_DELAY + STRIKE_LUNGE_DUR * 0.44, 10);
    expect(t.compareDelay).toBeCloseTo(t.strikeContactDelay + 0.15, 10);
  });

  it("actually slows down: every leg at a slower pace is strictly longer", () => {
    const normal = scaledCombatAnimTiming(1);
    const slow = scaledCombatAnimTiming(2);
    expect(slow.flipTransitionDur).toBeGreaterThan(normal.flipTransitionDur);
    expect(slow.defenseFlipDelay).toBeGreaterThan(normal.defenseFlipDelay);
    expect(slow.strikeDelay).toBeGreaterThan(normal.strikeDelay);
    expect(slow.strikeLungeDur).toBeGreaterThan(normal.strikeLungeDur);
    expect(slow.strikeReactDur).toBeGreaterThan(normal.strikeReactDur);
    expect(slow.strikeContactDelay).toBeGreaterThan(normal.strikeContactDelay);
    expect(slow.strikeShakeDur).toBeGreaterThan(normal.strikeShakeDur);
    expect(slow.strikeRingDur).toBeGreaterThan(normal.strikeRingDur);
    expect(slow.chipFlyDur).toBeGreaterThan(normal.chipFlyDur);
    expect(slow.valueTickDur).toBeGreaterThan(normal.valueTickDur);
    expect(slow.compareDelay).toBeGreaterThan(normal.compareDelay);
    expect(slow.compareDur.gold).toBeGreaterThan(normal.compareDur.gold);
    expect(slow.compareDur.dim).toBeGreaterThan(normal.compareDur.dim);
    expect(slow.compareDur.neutral).toBeGreaterThan(normal.compareDur.neutral);
  });

  it("scales every leg proportionally to the factor", () => {
    for (const factor of [1, 1.5, 2, 3]) {
      const t = scaledCombatAnimTiming(factor);
      expect(t.flipTransitionDur).toBeCloseTo(FLIP_TRANSITION_DUR * factor, 10);
      expect(t.strikeLungeDur).toBeCloseTo(STRIKE_LUNGE_DUR * factor, 10);
      expect(t.strikeReactDur).toBeCloseTo(STRIKE_REACT_DUR * factor, 10);
      expect(t.chipFlyDur).toBeCloseTo(CHIP_FLY_DUR * factor, 10);
    }
  });

  it("keeps the contact beat landing mid-lunge, at every factor (55% through, per the lunge keyframes)", () => {
    for (const factor of [1, 1.5, 2]) {
      const t = scaledCombatAnimTiming(factor);
      // strikeContactDelay is strikeDelay + 44% of the lunge — must stay strictly
      // between the lunge's start and its end, so the defense reacts DURING the
      // attack's travel, never before it starts or after it's back home.
      expect(t.strikeContactDelay).toBeGreaterThan(t.strikeDelay);
      expect(t.strikeContactDelay).toBeLessThan(t.strikeDelay + t.strikeLungeDur);
    }
  });

  it("keeps the compare beat starting after strike contact, at every factor", () => {
    for (const factor of [1, 1.5, 2]) {
      const t = scaledCombatAnimTiming(factor);
      expect(t.compareDelay).toBeGreaterThan(t.strikeContactDelay);
    }
  });

  it("never speeds anything up for factor > 1", () => {
    const t = scaledCombatAnimTiming(1.5);
    expect(t.flipTransitionDur).toBeGreaterThanOrEqual(FLIP_TRANSITION_DUR);
    expect(t.strikeDelay).toBeGreaterThanOrEqual(STRIKE_DELAY);
    expect(t.chipFlyDur).toBeGreaterThanOrEqual(CHIP_FLY_DUR);
  });
});
