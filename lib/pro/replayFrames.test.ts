/**
 * Frames-at-upload (#701): the frozen expansion that keeps a `/share/replay/`
 * link renderable after the engine has moved on.
 *
 * What matters here is the boundary in both directions. Outbound, the frames
 * must be self-sufficient (a scrubber gets map + catalog + steps + the log those
 * steps cover) and must not out-run a truncated expansion. Inbound, they arrive
 * from a public endpoint, so anything that isn't a usable frame set has to read
 * as "no frames" and send the caller back to the engine — never render half a
 * board off a hand-edited blob.
 */
import {
  expansionFromFrames,
  framesFromExpansion,
  readFrames,
  stripFrames,
  type BundleWithFrames,
} from "./replayFrames";
import type { Action, ReplayBundle, ReplayExpansion, ReplayStep } from "./protocol";

const step = (index: number, turnNumber: number) =>
  ({ index, turnNumber }) as unknown as ReplayStep;

const action = (n: number) => ({ type: "MANEUVER", player: `a${n}` }) as unknown as Action;

const bundle = (actions = 3): ReplayBundle =>
  ({
    v: 1,
    engine: { schemaVersion: 2, dslVersion: "0.17.0" },
    config: { seed: 1, players: {}, map: {} },
    actionLog: Array.from({ length: actions }, (_, i) => action(i)),
    meta: { winner: "p1", heroes: { p1: "king-kong", p2: "thrall" }, turns: 3, endedAt: 1, mapTitle: "The Mended Drum" },
  }) as unknown as ReplayBundle;

const expansion = (over: Partial<ReplayExpansion> = {}): ReplayExpansion =>
  ({
    ok: true,
    engine: { schemaVersion: 5, dslVersion: "0.64.0" },
    meta: bundle().meta,
    map: { schemaVersion: "1.0", id: "mended-drum", meta: {}, zones: [], spaces: [] },
    catalog: { "king-kong/clobber": { title: "Clobber", type: "attack" } },
    heroes: { p1: "king-kong", p2: "thrall" },
    steps: [step(0, 1), step(1, 1), step(2, 2), step(3, 2)],
    finalHash: "abc123",
    ...over,
  }) as unknown as ReplayExpansion;

describe("framesFromExpansion", () => {
  it("freezes everything a scrubber needs, with the log the steps cover", () => {
    const frames = framesFromExpansion(bundle(), expansion());

    expect(frames.v).toBe(1);
    expect(frames.steps).toHaveLength(4);
    expect(frames.map).toBeTruthy();
    expect(frames.catalog["king-kong/clobber"]).toBeTruthy();
    expect(frames.finalHash).toBe("abc123");
    // 4 steps ⇒ the 3 actions between them.
    expect(frames.actionLog).toHaveLength(3);
  });

  it("clamps the log to a truncated expansion instead of running past its last frame", () => {
    const frames = framesFromExpansion(bundle(6), expansion({ steps: [step(0, 1), step(1, 1)] }));

    expect(frames.steps).toHaveLength(2);
    expect(frames.actionLog).toHaveLength(1);
  });

  it("carries the verification block, so a truncated upload stays honest downstream", () => {
    const frames = framesFromExpansion(
      bundle(),
      expansion({
        verification: "diverged",
        divergedAtTurn: 2,
        recordedEngine: { schemaVersion: 2, dslVersion: "0.17.0" },
      }),
    );

    expect(frames.verification).toBe("diverged");
    expect(frames.divergedAtTurn).toBe(2);
    expect(frames.recordedEngine).toEqual({ schemaVersion: 2, dslVersion: "0.17.0" });
    // …and comes back out the other side for the banner to read.
    expect(expansionFromFrames(frames).divergedAtTurn).toBe(2);
  });

  it("omits the verification keys entirely for a pre-#509 expansion", () => {
    const frames = framesFromExpansion(bundle(), expansion());

    expect("verification" in frames).toBe(false);
    expect("divergedAtTurn" in frames).toBe(false);
  });
});

describe("expansionFromFrames", () => {
  it("rebuilds the expansion the scrubber consumes, action log included", () => {
    const rebuilt = expansionFromFrames(framesFromExpansion(bundle(), expansion())) as ReplayExpansion & {
      actionLog: Action[];
    };

    expect(rebuilt.ok).toBe(true);
    expect(rebuilt.steps).toHaveLength(4);
    expect(rebuilt.actionLog).toHaveLength(3);
    expect(rebuilt.catalog["king-kong/clobber"]).toBeTruthy();
  });
});

describe("readFrames", () => {
  const framed = (frames: unknown): BundleWithFrames => ({ ...bundle(), frames } as BundleWithFrames);

  it("reads frames that were written by framesFromExpansion", () => {
    const written = framesFromExpansion(bundle(), expansion());
    // Round-tripped through JSON, the way the api actually stores and returns it.
    const read = readFrames(JSON.parse(JSON.stringify(framed(written))));

    expect(read?.steps).toHaveLength(4);
    expect(read?.actionLog).toHaveLength(3);
  });

  it("reads a bundle with no frames as having none", () => {
    expect(readFrames(bundle())).toBeNull();
    expect(readFrames(null)).toBeNull();
  });

  it.each([
    ["a future envelope version", { v: 2, steps: [step(0, 1)], map: {}, meta: {}, engine: {}, catalog: {} }],
    ["no steps", { v: 1, steps: [], map: {}, meta: {}, engine: {}, catalog: {} }],
    ["steps that aren't a list", { v: 1, steps: "lots", map: {}, meta: {}, engine: {}, catalog: {} }],
    ["no map", { v: 1, steps: [step(0, 1)], meta: {}, engine: {}, catalog: {} }],
    ["no catalog", { v: 1, steps: [step(0, 1)], map: {}, meta: {}, engine: {} }],
    ["a string", "frames!"],
  ])("falls back to the engine for %s", (_label, frames) => {
    expect(readFrames(framed(frames))).toBeNull();
  });
});

describe("stripFrames", () => {
  it("removes the frames and nothing else", () => {
    const framed = { ...bundle(), frames: framesFromExpansion(bundle(), expansion()) };

    const stripped = stripFrames(framed);

    expect("frames" in stripped).toBe(false);
    expect(stripped.actionLog).toHaveLength(3);
    expect(stripped.meta).toEqual(framed.meta);
  });

  it("hands back the very same object when there is nothing to strip", () => {
    const plain = bundle();
    expect(stripFrames(plain)).toBe(plain);
  });
});
