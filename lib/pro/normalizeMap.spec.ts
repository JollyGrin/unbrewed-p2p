import { describe, expect, it } from "@jest/globals";
import { normalizeMap, MapParseError } from "./normalizeMap";
import type { ProMapDef } from "./protocol";

/** A minimal engine-native ProMapDef (what the editor now exports). */
const NATIVE: ProMapDef = {
  schemaVersion: "1.0",
  id: "tiny",
  meta: { title: "Tiny", minPlayers: 2, maxPlayers: 2, specialRules: false },
  zones: [{ id: "z", color: "#fff", label: "Z" }],
  spaces: [
    { id: "a", x: 0.1, y: 0.1, zones: ["z"], adjacentTo: ["b"], start: { slot: 1 } },
    { id: "b", x: 0.2, y: 0.2, zones: ["z"], adjacentTo: ["a"], start: { slot: 2 } },
  ],
};

/** The legacy editor MapDoc shape (pre native-export copies people saved). */
const LEGACY_DOC = {
  meta: { title: "Old Board", imageUrl: "http://x/y.png", players: [1, 2], source: "me", license: "cc" },
  zones: [{ id: "z", color: "#fff", label: "Z" }],
  spaces: [
    { id: "a", x: 0.1, y: 0.1, zones: ["z"], adjacentTo: ["b"], start: 1 },
    { id: "b", x: 0.2, y: 0.2, zones: ["z"], adjacentTo: ["a"], oneWayTo: ["a"], start: 2 },
  ],
};

describe("normalizeMap", () => {
  it("passes an engine-native ProMapDef through untouched", () => {
    expect(normalizeMap(NATIVE)).toEqual(NATIVE);
  });

  it("converts a legacy MapDoc: players->min/max, start number-> {slot}", () => {
    const out = normalizeMap(LEGACY_DOC);
    expect(out.schemaVersion).toBe("1.0");
    expect(out.meta.minPlayers).toBe(1);
    expect(out.meta.maxPlayers).toBe(2);
    expect(out.meta.title).toBe("Old Board");
    expect(out.meta.imageUrl).toBe("http://x/y.png");
    expect(out.spaces[0].start).toEqual({ slot: 1 });
    expect(out.spaces[1].start).toEqual({ slot: 2 });
    expect(out.spaces[1].oneWayTo).toEqual(["a"]);
  });

  it("slugifies a title into an id when the legacy doc has none", () => {
    expect(normalizeMap({ ...LEGACY_DOC, meta: { ...LEGACY_DOC.meta, title: "The Mended Drum!" } }).id).toBe(
      "the-mended-drum"
    );
  });

  it("survives a JSON round-trip of a native map (paste path)", () => {
    const pasted = JSON.parse(JSON.stringify(NATIVE));
    expect(normalizeMap(pasted)).toEqual(NATIVE);
  });

  it("throws a readable error on non-object / missing arrays", () => {
    expect(() => normalizeMap("nope")).toThrow(MapParseError);
    expect(() => normalizeMap({ spaces: [] })).toThrow(/zones/);
    expect(() => normalizeMap({ zones: [] })).toThrow(/spaces/);
  });

  it("throws when a legacy space is missing an id", () => {
    const bad = { ...LEGACY_DOC, spaces: [{ x: 0, y: 0, zones: ["z"], adjacentTo: [] }] };
    expect(() => normalizeMap(bad)).toThrow(/space #0/);
  });
});
