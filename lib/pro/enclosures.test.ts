import { enclosureModel, enclosureNumbers } from "./enclosures";
import type { ProMapDef } from "./protocol";

const map = (over: Partial<ProMapDef> = {}): ProMapDef => ({
  schemaVersion: "1",
  id: "m",
  meta: { title: "M", minPlayers: 1, maxPlayers: 4, specialRules: false },
  zones: [],
  spaces: [
    { id: "a", x: 0.1, y: 0.1, zones: [], adjacentTo: [], startsBlocked: true },
    { id: "b", x: 0.2, y: 0.1, zones: [], adjacentTo: [], startsBlocked: true },
    { id: "c", x: 0.3, y: 0.1, zones: [], adjacentTo: [] },
  ],
  scenario: { groups: [{ id: "enclosures", kind: "CONTAINS", spaces: ["a", "b"], order: [7, 3] }] },
  ...over,
});

describe("enclosureModel", () => {
  it("is null for a map with no startsBlocked space (duel/ffa/2v2 render untouched)", () => {
    const plain = map({ spaces: [{ id: "c", x: 0, y: 0, zones: [], adjacentTo: [] }], scenario: undefined });
    expect(enclosureModel(plain, undefined)).toBeNull();
    expect(enclosureModel(plain, ["c"])).toBeNull();
  });

  it("splits startsBlocked spaces into still-blocked and destroyed", () => {
    const m = enclosureModel(map(), ["a"])!;
    expect([...m.blocked]).toEqual(["a"]);
    expect([...m.destroyed]).toEqual(["b"]);
  });

  it("treats an absent blockedSpaces as everything destroyed", () => {
    expect([...enclosureModel(map(), undefined)!.destroyed].sort()).toEqual(["a", "b"]);
  });

  it("maps printed numbers from the enclosures group order, index-aligned with spaces", () => {
    expect(enclosureNumbers(map())).toEqual({ a: 7, b: 3 });
    expect(enclosureNumbers(map({ scenario: undefined }))).toEqual({});
  });
});
