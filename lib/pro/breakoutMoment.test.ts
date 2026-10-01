import { breakoutInBatch, breakoutMoment, pushedOverBy } from "./breakoutMoment";
import type { GameEvent, PlayerView } from "./protocol";

const overflow = (n: number): GameEvent => ({ type: "THREAT_OVERFLOW", overflows: n, objective: null });
const opened: GameEvent = { type: "SPACE_OPENED", space: "s3" };
const spawn: GameEvent = { type: "ENEMY_SPAWNED", fighter: "e1", enemyId: "raptor", card: "raptor-1" };

const view = (extra: Record<string, unknown> = {}) =>
  ({
    winner: null,
    map: {
      spaces: [{ id: "s3", startsBlocked: true }, { id: "s4", startsBlocked: true }, { id: "s5" }],
      scenario: { groups: [{ id: "enclosures", spaces: ["s3", "s4"], kind: "CONTAINS", order: [2, 5] }] },
    },
    blockedSpaces: ["s4"],
    tokens: [{ id: "t", kind: "marker", owner: "p1", space: "s3", identity: "dilophosaurus" }],
    fighters: [{ id: "e1", name: "Raptor", hp: 5, maxHp: 5, size: "NORMAL", enemy: { role: "MINION", move: 4 } }],
    scenario: { threat: { position: 0, level: 0, overflows: 1, positions: [] }, objectives: [] },
    ...extra,
  }) as unknown as PlayerView;

describe("breakoutInBatch", () => {
  it("overflow alone is no breakout", () => {
    expect(breakoutInBatch([overflow(1)])).toBeNull();
  });
  it("overflow + open + spawn", () => {
    expect(breakoutInBatch([overflow(2), opened, spawn])).toEqual({
      overflows: 2,
      space: "s3",
      spawn: { fighter: "e1", enemyId: "raptor", card: "raptor-1" },
    });
  });
  it("overflow + open without a spawn still counts", () => {
    expect(breakoutInBatch([overflow(1), opened])?.spawn).toBeNull();
  });
  it("spawn or open outside an overflow is not a breakout", () => {
    expect(breakoutInBatch([spawn])).toBeNull();
    expect(breakoutInBatch([opened, spawn])).toBeNull();
    expect(breakoutInBatch([opened, overflow(1)])).toBeNull();
  });
});

describe("breakoutMoment", () => {
  it("assembles the interstitial", () => {
    const m = breakoutMoment([overflow(1), opened, spawn], null, view())!;
    expect(m).toMatchObject({ enclosure: 2, marker: "dilophosaurus", lost: 1, total: 4, pushedBy: null });
    expect(m.enemy).toMatchObject({ name: "Raptor", hp: 5, move: 4, joinsDeck: true });
  });
  it("hands the 4th breakout to the end screen", () => {
    expect(breakoutMoment([overflow(4), opened, spawn], null, view())).toBeNull();
    expect(breakoutMoment([overflow(1), opened, spawn], null, view({ winner: "p1" }))).toBeNull();
  });
  it("is null for non-adventure views", () => {
    expect(breakoutMoment([overflow(1), opened], null, view({ scenario: undefined }))).toBeNull();
  });
  it("names what pushed the track over from the bySource delta", () => {
    const t = (b: Record<string, number>) => view({ scenario: { threat: { bySource: b } } });
    expect(pushedOverBy(t({ raptor: 1 }), t({ raptor: 1, hunt: 3 }))).toBe("hunt");
    expect(pushedOverBy(t({}), view())).toBeNull();
  });
});
