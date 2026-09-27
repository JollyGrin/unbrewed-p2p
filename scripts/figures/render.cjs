/**
 * Renders hero miniatures for the tabletop view from the owner's 3D models.
 *
 * WHY THE FILES LIVE WHERE THEY LIVE. Most heroes are official Unmatched
 * characters, and their models and renders must never be committed — not to
 * this repo, not to the public PR fork, not to anything the upstream author
 * receives. So:
 *
 *   ~/Developer/unbrewed-figures/         (outside the repo; the owner's)
 *     figures.json                        which hero uses which model
 *     models/*.stl | *.3mf
 *
 *   public/figures/                       (git-ignored AND vercel-ignored)
 *     <heroId>.<seat>.webp, manifest.json
 *
 * `public/figures/` is absent from every git checkout and, via .vercelignore,
 * from every ordinary deploy — where the app finds no manifest and keeps its
 * token standees. See lib/pro/figures.ts for the runtime side.
 *
 * THE LICENCE GATE (unbrewed-p2p-879). An entry is rendered only when it
 * declares a licence that allows redistribution and a hero that is not
 * official (scripts/figures/clearance.cjs). Anything else is skipped, its old
 * renders are deleted, and it is left out of manifest.json. Fail closed.
 *
 * figures.json:
 *   { "figures": [ { "heroId": "king-kong", "model": "models/king-kong.stl",
 *                    "license": "CC-BY-4.0", "redistributable": true, "officialHero": false } ] }
 * Optional per figure: "elev" (camera elevation, default 90° − the board's tilt), "az" (turn the
 * camera around the model, default 0 = its front), "footprintMm" (base width,
 * default measured from the model).
 *
 * WHY 90° − THE BOARD'S TILT (unbrewed-p2p-926). The board is tipped back
 * DEFAULT_TILT_DEG (40°) from facing the camera, so its spaces — and the
 * seat-colored base disc under a figure — are seen from 50° above the ground,
 * as ellipses cos 40° ≈ 0.77 tall. `elev` is measured up from the ground, so
 * only elev = 90 − tilt = 50° draws the model's own base as that same
 * ellipse. The renders used to be taken from elev 40° (the tilt's number, the
 * complementary angle): their bases came out sin 40° ≈ 0.64 tall, ~16%
 * flatter than the disc they stand on. From 50° a model shows more of its top
 * and reads a little shorter. That is the board's real camera; if it looks
 * squat, lower the board's tilt — do not move this angle off it.
 * The default comes from the constant itself (camera.cjs), and each
 * manifest entry records the angle it was rendered from (`elevDeg`): the app
 * lays the front of the base on the board by it (figureGroundSlice).
 *
 * THE OPEN SET (unbrewed-p2p-903). `--open` renders the second, committed
 * set instead: open-licence models (CC0 / CC-BY / CC-BY-SA) whose renders may
 * be redistributed. Its config is `scripts/figures/figures-open.json` (in the
 * repo); its models are read from the given folder (NOT in the repo — see
 * scripts/figures/README.md for where each one comes from); its output is
 * `public/figures-open/`, which IS committed and deployed. Every open entry
 * must also carry its attribution (`modelName`, `creator`, `sourceUrl`) —
 * CC-BY requires the credit the app shows. The same clearance applies: an
 * entry missing any field is not rendered, and the app drops it too.
 *
 * Usage (needs a Playwright install; three.js comes from node_modules):
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *     node scripts/figures/render.cjs [~/Developer/unbrewed-figures]
 *   PW_PATH=... node scripts/figures/render.cjs --open <folder with the open models>
 *
 * Models may be STL, 3MF or glTF (.glb/.gltf). Optional per figure: "mesh"
 * (glTF only — render just the meshes whose name contains it), "rx" / "rz"
 * (stand a model up that was not published upright, degrees).
 *
 * `--only <heroId>` (unbrewed-p2p-965) renders just that one config entry —
 * the source folder need not hold every other entry's model — and MERGES the
 * result into the existing manifest.json instead of overwriting it: every
 * other entry comes out byte-identical. If the entry is not cleared, its
 * renders are removed and its key is dropped from the manifest, same as a
 * whole-set run; nothing else in the manifest is touched either way. Used by
 * `add-hero-mini.cjs`, which stages one bundle's sprite.glb as the entry's
 * `model` in a temp folder and calls this with it.
 */
