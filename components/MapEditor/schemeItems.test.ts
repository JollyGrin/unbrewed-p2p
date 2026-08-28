/**
 * Scheme-item authoring end to end at the model layer (unbrewed-p2p-693):
 * born-valid items, the blocking export guard, and the acceptance fixture — the
 * reporter's "Wedding Crashers" map (`test/fixtures/weddingCrashers.map.json`),
 * whose two scheme items shipped with `ops: []` because the old panel had no way
 * to author one. The items are as attached to issue #693, so these tests assert
 * the real bug and the real repair rather than a reconstruction. Only the board
 * art has moved on: #729 took the author's finalized export — the same map with
 * its spaces/connections photoshopped into the image and six coordinates nudged
 * onto the baked-in circles — so `meta.imageUrl` and those six x/y pairs match
 * the finalized art. The item bug is untouched.
 *
 * The repair's export is the board the catalog now ships
 * (`lib/pro/fixtures/wedding-crashers.map.json`, #727) — one committed copy, and
 * this file is what keeps it equal to what the editor actually emits.
 */
import weddingCrashers from "@/test/fixtures/weddingCrashers.map.json";
import weddingCrashersRepaired from "@/lib/pro/fixtures/wedding-crashers.map.json";
import type { ProMapDef, ProMapItem } from "@/lib/pro/protocol";
import {
  MapDoc,
  addItem,
  setItemField,
  setSpaceItem,
  toMapDef,
  toMapDoc,
  validateDoc,
} from "./model";
import { effectsFromOps, effectsText, opsFromEffects, SchemeEffect } from "./schemeOps";

const FIXTURE = weddingCrashers as unknown as ProMapDef;

const itemsOf = (def: ProMapDef): Record<string, ProMapItem> =>
  Object.fromEntries((def.items ?? []).map((i) => [i.id, i]));

/** Author an item's effects the way ItemsPanel's builder does. */
const authorEffects = (doc: MapDoc, id: string, effects: SchemeEffect[]): MapDoc =>
  setItemField(doc, id, { ops: opsFromEffects(effects), text: effectsText(effects) });

/** Where the repaired board lives now that it is a catalog entry (#727). */
const CATALOG_IMAGE_URL = "https://unbrewed.xyz/maps/community-wedding-crashers.webp";

/**
 * The reporter's map as an author repairs it in the editor: both scheme effects
 * picked from the menu, `item4` finally placed on a space (the fixture declared
 * it but never spawned it — dead content the engine also rejects), and the board
 * image re-pointed at unbrewed.xyz — the promotion to `MAP_CATALOG` (#727) moved
 * it off the reporter's third-party image host.
 * `lib/pro/fixtures/wedding-crashers.map.json` is this map's export — the single
 * committed copy, shipped in the catalog, and what the live pro-room
 * verification for #693 was run against.
 */
const repaired = (): MapDoc => {
  let doc = toMapDoc(FIXTURE);
  doc = { ...doc, meta: { ...doc.meta, imageUrl: CATALOG_IMAGE_URL } };
  doc = authorEffects(doc, "item2", [{ kind: "heal", amount: 2 }]);
  doc = authorEffects(doc, "item4", [{ kind: "search" }]);
  return setSpaceItem(doc, "s13", "item4");
};

describe("new scheme items are born valid", () => {
  const bareDoc = (): MapDoc => ({
    meta: { title: "T", imageUrl: "i", players: [1, 2], source: "", license: "" },
    zones: [{ id: "z1", color: "#fff", label: "z" }],
    spaces: [
      { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1 },
      { id: "s2", x: 0.8, y: 0.8, zones: ["z1"], adjacentTo: ["s1"], start: 2 },
    ],
  });

  it("seeds a real default effect instead of the server-rejected ops: []", () => {
    const { doc, itemId } = addItem(bareDoc(), "scheme");
    const item = doc.items!.find((i) => i.id === itemId)!;
    expect(item.ops).toEqual([{ op: "draw", who: "SELF", amount: 1 }]);
    expect(item.text).toBe("Draw 1 card.");
    // …and it opens in the builder, not the raw-JSON fallback.
    expect(effectsFromOps(item.ops)).toEqual([{ kind: "draw", amount: 1 }]);
  });

  it("does not block export on its own", () => {
    const { doc, itemId } = addItem(bareDoc(), "scheme");
    const placed = { ...doc, spaces: doc.spaces.map((s) => (s.id === "s1" ? { ...s, item: itemId } : s)) };
    expect(validateDoc(placed).errors).toEqual([]);
  });
});

