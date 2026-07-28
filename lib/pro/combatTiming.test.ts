import {
  ARC_FLIGHT_MS,
  ARC_LAUNCH_MS,
  DAMAGE_BEAT_MS,
  LINGER_TTL_MS,
  SETTLE_DWELL_MS,
  STRIKE_POSE_SLACK_MS,
  STRIKE_TTL_MS,
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
