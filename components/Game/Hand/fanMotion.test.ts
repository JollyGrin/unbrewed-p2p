import {
  FOCUS_IN,
  FOLLOW,
  MAX_SWAY,
  pickFocus,
  riseFor,
  settled,
  spreadFor,
  stepSpring,
  swayFor,
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
