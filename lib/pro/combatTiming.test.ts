import {
  ARC_FLIGHT_MS,
  ARC_LAUNCH_MS,
  DAMAGE_BEAT_MS,
  LINGER_HOLD_MS,
  LINGER_TTL_MS,
  SETTLE_DWELL_MS,
  STRIKE_POSE_SLACK_MS,
  STRIKE_TTL_MS,
  scaledCombatTiming,
} from "./combatTiming";

/**
 * The #517 guard rail. The combat panel unmounting mid-arc is not a rendering bug —
 * it is two constants in two files drifting apart. These tests fail the moment the
 * panel could stop covering the damage sequence it launched.
 */
describe("combat sequence timing", () => {
  it("keeps the panel up past the damage arc landing plus the token beat and a dwell", () => {
    expect(LINGER_TTL_MS).toBeGreaterThanOrEqual(
      ARC_LAUNCH_MS + ARC_FLIGHT_MS + DAMAGE_BEAT_MS + SETTLE_DWELL_MS
    );
  });

  it("holds the strike pose until after the panel has unmounted", () => {
    expect(STRIKE_TTL_MS).toBeGreaterThan(LINGER_TTL_MS);
    expect(STRIKE_TTL_MS - LINGER_TTL_MS).toBe(STRIKE_POSE_SLACK_MS);
  });

  it("leaves a real settle dwell after the damage number has been read", () => {
    expect(SETTLE_DWELL_MS).toBeGreaterThan(0);
    expect(DAMAGE_BEAT_MS).toBeGreaterThan(0);
  });

  it("launches the arc only after the strike has landed", () => {
    // The arc leaves the panel well after the slam, never on top of it (#382 pacing).
    expect(ARC_LAUNCH_MS).toBeGreaterThan(1000);
    expect(ARC_FLIGHT_MS).toBeGreaterThan(0);
  });
});

/**
 * The combat pace feature (player feedback: combat reads too fast). Pace never
 * hand-tunes a new number — it scales the SAME legs by a factor — so these
 * tests re-check the #517 invariant at 1× (must match the base constants
 * exactly) and at a slower factor (the invariant must still hold, and the
 * panel must actually stay up longer, not merely as long).
 */
describe("scaledCombatTiming", () => {
  it("is the identity at factor 1 — the pace a player who never touches the setting sees", () => {
    const t = scaledCombatTiming(1);
    expect(t.arcLaunchMs).toBe(ARC_LAUNCH_MS);
    expect(t.arcFlightMs).toBe(ARC_FLIGHT_MS);
    expect(t.damageBeatMs).toBe(DAMAGE_BEAT_MS);
    expect(t.settleDwellMs).toBe(SETTLE_DWELL_MS);
    expect(t.lingerTtlMs).toBe(LINGER_TTL_MS);
    expect(t.lingerHoldMs).toBe(LINGER_HOLD_MS);
    expect(t.strikePoseSlackMs).toBe(STRIKE_POSE_SLACK_MS);
    expect(t.strikeTtlMs).toBe(STRIKE_TTL_MS);
  });

  it("keeps the #517 invariant at a slower pace: the panel outlives the arc + beat + dwell", () => {
    const t = scaledCombatTiming(2);
    expect(t.lingerTtlMs).toBeGreaterThanOrEqual(
      t.arcLaunchMs + t.arcFlightMs + t.damageBeatMs + t.settleDwellMs
    );
    expect(t.strikeTtlMs).toBeGreaterThan(t.lingerTtlMs);
    expect(t.strikeTtlMs - t.lingerTtlMs).toBe(t.strikePoseSlackMs);
  });

  it("actually slows down: every leg at a slower pace is longer, not just proportioned differently", () => {
    const normal = scaledCombatTiming(1);
    const slow = scaledCombatTiming(2);
    expect(slow.arcLaunchMs).toBeGreaterThan(normal.arcLaunchMs);
    expect(slow.arcFlightMs).toBeGreaterThan(normal.arcFlightMs);
    expect(slow.damageBeatMs).toBeGreaterThan(normal.damageBeatMs);
    expect(slow.settleDwellMs).toBeGreaterThan(normal.settleDwellMs);
    expect(slow.lingerTtlMs).toBeGreaterThan(normal.lingerTtlMs);
    expect(slow.lingerHoldMs).toBeGreaterThan(normal.lingerHoldMs);
  });

  it("holds the invariant at a non-integer factor too (Relaxed, 1.5×)", () => {
    const t = scaledCombatTiming(1.5);
    expect(t.lingerTtlMs).toBe(t.arcLaunchMs + t.arcFlightMs + t.damageBeatMs + t.settleDwellMs);
    expect(t.lingerHoldMs).toBe(t.arcLaunchMs + t.arcFlightMs + t.damageBeatMs);
  });
});
