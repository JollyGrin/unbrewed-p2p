/**
 * The landing animation's rules (p2p #1670): reduced motion, play once, the
 * timeline, and the count-up's value over time.
 */
import {
  EMPTY_LATCH,
  LANDING_BEAT_MS,
  LANDING_FILL_MS,
  LANDING_ROW_MS,
  LANDING_ROW_STAGGER_MS,
  LANDING_SHEEN_MS,
  countUpValue,
  landingTimeline,
  markLandingPlayed,
  motionAllowed,
  nextLatch,
  shouldPlayLanding,
} from "./earnedMotion";

const media = (reduce: boolean) => ({
  matchMedia: ((query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" })) as unknown as Window["matchMedia"],
});

describe("motionAllowed", () => {
  it("yes for a browser that does not ask for reduced motion", () => {
    expect(motionAllowed(media(false))).toBe(true);
  });

  it("no under prefers-reduced-motion: reduce", () => {
    expect(motionAllowed(media(true))).toBe(false);
  });

  it("no where there is nothing to ask: no window, no matchMedia", () => {
    expect(motionAllowed(null)).toBe(false);
    expect(motionAllowed({} as Window)).toBe(false);
  });
});

describe("play once", () => {
  it("a landing plays until it is marked, and never after", () => {
    const played = new WeakSet<object>();
    const landing = {};
    expect(shouldPlayLanding(landing, true, played)).toBe(true);
    // Asking does not use it up.
    expect(shouldPlayLanding(landing, true, played)).toBe(true);
    markLandingPlayed(landing, played);
    expect(shouldPlayLanding(landing, true, played)).toBe(false);
  });

  it("nothing plays without a landing, or where motion is not allowed", () => {
    const played = new WeakSet<object>();
    expect(shouldPlayLanding(null, true, played)).toBe(false);
    expect(shouldPlayLanding({}, false, played)).toBe(false);
  });

  it("a landing shown still (reduced motion) is used up too: it does not play later", () => {
    const played = new WeakSet<object>();
    const landing = {};
    expect(shouldPlayLanding(landing, false, played)).toBe(false);
    markLandingPlayed(landing, played);
    expect(shouldPlayLanding(landing, true, played)).toBe(false);
  });

  it("a second landing (a rematch) is its own", () => {
    const played = new WeakSet<object>();
    const first = {};
    markLandingPlayed(first, played);
    expect(shouldPlayLanding({}, true, played)).toBe(true);
  });
});

describe("the latch: one card instance's decision", () => {
  const yes = () => true;

  it("decides when the landing first appears and holds it across re-renders, even once marked", () => {
    const played = new WeakSet<object>();
    const landing = {};
    const first = nextLatch(EMPTY_LATCH, landing, yes, played);
    expect(first).toEqual({ token: landing, play: true });
    markLandingPlayed(landing, played);
    // The re-render after the mark: same latch object, still playing.
    expect(nextLatch(first, landing, yes, played)).toBe(first);
  });

  it("a fresh instance (the modal reopened) on a landing already shown does not play", () => {
    const played = new WeakSet<object>();
    const landing = {};
    markLandingPlayed(landing, played);
    expect(nextLatch(EMPTY_LATCH, landing, yes, played)).toEqual({ token: landing, play: false });
  });

  it("asks about motion only when the landing changes", () => {
    const played = new WeakSet<object>();
    const allowed = jest.fn(() => true);
    const landing = {};
    expect(nextLatch(EMPTY_LATCH, null, allowed, played)).toBe(EMPTY_LATCH);
    const latch = nextLatch(EMPTY_LATCH, landing, allowed, played);
    nextLatch(latch, landing, allowed, played);
    nextLatch(latch, landing, allowed, played);
    expect(allowed).toHaveBeenCalledTimes(1);
  });

  it("reduced motion at the landing: no play, and it stays that way", () => {
    const played = new WeakSet<object>();
    const landing = {};
    const latch = nextLatch(EMPTY_LATCH, landing, () => false, played);
    expect(latch.play).toBe(false);
    expect(nextLatch(latch, landing, yes, played)).toBe(latch);
  });

  it("back to waiting and on to a new landing: decided again", () => {
    const played = new WeakSet<object>();
    const first = {};
    let latch = nextLatch(EMPTY_LATCH, first, yes, played);
    markLandingPlayed(first, played);
    latch = nextLatch(latch, null, yes, played);
    expect(latch).toEqual({ token: null, play: false });
    expect(nextLatch(latch, {}, yes, played).play).toBe(true);
  });
});

describe("landingTimeline", () => {
  it("an ordinary landing: a beat, the fill, then the sheen and the rows", () => {
    const t = landingTimeline(false, 3);
    expect(t.wrap).toBeNull();
    expect(t.fill).toEqual({ startMs: LANDING_BEAT_MS, ms: LANDING_FILL_MS });
    // The ticket's 700–900 ms, after a short beat.
    expect(t.fill.ms).toBeGreaterThanOrEqual(700);
    expect(t.fill.ms).toBeLessThanOrEqual(900);
    expect(t.fill.startMs).toBeGreaterThan(0);
    // The figure counts in step with the fill.
    expect(t.count).toEqual(t.fill);
    const fillEnd = t.fill.startMs + t.fill.ms;
    expect(t.sheen.startMs).toBe(fillEnd);
    expect(t.rows.startMs).toBe(fillEnd);
    expect(t.rows.staggerMs).toBe(80);
    expect(t.totalMs).toBe(fillEnd + LANDING_SHEEN_MS);
  });

  it("many rows outlast the sheen: the total covers the last of them", () => {
    const t = landingTimeline(false, 8);
    expect(t.totalMs).toBe(t.rows.startMs + 7 * LANDING_ROW_STAGGER_MS + LANDING_ROW_MS);
    expect(landingTimeline(false, 0).totalMs).toBe(LANDING_BEAT_MS + LANDING_FILL_MS + LANDING_SHEEN_MS);
  });

  it("a level-up: the old bar fills and flashes first, the new fill starts at the reset", () => {
    const t = landingTimeline(true, 0);
    expect(t.wrap).not.toBeNull();
    const wrap = t.wrap!;
    expect(wrap.startMs).toBe(LANDING_BEAT_MS);
    expect(wrap.resetMs).toBe(wrap.startMs + wrap.ms + wrap.flashMs);
    expect(t.fill.startMs).toBe(wrap.resetMs);
    // The figure counts across both halves.
    expect(t.count.startMs).toBe(wrap.startMs);
    expect(t.count.startMs + t.count.ms).toBe(t.fill.startMs + t.fill.ms);
    expect(t.totalMs).toBeGreaterThan(landingTimeline(false, 0).totalMs);
  });
});

describe("countUpValue", () => {
  const count = { startMs: 250, ms: 800 };

  it("0 through the beat, the target from the end on", () => {
    expect(countUpValue(175, 0, count)).toBe(0);
    expect(countUpValue(175, 250, count)).toBe(0);
    expect(countUpValue(175, 1050, count)).toBe(175);
    expect(countUpValue(175, 99_999, count)).toBe(175);
  });

  it("whole numbers that only climb and never pass the target", () => {
    let last = 0;
    for (let ms = 0; ms <= 1100; ms += 16) {
      const value = countUpValue(175, ms, count);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(last);
      expect(value).toBeLessThanOrEqual(175);
      last = value;
    }
    expect(last).toBe(175);
  });

  it("eases out: more than half the figure by the halfway mark", () => {
    expect(countUpValue(100, 650, count)).toBeGreaterThan(50);
  });

  it("nothing to count: the target as it is", () => {
    expect(countUpValue(0, 500, count)).toBe(0);
    expect(countUpValue(40, 500, { startMs: 0, ms: 0 })).toBe(40);
  });
});
