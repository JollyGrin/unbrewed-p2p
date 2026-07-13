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
  addItem,
  setItemField,
  removeItem,
  setSpaceItem,
  setPassage,
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

  it("round-trips battlefield items + space.item + passage (engine #156/#157)", () => {
    const d0 = doc({
      items: [
        { id: "sword", kind: "combat", label: "Sword", value: 2 },
        { id: "bomb", kind: "scheme", label: "Bomb", ops: [{ op: "dealDamage", amount: 1 }] as never },
      ],
      spaces: [
        { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1, item: "sword" },
        { id: "s2", x: 0.8, y: 0.2, zones: ["z1"], adjacentTo: ["s1"], start: 2, item: "bomb", passage: true },
        { id: "s3", x: 0.5, y: 0.8, zones: ["z1"], adjacentTo: ["s2"], passage: true },
      ],
    });
    const def = toMapDef(d0);
    expect(def.items).toHaveLength(2);
    expect(def.spaces[0].item).toBe("sword");
    expect(def.spaces[1].passage).toBe(true);
    expect(def.spaces[2].passage).toBe(true);
    // export → import → export is a fixed point.
    expect(toMapDef(toMapDoc(JSON.parse(JSON.stringify(def))))).toEqual(def);
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

  it("warns on the engine's item rules (unassigned, twice-assigned, bad value/ops)", () => {
    const w = validate(
      doc({
        items: [
          { id: "sword", kind: "combat", label: "Sword", value: 0 }, // value < 1
          { id: "bomb", kind: "scheme", label: "Bomb", ops: [] }, // empty ops
          { id: "ghost", kind: "combat", label: "Ghost", value: 1 }, // unassigned
        ],
        spaces: [
          { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1, item: "sword" },
          { id: "s2", x: 0.8, y: 0.2, zones: ["z1"], adjacentTo: ["s1"], start: 2, item: "sword" }, // twice
        ],
      })
    );
    expect(w.some((m) => m.includes("combat item sword needs an integer value ≥ 1"))).toBe(true);
    expect(w.some((m) => m.includes("scheme item bomb needs non-empty ops"))).toBe(true);
    expect(w.some((m) => m.includes("ghost is defined but unassigned"))).toBe(true);
    expect(w.some((m) => m.includes("sword is assigned to 2 spaces"))).toBe(true);
  });

  it("warns when exactly one space is flagged as a secret passage (engine #156)", () => {
    const one = doc({
      spaces: [
        { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1, passage: true },
        { id: "s2", x: 0.8, y: 0.2, zones: ["z1"], adjacentTo: ["s1"], start: 2 },
      ],
    });
    expect(validate(one).some((m) => m.includes("needs at least 2 passage spaces"))).toBe(true);
    // two passage spaces is a valid network — no passage warning.
    const two = setPassage(one, "s2", true);
    expect(validate(two).some((m) => m.includes("passage"))).toBe(false);
  });
});

describe("battlefield item + passage mutations", () => {
  it("adds a combat item (default value 1) and a scheme item (empty ops)", () => {
    const { doc: d1, itemId: combatId } = addItem(doc(), "combat");
    expect(d1.items).toHaveLength(1);
    expect(d1.items![0]).toMatchObject({ id: combatId, kind: "combat", value: 1 });
    const { doc: d2, itemId: schemeId } = addItem(d1, "scheme");
    expect(d2.items).toHaveLength(2);
    expect(d2.items![1]).toMatchObject({ id: schemeId, kind: "scheme", ops: [] });
    expect(combatId).not.toBe(schemeId); // unique ids
  });

  it("assigns an item to a space and clears it", () => {
    const { doc: d1, itemId } = addItem(doc(), "combat");
    const assigned = setSpaceItem(d1, "s1", itemId);
    expect(assigned.spaces.find((s) => s.id === "s1")!.item).toBe(itemId);
    const cleared = setSpaceItem(assigned, "s1", undefined);
    expect(cleared.spaces.find((s) => s.id === "s1")!.item).toBeUndefined();
  });

  it("removing an item also scrubs it from every space that spawned it", () => {
    const { doc: d1, itemId } = addItem(doc(), "combat");
    const assigned = setSpaceItem(d1, "s1", itemId);
    const removed = removeItem(assigned, itemId);
    expect(removed.items).toHaveLength(0);
    expect(removed.spaces.find((s) => s.id === "s1")!.item).toBeUndefined();
  });

  it("edits an item's fields via setItemField", () => {
    const { doc: d1, itemId } = addItem(doc(), "combat");
    const edited = setItemField(d1, itemId, { label: "Excalibur", value: 3 });
    expect(edited.items![0]).toMatchObject({ label: "Excalibur", value: 3 });
  });
});
