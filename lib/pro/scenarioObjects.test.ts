import { GENERIC_OBJECT_NOUN, scenarioObjectModel, scenarioObjectNumbers, withArticle } from "./scenarioObjects";
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
  scenario: { groups: [{ id: "pens", kind: "CONTAINS", spaces: ["a", "b"], order: [7, 3] }] },
  ...over,
});

describe("scenarioObjectModel", () => {
  it("is null for a map with no startsBlocked space (duel/ffa/2v2 render untouched)", () => {
    const plain = map({ spaces: [{ id: "c", x: 0, y: 0, zones: [], adjacentTo: [] }], scenario: undefined });
    expect(scenarioObjectModel(plain, undefined)).toBeNull();
    expect(scenarioObjectModel(plain, ["c"])).toBeNull();
  });

  it("splits startsBlocked spaces into still-blocked and destroyed", () => {
    const m = scenarioObjectModel(map(), ["a"])!;
    expect([...m.blocked]).toEqual(["a"]);
    expect([...m.destroyed]).toEqual(["b"]);
  });

  it("treats an absent blockedSpaces as everything destroyed", () => {
    expect([...scenarioObjectModel(map(), undefined)!.destroyed].sort()).toEqual(["a", "b"]);
  });

  it("maps printed numbers from the pens group order, index-aligned with spaces", () => {
    expect(scenarioObjectNumbers(map())).toEqual({ a: 7, b: 3 });
    expect(scenarioObjectNumbers(map({ scenario: undefined }))).toEqual({});
  });

  it("#807: numbers by the group display.objectGroup names, not a hardcoded id", () => {
    const two = map({
      scenario: {
        groups: [
          { id: "docks", kind: "CONTAINS", spaces: ["c"], order: [9] },
          { id: "pens", kind: "CONTAINS", spaces: ["a", "b"], order: [7, 3] },
        ],
      },
    });
    expect(scenarioObjectNumbers(two, { objectGroup: "docks" })).toEqual({ c: 9 });
    expect(scenarioObjectNumbers(two, { objectGroup: "pens" })).toEqual({ a: 7, b: 3 });
    expect(scenarioObjectNumbers(two, { objectGroup: "missing" })).toEqual({});
    // no display: the first group that holds a startsBlocked space
    expect(scenarioObjectNumbers(two)).toEqual({ a: 7, b: 3 });
  });

  it("#807: the model carries the engine's object noun, else the generic one", () => {
    const display = { objectNoun: { singular: "tower", plural: "towers" }, objectGroup: "pens" };
    const scenario = { display } as unknown as Parameters<typeof scenarioObjectModel>[2];
    expect(scenarioObjectModel(map(), ["a"], scenario)!.noun).toEqual({ singular: "tower", plural: "towers" });
    expect(scenarioObjectModel(map(), ["a"])!.noun).toEqual(GENERIC_OBJECT_NOUN);
    expect([withArticle("outpost"), withArticle("tower")]).toEqual(["an outpost", "a tower"]);
  });
});