const fs = require("fs");
const { clearanceBlockers, openRenderBlockers } = require("./clearance.cjs");
const { defaultElevDeg } = require("./camera.cjs");
const { figureBounds } = require("./bounds.cjs");
const path = require("path");
const os = require("os");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install, e.g. PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright");
  process.exit(2);
}
const pw = require(PW_PATH);

const argv = process.argv.slice(2);
const OPEN = argv.includes("--open");
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx > -1 ? argv[onlyIdx + 1] : null;
const sourceArg = argv.find((a, i) => !a.startsWith("--") && i !== onlyIdx + 1);
if (OPEN && !sourceArg) {
  console.error("--open needs the folder holding the open models (they are not in the repo).");
  process.exit(2);
}
const SOURCE = path.resolve(sourceArg || path.join(os.homedir(), "Developer", "unbrewed-figures"));
const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "public", OPEN ? "figures-open" : "figures");
const CONFIG = OPEN ? path.join(__dirname, "figures-open.json") : path.join(SOURCE, "figures.json");
/** What each manifest entry carries besides its geometry and seats. */
const DECLARED = OPEN
  ? ["license", "redistributable", "officialHero", "modelName", "creator", "sourceUrl"]
  : ["license", "redistributable", "officialHero"];
// three.js is not a direct dependency; it arrives with another package. Fine
// for a local tool — if it ever disappears, `yarn add -D three` restores it.
const THREE_DIR = path.dirname(path.dirname(require.resolve("three", { paths: [REPO] })));

/** Camera elevation above the ground, degrees: 90 − the board's tilt. */
const DEFAULT_ELEV = defaultElevDeg();

/**
 * A figure's tint per seat: the seat colors of TableBoard's PLAYER_COLOR
 * (p1 #E0A82E, p2 #3B8BEB, p3 #2F9E68, p4 #C0449E), pulled toward a painted
 * metal. The raw UI colors lit as plastic read as toys.
 */
const SEAT_TINTS = { p1: "#b8893a", p2: "#5a7fae", p3: "#4f8f6a", p4: "#a0578a" };

