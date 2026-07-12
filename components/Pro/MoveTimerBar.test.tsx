import { act, render } from "@testing-library/react";
import {
  MoveTimerBar,
  MOVE_TIMER_URGENT_S,
  moveTimerFraction,
  moveTimerRemainingMs,
} from "./ProHud";

// The draining bar is driven off the SERVER deadline, recomputed from Date.now()
// every animation frame — so these tests pin Date.now and step requestAnimationFrame
// by hand (issue #223).

describe("moveTimerRemainingMs — server-deadline math, clamped at 0", () => {
  it("returns the gap while the deadline is in the future", () => {
    expect(moveTimerRemainingMs(1_000_000, 990_000)).toBe(10_000);
  });
  it("clamps at 0 once the deadline has passed", () => {
    expect(moveTimerRemainingMs(1_000_000, 1_005_000)).toBe(0);
  });
});

describe("moveTimerFraction — remaining fraction of the window (0–1)", () => {
  it("is 1 at the very start of the window and 0.5 halfway", () => {
    // 30s window, deadline 30s out → full; 15s out → half.
    expect(moveTimerFraction(1_030_000, 30, 1_000_000)).toBeCloseTo(1);
    expect(moveTimerFraction(1_030_000, 30, 1_015_000)).toBeCloseTo(0.5);
  });
  it("clamps to [0,1] past the deadline and before the window", () => {
    expect(moveTimerFraction(1_030_000, 30, 1_031_000)).toBe(0); // past
    expect(moveTimerFraction(1_030_000, 30, 999_000)).toBe(1); // impossibly early → cap
  });
  it("reads 0 for a non-positive window", () => {
    expect(moveTimerFraction(1_030_000, 0, 1_000_000)).toBe(0);
  });
});

describe("MoveTimerBar — non-drifting, deadline-driven bar (issue #223)", () => {
  let rafCb: FrameRequestCallback | null = null;
  beforeEach(() => {
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCb = cb;
      return 1;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => {
    rafCb = null;
    jest.restoreAllMocks();
  });
  const frame = () => act(() => rafCb?.(0));

  it("shows the true remaining time from the deadline, not a local counter (no drift)", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const { container } = render(<MoveTimerBar deadline={now + 30_000} totalSeconds={30} />);
    expect(container.textContent).toContain("0:30");

    // Jump the wall clock 25s but fire only ONE frame — a drifting counter would
    // read 0:29; reading Date.now() gives the true 0:05.
    now += 25_000;
    frame();
    expect(container.textContent).toContain("0:05");
  });

  it("clamps the readout at 0:00 once the deadline passes", () => {
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const { container } = render(<MoveTimerBar deadline={now + 2_000} totalSeconds={30} />);
    now += 10_000; // well past
    frame();
    expect(container.textContent).toContain("0:00");
  });

  it("is calm above the urgent threshold and turns urgent inside the last MOVE_TIMER_URGENT_S seconds", () => {
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    // start comfortably above the threshold → calm
    const { container } = render(
      <MoveTimerBar deadline={now + (MOVE_TIMER_URGENT_S + 5) * 1000} totalSeconds={30} />
    );
    frame();
    expect(container.querySelector('[data-urgent]')?.getAttribute("data-urgent")).toBe("false");

    // cross into the last MOVE_TIMER_URGENT_S seconds → urgent
    now += 6_000;
    frame();
    expect(container.querySelector('[data-urgent]')?.getAttribute("data-urgent")).toBe("true");
  });
});
