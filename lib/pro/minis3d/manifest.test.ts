import fs from "fs";
import path from "path";
import { mini3dFor, parseMini3dManifest, readMinis3dSwitch } from "./manifest";

const entry = (over: Record<string, unknown> = {}) => ({
  files: { "150k.draco": "kt.150k.draco.glb", "30k.meshopt": "kt.30k.meshopt.glb" },
  defaultVariant: "150k.draco",
  license: "CC0-1.0",
  redistributable: true,
  officialHero: false,
  modelName: "King Taranis (Meshy AI)",
  creator: "JollyGrin",
  sourceUrl: "https://unbrewed.xyz",
  ...over,
});
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

  test("drops file names that are not bare .glb names", () => {
    const m = parse(entry({ files: { a: "../x.glb", b: "x.png", c: "ok.glb" }, defaultVariant: "a" }));
    expect(m?.minis.kt?.files).toEqual({ c: "ok.glb" });
    expect(m?.minis.kt?.defaultVariant).toBe("c");
  });

  test("resolves a fighter's mini per seat and variant, falling back to the default", () => {
    const m = parse(entry());
    expect(mini3dFor(m, "kt", "p2", "30k.meshopt")).toMatchObject({ url: "/minis3d/kt.30k.meshopt.glb", codec: "meshopt", tint: "#5a7fae" });
    expect(mini3dFor(m, "kt", "p1", "nope")).toMatchObject({ url: "/minis3d/kt.150k.draco.glb", codec: "draco" });
    expect(mini3dFor(m, "other", "p1")).toBeNull();
    expect(mini3dFor(m, undefined, "p1")).toBeNull();
  });

  test("the dev switch is off unless ?minis3d=1", () => {
    expect(readMinis3dSwitch("")).toEqual({ on: false, variant: null });
    expect(readMinis3dSwitch("?minis3d=1&minis3dVariant=15k.draco")).toEqual({ on: true, variant: "15k.draco" });
  });

  test("every committed entry passes the gate and its files are committed beside it", () => {
    const dir = path.join(__dirname, "..", "..", "..", "public", "minis3d");
    const raw = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const parsed = parseMini3dManifest(raw);
    expect(Object.keys(parsed?.minis ?? {}).sort()).toEqual(Object.keys(raw.minis).sort());
    for (const e of Object.values(parsed!.minis)) for (const f of Object.values(e.files)) expect(fs.existsSync(path.join(dir, f))).toBe(true);
  });
});
