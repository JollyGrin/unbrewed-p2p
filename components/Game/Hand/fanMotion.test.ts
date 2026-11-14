import {
  FOCUS_IN,
  FOLLOW,
  MAX_ARRIVALS,
  MAX_SWAY,
  arrivalStart,
  ghostScaleOnBoard,
  handArrivals,
  motionAllowed,
  pickFocus,
  riseFor,
  settled,
  spreadFor,
  stepSpring,
  swayFor,
  toSlotFrame,
} from "./fanMotion";

const W = 150;

/** Run a spring at 60fps; returns [ms until within 5% of target, max value]. */
const run = (cfg = FOCUS_IN, target = 1) => {
  let x = 0;
  let v = 0;
  let reached = -1;
  let max = 0;
  for (let frame = 1; frame <= 120; frame++) {
    [x, v] = stepSpring(x, v, target, 1 / 60, cfg);
    max = Math.max(max, x);
    if (reached < 0 && Math.abs(target - x) < 0.05 * target)
      reached = (frame * 1000) / 60;
  }
  return { reached, max, x, v };
};

describe("stepSpring", () => {
  it("reveals the hovered card quickly and settles without overshoot", () => {
    const { reached, max, x, v } = run(FOCUS_IN);
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThanOrEqual(200);
    expect(max).toBeLessThanOrEqual(1.0001);
    expect(settled(x, v, 1)).toBe(true);
  });

  it("is ease-out: most of the travel happens in the first frames", () => {
    let x = 0;
    let v = 0;
    for (let i = 0; i < 4; i++) [x, v] = stepSpring(x, v, 1, 1 / 60, FOCUS_IN);
    expect(x).toBeGreaterThan(0.6); // >60% done after ~67ms
  });

  it("stays stable when a frame is long (tab was hidden)", () => {
    const [x] = stepSpring(0, 0, 1, 2, FOLLOW);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x)).toBeLessThan(2);
  });
});

describe("pickFocus", () => {
  const spacing = 100;
  const centre = (i: number) => i * spacing + W / 2;

  it("focuses the card whose centre is nearest the cursor", () => {
    expect(pickFocus(centre(0), 5, spacing, W, null)).toBe(0);
    expect(pickFocus(centre(3) + 20, 5, spacing, W, null)).toBe(3);
    expect(pickFocus(-50, 5, spacing, W, null)).toBe(0);
    expect(pickFocus(9999, 5, spacing, W, null)).toBe(4);
  });

  it("holds the current card across a shared edge (hysteresis)", () => {
    const edge = (centre(1) + centre(2)) / 2;
    expect(pickFocus(edge + 2, 5, spacing, W, 1)).toBe(1);
    expect(pickFocus(edge + 20, 5, spacing, W, 1)).toBe(2);
  });

  it("drops a focus index that is past the end of a shrunk hand", () => {
    expect(pickFocus(centre(1), 2, spacing, W, 4)).toBe(1);
  });
});

describe("spreadFor / riseFor", () => {
  it("pushes neighbours away from the focused card, fading with distance", () => {
    const s = (i: number) => spreadFor(i, 2, 80, W);
    expect(s(2)).toBe(0);
    expect(s(1)).toBeLessThan(0);
    expect(s(3)).toBeGreaterThan(0);
    expect(Math.abs(s(0))).toBeLessThan(Math.abs(s(1)));
    expect(spreadFor(1, null, 80, W)).toBe(0);
  });

  it("raises cards by their distance to the cursor", () => {
    const x = 1 * 100 + W / 2;
    expect(riseFor(1, x, 100, W)).toBeGreaterThan(riseFor(3, x, 100, W));
    expect(riseFor(1, null, 100, W)).toBe(0);
  });
});

describe("swayFor", () => {
  it("leans the dragged card with its speed, capped", () => {
    expect(swayFor(0)).toBe(0);
    expect(swayFor(500)).toBeGreaterThan(0);
    expect(swayFor(-500)).toBeLessThan(0);
    expect(swayFor(1e6)).toBe(MAX_SWAY);
  });
});

describe("handArrivals", () => {
  const c = (title: string) => ({ title, type: "attack", value: 3, boost: 1 });

  it("finds the card that was added, by what it is rather than by identity", () => {
    const prev = [c("A"), c("B")];
    // a hand that came over the wire: all new objects
    expect(handArrivals(prev, [c("A"), c("B"), c("C")])).toEqual([2]);
  });

  it("picks the later copy when the new card duplicates one in hand", () => {
    expect(handArrivals([c("A"), c("B")], [c("A"), c("B"), c("A")])).toEqual([
      2,
    ]);
  });

  it("is empty for the deal, a rejoin, a shrinking hand and a big batch", () => {
    expect(handArrivals(undefined, [c("A")])).toEqual([]);
    expect(handArrivals([c("A"), c("B")], [c("A")])).toEqual([]);
    expect(handArrivals([c("A")], [c("A")])).toEqual([]);
    const many = Array.from({ length: MAX_ARRIVALS + 1 }, (_, i) => c(`N${i}`));
    expect(handArrivals([], many)).toEqual([]);
    expect(handArrivals([], many.slice(0, MAX_ARRIVALS))).toHaveLength(
      MAX_ARRIVALS,
    );
  });
});

describe("arrival geometry", () => {
  it("toSlotFrame undoes the slot's rotation", () => {
    expect(toSlotFrame(10, -20, 0)).toEqual({ x: 10, y: -20 });
    const p = toSlotFrame(0, -100, 90);
    // straight up on screen runs along -x of a slot turned a quarter turn
    expect(p.x).toBeCloseTo(-100);
    expect(p.y).toBeCloseTo(0);
  });

  it("starts an arriving card with its centre on the origin", () => {
    const card = { width: 143, height: 200 };
    const pivot = { x: 500, y: 800 };
    for (const rot of [0, 9, -13]) {
      const origin = { x: 60, y: 690, width: 43 };
      const s = arrivalStart(origin, pivot, rot, card);
      expect(s.scale).toBeCloseTo(43 / 143);
      // forward: screen centre = pivot + R(rot)·offset + (0, -scale·h/2)
      const a = (rot * Math.PI) / 180;
      const cx = pivot.x + s.x * Math.cos(a) - s.y * Math.sin(a);
      const cy =
        pivot.y +
        s.x * Math.sin(a) +
        s.y * Math.cos(a) -
        (s.scale * card.height) / 2;
      expect(cx).toBeCloseTo(origin.x);
      expect(cy).toBeCloseTo(origin.y);
    }
  });

  it("sizes the drag ghost to the token it becomes, at any zoom", () => {
    const face = (200 * 63) / 88;
    for (const zoom of [0.25, 0.8, 1, 4]) {
      const s = ghostScaleOnBoard(180, zoom, face);
      expect(face * s).toBeCloseTo(180 * zoom);
    }
  });
});

describe("motionAllowed", () => {
  it("is off where there is no media query to ask (jsdom, server)", () => {
    expect(motionAllowed()).toBe(false);
  });
});
