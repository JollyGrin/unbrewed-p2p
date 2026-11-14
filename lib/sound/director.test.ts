import { statSync } from "fs";

import {
  FATIGUE_MS,
  MAX_BURST,
  MAX_IN_WINDOW,
  WINDOW_MS,
  createDirector,
} from "./director";
import { SOUND_EVENTS, SOUND_EVENT_NAMES, TakeGroup } from "./events";
import { SOUND_PACK_BYTES, SOUND_TAKES } from "./manifest";

/** Deterministic rng (mulberry32) so a failure reproduces. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const setup = (over: { muted?: boolean; takes?: number } = {}) => {
  const clock = { t: 0 };
  const state = { muted: over.muted ?? false };
  const director = createDirector({
    takeCount: (g: TakeGroup) => over.takes ?? SOUND_TAKES[g].length,
    isMuted: () => state.muted,
    rng: seeded(7),
    now: () => clock.t,
  });
  return { director, clock, state };
};

describe("sound director", () => {
  it("never plays the same take twice in a row, for any event", () => {
    for (const event of SOUND_EVENT_NAMES) {
      const { director, clock } = setup();
      const takes: number[] = [];
      for (let i = 0; i < 300; i++) {
        clock.t += 1000;
        takes.push(director.play(event)[0].take);
      }
      const count = SOUND_TAKES[SOUND_EVENTS[event].takes].length;
      expect(count).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < takes.length; i++) {
        expect(takes[i]).not.toBe(takes[i - 1]);
        // With four or more takes the one before last is off limits too.
        if (count >= 4 && i > 1) expect(takes[i]).not.toBe(takes[i - 2]);
      }
      // ...and every take does get used.
      expect(new Set(takes).size).toBe(count);
    }
  });

  it("does not repeat a take inside one burst either", () => {
    const { director } = setup();
    const takes = director.play("draw", { count: 3 }).map((v) => v.take);
    expect(new Set(takes).size).toBe(3);
  });

  it("varies pitch, level and tone on every play, inside the event's range", () => {
    const { director, clock } = setup();
    const cfg = SOUND_EVENTS.draw;
    const rates = new Set<number>();
    for (let i = 0; i < 200; i++) {
      clock.t += 1000;
      const [v] = director.play("draw");
      rates.add(v.rate);
      expect(v.rate).toBeGreaterThanOrEqual(cfg.rate * (1 - cfg.rateJitter));
      expect(v.rate).toBeLessThanOrEqual(cfg.rate * (1 + cfg.rateJitter));
      expect(v.gain).toBeGreaterThanOrEqual(cfg.gain * 0.88 - 1e-9);
      expect(v.gain).toBeLessThanOrEqual(cfg.gain * 1.12 + 1e-9);
      expect(v.lowpassHz).toBeGreaterThanOrEqual(cfg.lowpassHz * 0.88 - 1e-6);
      expect(v.lowpassHz).toBeLessThanOrEqual(cfg.lowpassHz * 1.12 + 1e-6);
      expect(v.delayMs).toBeGreaterThanOrEqual(0);
      expect(v.delayMs).toBeLessThan(10);
    }
    expect(rates.size).toBe(200);
  });

  it("plays nothing while muted, and resumes at once when unmuted", () => {
    const { director, clock, state } = setup({ muted: true });
    expect(director.play("draw")).toEqual([]);
    expect(director.play("shuffle")).toEqual([]);
    state.muted = false;
    clock.t += 1;
    expect(director.play("draw")).toHaveLength(1);
    state.muted = true;
    clock.t += 1000;
    expect(director.play("draw")).toEqual([]);
  });

  it("plays nothing until the pack has loaded (no takes)", () => {
    const { director } = setup({ takes: 0 });
    expect(director.play("draw")).toEqual([]);
  });

  it("drops a repeat of the same event inside its minimum gap", () => {
    const { director, clock } = setup();
    expect(director.play("hp")).toHaveLength(1);
    clock.t += SOUND_EVENTS.hp.minGapMs - 1;
    expect(director.play("hp")).toEqual([]);
    // A different event is not held back by it.
    expect(director.play("draw")).toHaveLength(1);
    clock.t += 1;
    expect(director.play("hp")).toHaveLength(1);
  });

  it("a dropped call does not push the next allowed one further out", () => {
    const { director, clock } = setup();
    director.play("shuffle");
    for (let i = 0; i < 5; i++) {
      clock.t += 100;
      expect(director.play("shuffle")).toEqual([]);
    }
    clock.t += 100;
    expect(director.play("shuffle")).toHaveLength(1);
  });

  it("caps how many sounds can start in a short window", () => {
    const { director, clock } = setup();
    let started = 0;
    // 40 requests in 400 ms across every event: a state burst.
    for (let i = 0; i < 40; i++) {
      clock.t += 10;
      started += director.play(SOUND_EVENT_NAMES[i % SOUND_EVENT_NAMES.length]).length;
    }
    expect(started).toBe(MAX_IN_WINDOW);
    clock.t += WINDOW_MS + 200;
    expect(director.play("draw")).toHaveLength(1);
  });

  it("turns a count into a short staggered burst, capped", () => {
    const { director } = setup();
    const voices = director.play("draw", { count: 5 });
    expect(voices).toHaveLength(MAX_BURST);
    const gap = SOUND_EVENTS.draw.burstGapMs;
    for (let i = 1; i < voices.length; i++) {
      const step = voices[i].delayMs - voices[i - 1].delayMs;
      expect(step).toBeGreaterThanOrEqual(gap * 0.65 - 1e-9);
      expect(step).toBeLessThanOrEqual(gap * 1.35 + 1e-9);
      // Each later card sits a little further back.
      expect(voices[i].gain).toBeLessThan(voices[0].gain * 1.3);
    }
    // The steps are not all the same length.
    expect(voices[2].delayMs - voices[1].delayMs).not.toBeCloseTo(
      voices[1].delayMs - voices[0].delayMs,
      3,
    );
  });

  it("plays rapid repeats progressively quieter, then recovers", () => {
    const { director, clock } = setup();
    const mean = (n: number, step: number) => {
      let total = 0;
      for (let i = 0; i < n; i++) {
        clock.t += step;
        total += director.play("hp")[0].gain;
      }
      return total / n;
    };
    const rested = mean(40, FATIGUE_MS + 50);
    const hammered = mean(40, 100);
    expect(hammered).toBeLessThan(rested * 0.75);
    expect(hammered).toBeGreaterThan(rested * 0.5);
    clock.t += FATIGUE_MS + 50;
    expect(mean(40, FATIGUE_MS + 50)).toBeGreaterThan(rested * 0.9);
  });

  it("applies the caller's gain and pitch", () => {
    const a = setup();
    const b = setup();
    const [plain] = a.director.play("hp");
    const [shaped] = b.director.play("hp", { gain: 0.5, pitch: 0.9 });
    expect(shaped.gain).toBeCloseTo(plain.gain * 0.5, 9);
    expect(shaped.rate).toBeCloseTo(plain.rate * 0.9, 9);
  });
});

describe("sound pack manifest", () => {
  it("covers the file end to end with no gaps or overlaps", () => {
    const ranges = Object.values(SOUND_TAKES)
      .flat()
      .sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [offset, length] of ranges) {
      expect(offset).toBe(cursor);
      cursor += length;
    }
    expect(cursor).toBe(SOUND_PACK_BYTES);
  });

  it("ships the file the manifest describes, under the size budget", () => {
    const size = statSync("public/sounds/table/table-sounds.mp3").size;
    expect(size).toBe(SOUND_PACK_BYTES);
    expect(size).toBeLessThan(150 * 1024);
  });
});
