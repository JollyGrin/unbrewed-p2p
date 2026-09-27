import fs from "fs";
import path from "path";
import { mini3dFor, parseMini3dManifest, readMinis3dDevParams } from "./manifest";

const entry = (over: Record<string, unknown> = {}) => ({
  files: { "30k": "kt.30k.meshopt.glb", "15k": "kt.15k.meshopt.glb" },
  defaultLod: "30k",
  license: "CC0-1.0",
  redistributable: true,
  officialHero: false,
  modelName: "King Taranis (Meshy AI)",
  creator: "JollyGrin",
  sourceUrl: "https://unbrewed.xyz",
  ...over,
});
/**
 * The mini pipeline's Stage D contract, read from the GLB's own JSON chunk:
 * Meshopt + quantized (no Draco), base on y = 0, footprint ~1 unit centred on
 * x/z = 0 — so the renderer draws it as authored (lib/pro/minis3d/model.ts).
 *
 * The pipeline (mini-002/mini-003) normalises the BASE footprint — the
 * enclosing circle of the bottom slice — to 1.0, not the whole model's
 * bounding box. A model may legitimately overhang its base (a wide tree
 * canopy, spread wings, …), so the upper bound here is a sanity check
 * against an un-normalised mesh, not a tight footprint check; the actual
 * footprint is the manifest entry's own `baseDiameter`.
 */