describe("export guardrails", () => {
  const withItem = (patch: Partial<ProMapItem>): MapDoc => ({
    meta: { title: "T", imageUrl: "i", players: [1, 2], source: "", license: "" },
    zones: [{ id: "z1", color: "#fff", label: "z" }],
    items: [{ id: "it", kind: "scheme", label: "It", ops: [], ...patch }],
    spaces: [
      { id: "s1", x: 0.2, y: 0.2, zones: ["z1"], adjacentTo: ["s2"], start: 1, item: "it" },
      { id: "s2", x: 0.8, y: 0.8, zones: ["z1"], adjacentTo: ["s1"], start: 2 },
    ],
  });

  it("BLOCKS on empty ops (the server rejects the map at room creation)", () => {
    const { errors, warnings } = validateDoc(withItem({ ops: [] }));
    expect(errors).toEqual([expect.stringContaining("scheme item it needs non-empty ops")]);
    expect(warnings.join(" ")).not.toContain("non-empty ops");
  });

  it("BLOCKS on ops that aren't a non-empty array of op objects", () => {
    expect(validateDoc(withItem({ ops: "draw a card" })).errors).toHaveLength(1);
    expect(validateDoc(withItem({ ops: [{ nope: 1 }] })).errors).toHaveLength(1);
  });

  it("BLOCKS advanced (hand-written) ops that carry no player-facing text", () => {
    const errors = validateDoc(withItem({ ops: [{ op: "dealDamage", amount: 1 }] })).errors;
    expect(errors).toEqual([expect.stringContaining("scheme item it needs effect text")]);
  });

  it("allows advanced ops once the author supplies the text", () => {
    const doc = withItem({ ops: [{ op: "dealDamage", amount: 1 }], text: "Deal 1 damage." });
    expect(validateDoc(doc).errors).toEqual([]);
  });

  it("needs no text for builder-shaped ops — export generates it", () => {
    const doc = withItem({ ops: opsFromEffects([{ kind: "heal", amount: 2 }]) });
    expect(validateDoc(doc).errors).toEqual([]);
    expect(itemsOf(toMapDef(doc)).it.text).toBe("Recover 2 health.");
  });

  it("BLOCKS on the other engine-fatal item rules too (bad value, dead content)", () => {
    // These are ERROR{BAD_MAP} server-side just like empty ops, so an export that
    // 'succeeded' with them would still be unplayable.
    const doc = withItem({ ops: opsFromEffects([{ kind: "search" }]) });
    doc.items!.push({ id: "ghost", kind: "combat", label: "Ghost", value: 0 });
    const { errors, warnings } = validateDoc(doc);
    expect(errors.join(" ")).toContain("combat item ghost needs an integer value ≥ 1");
    expect(errors.join(" ")).toContain("ghost is defined but unassigned");
    expect(warnings.join(" ")).not.toContain("ghost");
  });
});

describe("Wedding Crashers acceptance fixture (issue #693)", () => {
  it("reproduces the bug as reported: both scheme items export with empty ops", () => {
    const items = itemsOf(FIXTURE);
    expect(items.item2).toMatchObject({ kind: "scheme", label: "Wedding Cake", ops: [] });
    expect(items.item4).toMatchObject({ kind: "scheme", label: "Wedding Gifts", ops: [] });
  });

  it("importing it surfaces the blocking error state (not a silent warning)", () => {
    const { errors, warnings } = validateDoc(toMapDoc(FIXTURE));
    expect(errors).toEqual([
      expect.stringContaining("scheme item item2 needs non-empty ops"),
      expect.stringContaining("scheme item item4 needs non-empty ops"),
      // the map also never placed item4 on a space — dead content the engine
      // rejects just as hard, and which the old editor only whispered about
      expect.stringContaining("item item4 is defined but unassigned"),
    ]);
    expect(warnings.join(" ")).not.toContain("item4");
  });

  it("the empty-ops items reopen in the BUILDER, so they can be repaired from the menu", () => {
    const items = itemsOf(FIXTURE);
    expect(effectsFromOps(items.item2.ops)).toEqual([]); // empty builder, not advanced
    expect(effectsFromOps(items.item4.ops)).toEqual([]);
  });

  it("rebuilding both items from the menu produces a map the server accepts", () => {
    let doc = repaired();

    expect(validateDoc(doc).errors).toEqual([]);

    const items = itemsOf(toMapDef(doc));
    expect(items.item2.ops).toEqual([{ op: "heal", target: "SELF", amount: 2 }]);
    expect(items.item2.text).toBe("Recover 2 health.");
    expect(items.item4.ops).toEqual([{ op: "search", from: "DISCARD" }]);
    expect(items.item4.text).toBe("Return a card from your discard pile to your hand.");
    // combat items are untouched by any of this
    expect(items.item1).toEqual({ id: "item1", kind: "combat", label: "Rose Bouquet", value: 2 });
    expect(items.item3).toEqual({ id: "item3", kind: "combat", label: "Hand Gun", value: 1 });
  });

  it("round-trips: re-importing the export lands back in the builder, not raw JSON", () => {
    let doc = repaired();
    doc = authorEffects(doc, "item2", [{ kind: "heal", amount: 2 }, { kind: "draw", amount: 1 }]);

    const exported = toMapDef(doc);
    const reimported = toMapDoc(JSON.parse(JSON.stringify(exported)));
    const items = Object.fromEntries((reimported.items ?? []).map((i) => [i.id, i]));

    expect(effectsFromOps(items.item2.ops)).toEqual([
      { kind: "heal", amount: 2 },
      { kind: "draw", amount: 1 },
    ]);
    expect(effectsFromOps(items.item4.ops)).toEqual([{ kind: "search" }]);
    // and a second export is byte-identical — no drift on the way round
    expect(toMapDef(reimported)).toEqual(exported);
  });

  it("the committed catalog board IS what the builder emits (byte-for-byte)", () => {
    // The live pro-room check for #693 was driven off that file; this keeps it
    // honest against the export path rather than a hand-edited copy. Since #727
    // that file is also the shipped catalog board, so there is exactly one copy
    // and no second one to drift.
    expect(toMapDef(repaired())).toEqual(weddingCrashersRepaired);
    expect(weddingCrashersRepaired.meta.imageUrl).toBe(CATALOG_IMAGE_URL);
  });

  it("never exports an empty `text` key", () => {
    const doc = toMapDoc(FIXTURE); // scheme items still have ops: [] and no text
    const items = itemsOf(toMapDef(doc));
    expect("text" in items.item2).toBe(false);
    expect("text" in items.item1).toBe(false);
  });
});
