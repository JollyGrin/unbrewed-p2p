/**
 * The bundle gate for add-hero-mini.cjs (unbrewed-p2p-965): a bundle that
 * would not clear render.cjs's own gate (clearance.cjs `openRenderBlockers`)
 * must exit non-zero and change nothing in the repo — no partial write.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { stripToolCredit } = require("./model-name.cjs");

const REPO = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(__dirname, "add-hero-mini.cjs");
const TRACKED_FILES = [
  path.join(__dirname, "figures-open.json"),
  path.join(REPO, "public", "figures-open", "manifest.json"),
  path.join(REPO, "public", "figures-open", "CREDITS.md"),
  path.join(REPO, "public", "minis3d", "manifest.json"),
];

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** A minimal, otherwise-valid bundle: version 1, both files present with
 *  matching sha256, full credit + gate fields — overridden per test. */
const writeBundle = (dir, overrides = {}) => {
  fs.mkdirSync(dir, { recursive: true });
  const play = Buffer.from("not a real glb, just bytes for the gate test: play");
  const sprite = Buffer.from("not a real glb, just bytes for the gate test: sprite");
  fs.writeFileSync(path.join(dir, "play.glb"), play);
  fs.writeFileSync(path.join(dir, "sprite.glb"), sprite);
  const bundle = {
    version: 1,
    id: "test-mini-gate",
    aliases: [],
    name: "Test Mini",
    baseDiameter: 1,
    credit: {
      modelName: "Test Mini",
      creator: "JollyGrin",
      sourceUrl: "https://unbrewed.xyz",
      license: "CC0-1.0",
    },
    redistributable: true,
    officialHero: false,
    files: { play: "play.glb", sprite: "sprite.glb" },
    sha256: { "play.glb": sha256(path.join(dir, "play.glb")), "sprite.glb": sha256(path.join(dir, "sprite.glb")) },
    ...overrides,
  };
  fs.writeFileSync(path.join(dir, "bundle.json"), JSON.stringify(bundle, null, 2));
  return dir;
};

const snapshot = () => Object.fromEntries(TRACKED_FILES.map((f) => [f, fs.readFileSync(f, "utf8")]));

describe("add-hero-mini.cjs bundle gate", () => {
  let tmp;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "add-hero-mini-gate-"));
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test("a fully cleared bundle passes its own gate check (fails later, at the render step, with no PW_PATH)", () => {
    const dir = writeBundle(path.join(tmp, "ok"));
    const before = snapshot();
    const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8", env: { ...process.env, PW_PATH: "" } });
    // It gets past the gate (unlike the cases below) and only then fails,
    // for an unrelated reason (no PW_PATH here) — proving the gate itself
    // did not reject a clean bundle.
    expect(res.stderr).not.toMatch(/not cleared/);
    expect(res.stderr).toMatch(/PW_PATH/);
    expect(snapshot()).toEqual(before);
  });

  test("officialHero: true exits non-zero and writes nothing", () => {
    const dir = writeBundle(path.join(tmp, "official"), { officialHero: true });
    const before = snapshot();
    const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/not cleared/);
    expect(snapshot()).toEqual(before);
  });

  test("no license exits non-zero and writes nothing", () => {
    const dir = writeBundle(path.join(tmp, "no-license"));
    const bundleFile = path.join(dir, "bundle.json");
    const bundle = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
    delete bundle.credit.license;
    fs.writeFileSync(bundleFile, JSON.stringify(bundle, null, 2));
    const before = snapshot();
    const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/not cleared/);
    expect(snapshot()).toEqual(before);
  });

  test("a sha256 mismatch exits non-zero and writes nothing", () => {
    const dir = writeBundle(path.join(tmp, "bad-hash"));
    const bundleFile = path.join(dir, "bundle.json");
    const bundle = JSON.parse(fs.readFileSync(bundleFile, "utf8"));
    bundle.sha256["play.glb"] = "0".repeat(64);
    fs.writeFileSync(bundleFile, JSON.stringify(bundle, null, 2));
    const before = snapshot();
    const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/sha256 mismatch/);
    expect(snapshot()).toEqual(before);
  });
});

describe("stripToolCredit", () => {
  test("strips a trailing tool-credit parenthetical", () => {
    expect(stripToolCredit("King Taranis (Meshy AI)")).toBe("King Taranis");
    expect(stripToolCredit("Hollow Oak (Meshy AI)")).toBe("Hollow Oak");
  });

  test("leaves a name without one untouched", () => {
    expect(stripToolCredit("King Taranis")).toBe("King Taranis");
  });
});