const expectPipelineNormalised = (glb: Buffer) => {
  expect(glb.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  expect(json.extensionsRequired).toEqual(expect.arrayContaining(["EXT_meshopt_compression", "KHR_mesh_quantization"]));
  expect(json.extensionsUsed).not.toContain("KHR_draco_mesh_compression");
  for (const n of json.nodes.filter((n: { mesh?: number }) => n.mesh !== undefined)) {
    const s: number[] = n.scale ?? [1, 1, 1], t: number[] = n.translation ?? [0, 0, 0];
    for (const prim of json.meshes[n.mesh].primitives) {
      const acc = json.accessors[prim.attributes.POSITION];
      const q = acc.normalized ? (acc.componentType === 5122 ? 32767 : acc.componentType === 5120 ? 127 : 1) : 1;
      const lo = acc.min.map((v: number, k: number) => (Math.max(v / q, -1)) * s[k] + t[k]);
      const hi = acc.max.map((v: number, k: number) => (v / q) * s[k] + t[k]);
      expect(lo[1]).toBeCloseTo(0, 3); // base on the ground
      for (const k of [0, 2]) {
        expect(Math.abs(lo[k] + hi[k]) / 2).toBeLessThan(0.05); // centred on the footprint
        expect(hi[k] - lo[k]).toBeGreaterThan(0.9); // at least base-sized
        expect(hi[k] - lo[k]).toBeLessThan(1.5); // sanity bound, not a footprint check — overhang beyond the base is allowed
      }
    }
  }
};

const parse = (e: unknown) => parseMini3dManifest({ version: 1, minis: { kt: e } });

describe("the 3D minis manifest", () => {
  test("a cleared, credited entry survives", () => {
    expect(parse(entry())?.minis.kt?.credit.creator).toBe("JollyGrin");
  });

  test.each([
    ["an official hero", { officialHero: true }],
    ["a model that may not be redistributed", { redistributable: false }],
    ["an entry without a licence", { license: "" }],
    ["an entry without its credit", { creator: "" }],
    ["a licence the app cannot link", { license: "LicenseRef-Custom" }],
  ])("drops %s (same gate as the sprite sets)", (_, over) => {
    expect(parse(entry(over))?.minis.kt).toBeUndefined();
  });

  test("baseDiameter: 1.0 when absent or unusable, else the entry's own value", () => {
    expect(parse(entry())?.minis.kt?.baseDiameter).toBe(1);
    expect(mini3dFor(parse(entry()), "kt", "p1")?.baseDiameter).toBe(1);
    expect(parse(entry({ baseDiameter: 0.9672 }))?.minis.kt?.baseDiameter).toBe(0.9672);
    expect(mini3dFor(parse(entry({ baseDiameter: 0.9672 })), "kt", "p1")?.baseDiameter).toBe(0.9672);
    for (const bad of [0, -1, "0.9", NaN, Infinity, 50]) expect(parse(entry({ baseDiameter: bad }))?.minis.kt?.baseDiameter).toBe(1);
  });

  test("drops file names that are not bare .glb names", () => {
    const m = parse(entry({ files: { a: "../x.glb", b: "x.png", c: "ok.glb" }, defaultLod: "a" }));
    expect(m?.minis.kt?.files).toEqual({ c: "ok.glb" });
    expect(m?.minis.kt?.defaultLod).toBe("c");
  });

  test("resolves a fighter's mini per seat and detail level, falling back to the default", () => {
    const m = parse(entry());
    expect(mini3dFor(m, "kt", "p2", "15k")).toMatchObject({ id: "kt@15k", url: "/minis3d/kt.15k.meshopt.glb", tint: "#5a7fae" });
    expect(mini3dFor(m, "kt", "p1", "nope")).toMatchObject({ id: "kt@30k", url: "/minis3d/kt.30k.meshopt.glb" });
    expect(mini3dFor(m, "other", "p1")).toBeNull();
    expect(mini3dFor(m, undefined, "p1")).toBeNull();
  });

  test("inherited keys never resolve: a mini id or detail level like 'constructor'", () => {
    const m = parse(entry());
    for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty"]) expect(mini3dFor(m, id, "p1")).toBeNull();
    // An unknown detail level falls back to the default, never Object.prototype's.
    for (const lod of ["constructor", "toString", "__proto__"]) expect(mini3dFor(m, "kt", "p1", lod)?.url).toBe("/minis3d/kt.30k.meshopt.glb");
    expect(parse(entry({ defaultLod: "constructor" }))?.minis.kt?.defaultLod).toBe("30k");
  });

  test("dev params: 3D is no longer switched on from the URL, only tooling extras are read", () => {
    expect(readMinis3dDevParams("")).toEqual({ probe: false, lod: null, maxPixelRatio: null });
    expect(readMinis3dDevParams("?minis3d=1")).toEqual({ probe: false, lod: null, maxPixelRatio: null });
    expect(readMinis3dDevParams("?minis3dProbe=1&minis3dLod=15k&minis3dDpr=3")).toEqual({ probe: true, lod: "15k", maxPixelRatio: 3 });
    expect(readMinis3dDevParams("?minis3dDpr=99").maxPixelRatio).toBeNull();
  });

  describe("the painted variant (`paint`)", () => {
    const paint = (over: Record<string, unknown> = {}) =>
      entry({ paint: { ...entry({ files: { play: "kt.painted.glb" }, defaultLod: "play" }), ...over } });

    test("an entry without `paint` is unpainted only: asking for painted is null, never a silent swap", () => {
      const m = parse(entry());
      expect(m?.minis.kt?.paint).toBeUndefined();
      expect(mini3dFor(m, "kt", "p1")).toMatchObject({ variant: "unpainted" });
      expect(mini3dFor(m, "kt", "p1", null, "painted")).toBeNull();
    });

    test("a cleared paint entry resolves to its own file and credit; the mesh's base is shared", () => {
      const m = parse({ ...paint({ creator: "A Painter" }), baseDiameter: 0.9 });
      expect(mini3dFor(m, "kt", "p2", null, "painted")).toMatchObject({
        id: "kt+painted@play",
        url: "/minis3d/kt.painted.glb",
        variant: "painted",
        baseDiameter: 0.9,
        credit: { creator: "A Painter" },
      });
      // The unpainted mini is untouched by it.
      expect(mini3dFor(m, "kt", "p2")).toMatchObject({ id: "kt@30k", variant: "unpainted", credit: { creator: "JollyGrin" } });
    });

    test.each([
      ["not an object", "kt.painted.glb"],
      ["uncleared (official hero)", { officialHero: true }],
      ["not redistributable", { redistributable: false }],
      ["without its credit", { sourceUrl: "http://insecure" }],
      ["a licence the app cannot link", { license: "LicenseRef-Custom" }],
      ["no usable file", { files: { play: "../x.glb" } }],
    ])("drops a paint entry that is %s — fail closed, the mini stays", (_, over) => {
      const e = typeof over === "string" ? entry({ paint: over }) : paint(over);
      const m = parse(e);
      expect(m?.minis.kt).toBeDefined();
      expect(m?.minis.kt?.paint).toBeUndefined();
      expect(mini3dFor(m, "kt", "p1", null, "painted")).toBeNull();
    });
  });

  test("every committed entry passes the gate, ships ONE play-tier file, and that file is committed beside it", () => {
    const dir = path.join(__dirname, "..", "..", "..", "public", "minis3d");
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const parsed = parseMini3dManifest(raw);
    expect(Object.keys(parsed?.minis ?? {}).sort()).toEqual(Object.keys(raw.minis).sort());
    for (const e of Object.values(parsed!.minis)) {
      expect(Object.values(e.files)).toHaveLength(1);
      for (const f of Object.values(e.files)) {
        expect(f).toMatch(/\.play\.glb$/);
        expect(fs.existsSync(path.join(dir, f))).toBe(true);
        expectPipelineNormalised(fs.readFileSync(path.join(dir, f)));
      }
    }
    // Nothing but the manifest and the files it names (no stray variants).
    const named = new Set(Object.values(parsed!.minis).flatMap((e) => Object.values(e.files)));
    expect(fs.readdirSync(dir).filter((f) => f !== "manifest.json" && !named.has(f))).toEqual([]);
  });
});
