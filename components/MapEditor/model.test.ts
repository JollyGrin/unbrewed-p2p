import {
  MapDoc,
  toMapDef,
  toMapDoc,
  edgesOf,
  edgeRef,
  edgeState,
  applyEdgeState,
  setTwoWay,
  setOneWay,
  removeEdge,
  deleteSpace,
  addSpace,
  nextSpaceId,
  toggleZone,
  setStart,
  nudgeSpace,
  validate,
} from "./model";

const doc = (over: Partial<MapDoc> = {}): MapDoc => ({
  meta: { title: "T", imageUrl: "/i.png", players: [1, 2], source: "", license: "", spaceDiameter: 0.021 },
  zones: [{ id: "z1", color: "#fff", label: "arena" }],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1 },
    { id: "s2", x: 0.8, y: 0.2, zones: ["z1"], adjacentTo: ["s1"], start: 2 },
    { id: "s3", x: 0.5, y: 0.8, zones: ["z1"], adjacentTo: [], oneWayTo: ["s1"] },
  ],
  ...over,
});

describe("toMapDef / toMapDoc round-trip", () => {
  it("exports engine-native ProMapDef with start-slot object + derived players", () => {
    const def = toMapDef(doc());
    expect(def.schemaVersion).toBe("1.0");
    expect(def.id).toBe("t");
    expect(def.meta.minPlayers).toBe(2);
    expect(def.meta.maxPlayers).toBe(2);
    expect(def.spaces[0].start).toEqual({ slot: 1 });
    expect(def.spaces[2].oneWayTo).toEqual(["s1"]);
  });

  it("omits empty oneWayTo and absent start (byte-compat with the old editor)", () => {
    const def = toMapDef(doc());
    expect("oneWayTo" in def.spaces[0]).toBe(false);
    expect("start" in def.spaces[2]).toBe(false);
  });

  it("re-imports its own export unchanged", () => {
    const d0 = doc();
    const roundTripped = toMapDoc(JSON.parse(JSON.stringify(toMapDef(d0))));
    expect(toMapDef(roundTripped)).toEqual(toMapDef(d0));
  });

  it("accepts a legacy MapDoc (no schemaVersion) untouched", () => {
    const legacy = doc();
    expect(toMapDoc(legacy)).toEqual(legacy);
  });
});

describe("edges", () => {
  it("lists each two-way edge once and every one-way", () => {
    const e = edgesOf(doc());
    expect(e).toEqual([
      { from: "s1", to: "s2", type: "two" },
      { from: "s3", to: "s1", type: "one" },
    ]);
  });

  it("reports edge state for a canonical pair", () => {
    const d = doc();
    expect(edgeState(d, edgeRef("s1", "s2"))).toBe("two");
    // s3 -> s1 one-way; canonical ref is {u:s1, v:s3}, so it's v->u
    expect(edgeState(d, edgeRef("s1", "s3"))).toBe("vu");
    expect(edgeState(d, edgeRef("s2", "s3"))).toBe("none");
  });

  it("applyEdgeState replaces cleanly in any direction", () => {
    const d = doc();
    const ref = edgeRef("s1", "s2");
    // two-way -> one-way s1->s2
    const oneWay = applyEdgeState(d, ref, "uv");
    expect(edgeState(oneWay, ref)).toBe("uv");
    // must have dropped the two-way adjacency both ways
    expect(oneWay.spaces.find((s) => s.id === "s1")!.adjacentTo).not.toContain("s2");
    expect(oneWay.spaces.find((s) => s.id === "s2")!.adjacentTo).not.toContain("s1");
    // flip direction
    const flipped = applyEdgeState(oneWay, ref, "vu");
    expect(edgeState(flipped, ref)).toBe("vu");
    // remove entirely
    expect(edgeState(applyEdgeState(flipped, ref, "none"), ref)).toBe("none");
  });

  it("setTwoWay clears any prior one-way", () => {
    const d = setOneWay(doc(), "s2", "s3");
    const two = setTwoWay(d, "s2", "s3");
    expect(two.spaces.find((s) => s.id === "s2")!.oneWayTo ?? []).not.toContain("s3");
    expect(edgeState(two, edgeRef("s2", "s3"))).toBe("two");
  });

  it("removeEdge is symmetric", () => {
    const d = removeEdge(doc(), "s1", "s2");
    expect(d.spaces.find((s) => s.id === "s1")!.adjacentTo).not.toContain("s2");
    expect(d.spaces.find((s) => s.id === "s2")!.adjacentTo).not.toContain("s1");
  });
});

describe("space mutations", () => {
  it("deleteSpace scrubs it from every other space's edges", () => {
    const d = deleteSpace(doc(), "s1");
    expect(d.spaces.map((s) => s.id)).toEqual(["s2", "s3"]);
    expect(d.spaces.find((s) => s.id === "s2")!.adjacentTo).toEqual([]);
    expect(d.spaces.find((s) => s.id === "s3")!.oneWayTo).toEqual([]);
  });

  it("nextSpaceId never collides", () => {
    expect(nextSpaceId(doc())).toBe("s4");
    const crowded = doc({ spaces: [{ id: "s1", x: 0, y: 0, zones: [], adjacentTo: [] }] });
    // s1 already taken by the length+1 rule -> disambiguated
    expect(nextSpaceId(crowded)).not.toBe("s1");
  });

  it("addSpace seeds the active zone", () => {
    const d = addSpace(doc(), "s4", 0.1, 0.1, "z1");
    expect(d.spaces.find((s) => s.id === "s4")!.zones).toEqual(["z1"]);
  });

  it("toggleZone adds then removes", () => {
    const d1 = toggleZone(doc(), "s3", "z9");
    expect(d1.spaces.find((s) => s.id === "s3")!.zones).toContain("z9");
    const d2 = toggleZone(d1, "s3", "z9");
    expect(d2.spaces.find((s) => s.id === "s3")!.zones).not.toContain("z9");
  });

  it("setStart sets and clears", () => {
    expect(setStart(doc(), "s3", 3).spaces.find((s) => s.id === "s3")!.start).toBe(3);
    expect(setStart(doc(), "s1", undefined).spaces.find((s) => s.id === "s1")!.start).toBeUndefined();
  });

  it("nudgeSpace clamps to [0,1]", () => {
    const d = nudgeSpace(doc(), "s1", -1, -1);
    const s1 = d.spaces.find((s) => s.id === "s1")!;
    expect(s1.x).toBe(0);
    expect(s1.y).toBe(0);
  });
});

describe("validate", () => {
  it("passes a well-formed map", () => {
    expect(validate(doc())).toEqual([]);
  });
  it("flags asymmetric and isolated spaces", () => {
    const bad = doc({
      spaces: [
        { id: "s1", x: 0, y: 0, zones: ["z1"], adjacentTo: ["s2"], start: 1 },
        { id: "s2", x: 1, y: 1, zones: ["z1"], adjacentTo: [], start: 2 },
      ],
    });
    const w = validate(bad);
    expect(w.some((m) => m.includes("asymmetric"))).toBe(true);
    expect(w.some((m) => m.includes("isolated"))).toBe(true);
  });
});
