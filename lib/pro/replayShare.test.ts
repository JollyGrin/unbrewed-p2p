/**
 * Import / export / share helpers (#122): bundle parsing + the Discord length guard.
 */
import type { ReplayBundle } from "./protocol";
import { DISCORD_INLINE_LIMIT, bundleFilename, compactCodeInfo, parseBundle } from "./replayShare";

const good: ReplayBundle = {
  v: 1,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  config: {
    seed: 1,
    players: { p1: { heroId: "king-kong", hero: {}, cards: [] }, p2: { heroId: "thrall", hero: {}, cards: [] } },
    map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  },
  actionLog: [],
  meta: { winner: "p2", heroes: ["king-kong", "thrall"], turns: 5, endedAt: 1_720_000_000_000, mapTitle: "The Mended Drum" },
};

describe("parseBundle", () => {
  it("accepts a well-formed bundle", () => {
    expect(parseBundle(JSON.stringify(good)).v).toBe(1);
  });
  it("rejects non-JSON", () => {
    expect(() => parseBundle("{not json")).toThrow(/valid JSON/);
  });
  it("rejects the wrong version", () => {
    expect(() => parseBundle(JSON.stringify({ ...good, v: 2 }))).toThrow(/version/);
  });
  it("rejects missing fields", () => {
    expect(() => parseBundle(JSON.stringify({ v: 1, engine: {}, meta: {}, config: {} }))).toThrow(/actionLog/);
  });
});

describe("compactCodeInfo", () => {
  it("flags a bundle too long to paste into Discord", () => {
    const huge: ReplayBundle = { ...good, actionLog: new Array(2000).fill({ type: "MANEUVER", player: "p1" }) };
    const info = compactCodeInfo(huge);
    expect(info.length).toBeGreaterThan(DISCORD_INLINE_LIMIT);
    expect(info.tooLongForDiscord).toBe(true);
  });
  it("allows a small bundle to be copied inline", () => {
    const info = compactCodeInfo(good);
    expect(info.tooLongForDiscord).toBe(false);
    expect(info.code).toContain('"v":1');
  });
});

describe("bundleFilename", () => {
  it("includes both heroes and the end date", () => {
    expect(bundleFilename(good)).toMatch(/^unbrewed-replay-king-kong-vs-thrall-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
