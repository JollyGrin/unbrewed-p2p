/**
 * The two replay id namespaces stay disjoint (#698) — the whole `?open=` fix
 * rests on being able to route a bare id without guessing.
 */
import { classifyReplayId, isCloudReplayId, isLocalReplayId } from "./replayIds";
import { replayId } from "./replayStore";
import type { ReplayBundle } from "./protocol";

const bundle = {
  v: 1,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  config: { seed: 7, players: {}, map: {} },
  actionLog: [{}, {}],
  meta: { winner: "p1", heroes: { p1: "king-kong", p2: "thrall" }, turns: 4, endedAt: 1_720_000_000_000, mapTitle: "The Mended Drum" },
} as unknown as ReplayBundle;

describe("classifyReplayId", () => {
  it("calls a real replayId() output local", () => {
    const id = replayId(bundle);
    expect(id).toMatch(/^r[0-9a-f]{8}$/);
    expect(classifyReplayId(id)).toBe("local");
    expect(isLocalReplayId(id)).toBe(true);
    expect(isCloudReplayId(id)).toBe(false);
  });

  it("calls a uuid cloud", () => {
    const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(classifyReplayId(uuid)).toBe("cloud");
    expect(classifyReplayId(uuid.toUpperCase())).toBe("cloud");
    expect(isCloudReplayId(uuid)).toBe(true);
    expect(isLocalReplayId(uuid)).toBe(false);
  });

  it("never confuses the two shapes", () => {
    // The reported link's id, and a uuid — neither can be read as the other.
    expect(classifyReplayId("r80279f0e")).toBe("local");
    expect(classifyReplayId("r80279f0e-4f89-11d3-9a0c-0305e82c3301")).toBe("unknown");
  });

  it("treats anything else as unknown", () => {
    for (const junk of ["", "   ", "r80279f0", "r80279f0ee", "rzzzzzzzz", "sample", "3f2504e0-4f89-11d3-9a0c"]) {
      expect(classifyReplayId(junk)).toBe("unknown");
    }
  });

  it("tolerates surrounding whitespace from a sloppy paste", () => {
    expect(classifyReplayId("  r80279f0e ")).toBe("local");
  });
});
