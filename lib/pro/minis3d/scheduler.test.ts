import { createRenderScheduler } from "./scheduler";

/** A hand-cranked frame source: `step()` runs one animation frame. */
const frames = () => {
  let pending: (() => void) | null = null;
  let requested = 0;
  return {
    requestFrame: (cb: () => void) => {
      pending = cb;
      return ++requested;
    },
    cancelFrame: () => {
      pending = null;
    },
    step() {
      const cb = pending;
      pending = null;
      cb?.();
    },
    get pending() {
      return pending !== null;
    },
    get requested() {
      return requested;
    },
  };
};

const setup = (budget = 3) => {
  const f = frames();
  const stats = { frames: 0, jobs: 0, deferred: 0, peakQueue: 0 };
  const s = createRenderScheduler({ budget, requestFrame: f.requestFrame, cancelFrame: f.cancelFrame, stats });
  return { f, s, stats };
};

describe("the minis render scheduler", () => {
  test("at rest it requests no frame at all", () => {
    const { f, s } = setup();
    expect(f.pending).toBe(false);
    expect(s.busy).toBe(false);
    const k = {};
    s.request(k, () => {});
    f.step();
    // The queue drained and nothing is tracked: no further frame.
    expect(f.pending).toBe(false);
    expect(f.requested).toBe(1);
  });

  test("draws at most `budget` minis a frame, round-robin, and a skipped one keeps its turn", () => {
    const { f, s, stats } = setup(3);
    const drawn: number[][] = [];
    let frame: number[] = [];
    const keys = Array.from({ length: 8 }, () => ({}));
    // Every mini moves every frame (a board-wide shove): each re-requests.
    keys.forEach((k, i) => s.track(k, () => s.request(k, () => frame.push(i))));
    for (let n = 0; n < 4; n++) {
      frame = [];
      f.step();
      drawn.push(frame);
    }
    expect(drawn.map((d) => d.length)).toEqual([3, 3, 3, 3]);
    expect(drawn).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 0],
      [1, 2, 3],
    ]);
    expect(stats.deferred).toBeGreaterThan(0);
  });

  test("the latest request per mini wins; one mini asked twice draws once", () => {
    const { f, s } = setup();
    const k = {};
    const seen: string[] = [];
    s.request(k, () => seen.push("old"));
    s.request(k, () => seen.push("new"));
    f.step();
    expect(seen).toEqual(["new"]);
  });

  test("a tracker runs every frame until untracked, then the loop stops", () => {
    const { f, s } = setup();
    const k = {};
    let samples = 0;
    s.track(k, () => samples++);
    f.step();
    f.step();
    expect(samples).toBe(2);
    s.untrack(k);
    f.step();
    expect(f.pending).toBe(false);
    expect(samples).toBe(2);
  });

  test("cancel drops a queued draw and stops the frame when nothing is left", () => {
    const { f, s } = setup();
    const k = {};
    let ran = false;
    s.request(k, () => (ran = true));
    s.cancel(k);
    expect(f.pending).toBe(false);
    f.step();
    expect(ran).toBe(false);
  });

  test("a throwing job does not stall the others", () => {
    const { f, s } = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    let ran = false;
    s.request({}, () => {
      throw new Error("boom");
    });
    s.request({}, () => (ran = true));
    f.step();
    expect(ran).toBe(true);
    warn.mockRestore();
  });

  test("a throwing sampler does not freeze the others, the queue or the loop", () => {
    const { f, s } = setup();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const bad = {}, good = {};
    let goodSamples = 0, drawn = 0;
    s.track(bad, () => {
      throw new Error("detached anchor");
    });
    s.track(good, () => {
      goodSamples++;
      s.request(good, () => drawn++);
    });
    f.step();
    expect(goodSamples).toBe(1);
    expect(drawn).toBe(1);
    // Still scheduled: the next frame runs too.
    expect(f.pending).toBe(true);
    f.step();
    expect(goodSamples).toBe(2);
    expect(drawn).toBe(2);
    warn.mockRestore();
  });

  test("a job that re-requests itself waits for the next frame", () => {
    const { f, s } = setup(3);
    const k = {};
    let runs = 0;
    const job = () => {
      runs++;
      s.request(k, job);
    };
    s.request(k, job);
    f.step();
    expect(runs).toBe(1);
    f.step();
    expect(runs).toBe(2);
    s.cancel(k);
  });

  test("a job that cancels a later mini in the same batch stops it drawing", () => {
    const { f, s } = setup(3);
    const a = {}, b = {};
    let bRan = false;
    s.request(a, () => s.cancel(b));
    s.request(b, () => (bRan = true));
    f.step();
    expect(bRan).toBe(false);
  });
});