const HOST = "http://figures.local";
const mime = (f) =>
  ({ ".html": "text/html", ".js": "text/javascript", ".stl": "model/stl", ".3mf": "model/3mf", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json" })[
    path.extname(f)
  ] ?? "application/octet-stream";

const readConfig = () => {
  const file = CONFIG;
  if (!fs.existsSync(file)) {
    console.error(`No ${file}. Create it — see the header of this script for the format.`);
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const allFigures = Array.isArray(config.figures) ? config.figures : [];
  const figures = ONLY ? allFigures.filter((f) => f.heroId === ONLY) : allFigures;
  if (ONLY && figures.length === 0) {
    console.error(`--only ${ONLY}: no such heroId in ${file}`);
    process.exit(2);
  }
  const cleared = [];
  for (const f of figures) {
    if (!/^[a-z0-9-]+$/.test(f.heroId ?? "")) throw new Error(`bad heroId: ${JSON.stringify(f.heroId)}`);
    const blockers = OPEN ? openRenderBlockers(f) : clearanceBlockers(f);
    if (blockers.length > 0) {
      console.warn(`${f.heroId}: skipped, not cleared (${blockers.join("; ")})`);
      // A render left over from before the gate must not outlive it.
      for (const seat of Object.keys(SEAT_TINTS)) fs.rmSync(path.join(OUT, `${f.heroId}.${seat}.webp`), { force: true });
      continue;
    }
    if (!fs.existsSync(path.join(SOURCE, f.model ?? ""))) throw new Error(`${f.heroId}: model not found: ${f.model}`);
    cleared.push(f);
  }
  return cleared;
};

const MANIFEST_FILE = path.join(OUT, "manifest.json");
const readManifest = () =>
  fs.existsSync(MANIFEST_FILE) ? JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")) : { version: 1, figures: {} };
const writeManifest = (m) => fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(m, null, 2)}\n`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const figures = readConfig();
  if (figures.length === 0) {
    if (ONLY) {
      // Not cleared (or gone from the config): drop just this key, leaving
      // every other manifest entry byte-identical.
      const existing = readManifest();
      if (Object.prototype.hasOwnProperty.call(existing.figures, ONLY)) {
        delete existing.figures[ONLY];
        writeManifest(existing);
      }
      console.log(`${ONLY}: not cleared, left out of ${path.relative(REPO, MANIFEST_FILE)}`);
      return;
    }
    // Still overwrite the manifest, so no earlier entry outlives the gate.
    writeManifest({ version: 1, figures: {} });
    console.log(`no cleared figures: wrote an empty manifest to ${path.relative(REPO, OUT)}/`);
    return;
  }
  const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("[page]", e.message));
  // Serve the page, three.js and the models from disk without a web server.
  await page.route(`${HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    const rel = decodeURIComponent(url.pathname);
    const file = rel.startsWith("/three/")
      ? path.join(THREE_DIR, rel.slice("/three/".length))
      : rel.startsWith("/model/")
        ? path.join(SOURCE, rel.slice("/model/".length))
        : path.join(__dirname, path.basename(rel));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: mime(file), body: fs.readFileSync(file) });
  });

  const renderOne = async (fig, tint) => {
    const q = new URLSearchParams({ model: `/model/${fig.model}`, tint, elev: String(fig.elev ?? DEFAULT_ELEV), az: String(fig.az ?? 0) });
    if (fig.footprintMm) q.set("footprintMm", String(fig.footprintMm));
    if (fig.mesh) q.set("mesh", fig.mesh);
    for (const k of ["rx", "rz"]) if (fig[k]) q.set(k, String(fig[k]));
    await page.goto(`${HOST}/render.html?${q}`);
    await page.waitForFunction(() => window.__result, null, { timeout: 300000 });
    return page.evaluate(() => window.__result);
  };

  // The first frame of a fresh headless WebGL context comes back blank.
  if (figures[0]) await renderOne(figures[0], SEAT_TINTS.p1);

  const manifest = ONLY ? readManifest() : { version: 1, figures: {} };
  manifest.version = 1;
  for (const fig of figures) {
    const seats = {};
    let geometry = null;
    for (const [seat, tint] of Object.entries(SEAT_TINTS)) {
      const r = await renderOne(fig, tint);
      const name = `${fig.heroId}.${seat}.webp`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.image.split(",")[1], "base64"));
      seats[seat] = name;
      geometry = { anchor: r.anchor, imageWidthMm: r.imageWidthMm, footprintMm: r.footprintMm, aspect: r.aspect, elevDeg: fig.elev ?? DEFAULT_ELEV };
    }
    // Where the model's visible pixels are in the frame — what the tabletop
    // hangs its badges off (bounds.cjs).
    const bounds = await figureBounds(Object.values(seats).map((name) => path.join(OUT, name)));
    // Belt and braces: the app re-checks these fields and drops the entry
    // without them (lib/pro/figures.ts).
    const declared = Object.fromEntries(DECLARED.filter((k) => fig[k] !== undefined).map((k) => [k, fig[k]]));
    manifest.figures[fig.heroId] = { ...geometry, ...(bounds ? { bounds } : {}), seats, ...declared };
    console.log(`${fig.heroId}: footprint ${geometry.footprintMm.toFixed(1)}mm, anchor ${geometry.anchor.x.toFixed(3)}/${geometry.anchor.y.toFixed(3)}`);
  }
  writeManifest(manifest);
  console.log(`wrote ${Object.keys(manifest.figures).length} figure(s) to ${path.relative(REPO, OUT)}/`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
