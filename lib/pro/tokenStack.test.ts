/**
 * Co-located token layout (issue #553, protocol v28 — the SMALL fighter class).
 *
 * The load-bearing property is CLICKABILITY: before v28 five tokens on one space
 * were drawn ~5.6px apart at ~55px wide, so four of them were physically
 * unreachable by mouse. These pin that every occupant gets a distinct position, at
 * a spread that survives any board size, while the single-occupant case — every
 * pre-v28 board — is byte-for-byte centred as before.
 */
import {
  objectStackOffsets,
  ringOffsets,
  RING_RADIUS_PCT,
  SCALE_BY_SIZE,
  SMALL_PER_SPACE_CAP,
  stackLayout,
  StackOccupant,
} from "./tokenStack";

const small = (key: string): StackOccupant => ({ key, size: "SMALL" });
const normal = (key: string): StackOccupant => ({ key, size: "NORMAL" });
const large = (key: string): StackOccupant => ({ key, size: "LARGE" });

const dist = (a: { dx: number; dy: number }, b: { dx: number; dy: number }) =>
  Math.hypot(a.dx - b.dx, a.dy - b.dy);

describe("ringOffsets", () => {
  it("centres a lone point — a single token is never nudged off its space", () => {
    expect(ringOffsets(1, 46)).toEqual([{ dx: 0, dy: 0 }]);
    expect(ringOffsets(0, 46)).toEqual([]);
  });

  it("starts at 12 o'clock and spaces points evenly on the circle", () => {
    const four = ringOffsets(4, 100);
    expect(four[0]).toEqual({ dx: 0, dy: -100 }); // top
    expect(four[1]).toEqual({ dx: 100, dy: 0 }); // right (clockwise)
    expect(four[2]).toEqual({ dx: 0, dy: 100 }); // bottom
    expect(four[3]).toEqual({ dx: -100, dy: 0 }); // left
  });

  it("keeps every point on the ring radius", () => {
    for (const p of ringOffsets(5, 46)) {
      expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(46, 1);
    }
  });
});

describe("stackLayout — sizing", () => {
  it("draws a SMALL fighter small even when it is alone (size is the fighter's, not the crowd's)", () => {
    expect(stackLayout([small("larry")]).get("larry")).toEqual({
      dx: 0,
      dy: 0,
      scale: SCALE_BY_SIZE.SMALL,
      order: 0,
    });
    expect(SCALE_BY_SIZE.SMALL).toBeLessThan(SCALE_BY_SIZE.NORMAL);
  });

  it("leaves a lone NORMAL fighter exactly where every pre-v28 board drew it", () => {
    expect(stackLayout([normal("hero")]).get("hero")).toEqual({
      dx: 0,
      dy: 0,
      scale: 0.82, // the literal pre-v28 constant
      order: 0,
    });
  });
});

describe("stackLayout — the v28 crowd", () => {
  it("gives all five of (4 smalls + 1 non-small) a DISTINCT position", () => {
    const layout = stackLayout([
      normal("kong"),
      ...Array.from({ length: SMALL_PER_SPACE_CAP }, (_, i) => small(`larry-${i}`)),
    ]);
    expect(layout.size).toBe(5);
    const seen = [...layout.values()].map((v) => `${v.dx},${v.dy}`);
    expect(new Set(seen).size).toBe(5); // no two tokens drawn on top of each other
  });

  it("keeps the non-small centred and rings the smalls around it", () => {
    const layout = stackLayout([normal("kong"), small("a"), small("b"), small("c"), small("d")]);
    expect(layout.get("kong")).toMatchObject({ dx: 0, dy: 0, scale: SCALE_BY_SIZE.NORMAL });
    for (const key of ["a", "b", "c", "d"]) {
      const slot = layout.get(key)!;
      expect(slot.scale).toBe(SCALE_BY_SIZE.SMALL);
      expect(Math.hypot(slot.dx, slot.dy)).toBeCloseTo(RING_RADIUS_PCT, 1);
    }
  });

  it("renders the big body FIRST so the smalls standing on it draw in front", () => {
    const layout = stackLayout([small("a"), normal("kong"), small("b")]);
    expect(layout.get("kong")!.order).toBeLessThan(layout.get("a")!.order);
    expect(layout.get("kong")!.order).toBeLessThan(layout.get("b")!.order);
  });

  it("steps a LONE small off centre when it shares with a big — else it hides inside it", () => {
    const layout = stackLayout([large("kong"), small("larry")]);
    const larry = layout.get("larry")!;
    expect(larry.dx === 0 && larry.dy === 0).toBe(false);
    expect(Math.hypot(larry.dx, larry.dy)).toBeCloseTo(RING_RADIUS_PCT, 1);
  });

  it("separates adjacent smalls by roughly a token width, so each keeps a click target", () => {
    const layout = stackLayout([small("a"), small("b"), small("c"), small("d")]);
    const pts = ["a", "b", "c", "d"].map((k) => layout.get(k)!);
    // neighbours on a 4-ring are radius*sqrt(2) apart; as a fraction of the token's
    // own width that must stay near 1 or the tokens overlap into one hit area.
    expect(dist(pts[0], pts[1]) / 100).toBeGreaterThan(0.6);
  });

  it("rings even two non-smalls rather than hiding one — a server bug must be VISIBLE", () => {
    // The engine permits at most one non-small per space; the client does not
    // trust that, because silently drawing them on top of each other would hide
    // the violation instead of showing it.
    const layout = stackLayout([normal("a"), normal("b")]);
    expect(layout.get("a")).not.toMatchObject({ dx: layout.get("b")!.dx, dy: layout.get("b")!.dy });
  });

  it("is stable: the same occupant order yields the same slots", () => {
    const occupants = [normal("kong"), small("a"), small("b")];
    expect(stackLayout(occupants)).toEqual(stackLayout(occupants));
  });

  it("returns an empty layout for an empty space", () => {
    expect(stackLayout([]).size).toBe(0);
  });
});

describe("objectStackOffsets", () => {
  it("centres a lone corpse and rings a stack of them", () => {
    expect(objectStackOffsets(1)).toEqual([{ dx: 0, dy: 0 }]);
    const four = objectStackOffsets(4);
    expect(new Set(four.map((o) => `${o.dx},${o.dy}`)).size).toBe(4);
  });
});
