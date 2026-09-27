#!/usr/bin/env node
/**
 * Places a hero's minis for BOTH tabletop figure styles from one
 * mini-pipeline bundle, one command (unbrewed-p2p-965). Implements the hero
 * mini standard (~/git/unbrewed/.grove/hero-mini-standard/STANDARD.md §4-5):
 * nothing here is hand-edited.
 *
 *   node scripts/figures/add-hero-mini.cjs <path to mini-pipeline/out/<slug>/bundle> [--verify]
 *
 * The bundle (mini-pipeline `mini.py bundle`, ticket mini-006) is
 * `bundle.json` + `play.glb` + `sprite.glb` (STANDARD §2). This script:
 *
 *   1. Validates bundle.json: version 1, both files' sha256 match, and the
 *      gate fields (`license`, `redistributable: true`, `officialHero: false`
 *      plus the full attribution) pass the SAME clearance code the app and
 *      render.cjs use (clearance.cjs `openRenderBlockers`). A dropped entry
 *      exits non-zero and writes nothing — this check runs before any write.
 *   2. Upserts scripts/figures/figures-open.json for the id and every alias
 *      (`model: "<id>-meshy.glb"`).
 *   3. Renders the sprites from sprite.glb (staged as `<id>-meshy.glb` in a
 *      temp folder — never play.glb: render.html has no Meshopt/Draco
 *      decoder) via `render.cjs --open <temp> --only <id>`, which writes
 *      `public/figures-open/<id>.p1..p4.webp` and merges a manifest entry for
 *      `<id>` leaving every other entry byte-identical. Each alias gets its
 *      own manifest entry too, cloned from `<id>`'s — same `seats` filenames,
 *      so aliases share the canonical renders rather than duplicating them.
 *   4. Copies `play.glb` to `public/minis3d/<id>.play.glb` byte for byte, and
 *      upserts public/minis3d/manifest.json for `<id>` and every alias (all
 *      pointing `files.play` at the one canonical file).
 *   5. Upserts the public/figures-open/CREDITS.md row for `<id>`, listing the
 *      alias renders.
 *
 * Idempotent: running it twice on the same bundle changes no bytes (stable
 * key order, no timestamps).
 *
 * Needs PW_PATH (a Playwright install) for step 3 — see render.cjs's header.
 *
 * --verify drives a live dev server (PROBE_URL, default :3107) with
 * scripts/visual-probe/heroMiniVerify.cjs and writes crops of `<id>` and its
 * first alias in each figure style (3D minis / Minis / Tokens); it prints the
 * folder it wrote them to.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { openRenderBlockers, OPEN_LICENSE_DEEDS } = require("./clearance.cjs");
const { stripToolCredit } = require("./model-name.cjs");

const REPO = path.resolve(__dirname, "..", "..");
const FIGURES_OPEN_CONFIG = path.join(__dirname, "figures-open.json");
const FIGURES_OPEN_DIR = path.join(REPO, "public", "figures-open");
const MINIS3D_DIR = path.join(REPO, "public", "minis3d");
const CREDITS_FILE = path.join(FIGURES_OPEN_DIR, "CREDITS.md");

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, obj) => fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const isId = (v) => typeof v === "string" && /^[a-z0-9-]+$/.test(v);

const argv = process.argv.slice(2);
const VERIFY = argv.includes("--verify");
const bundleArg = argv.find((a) => !a.startsWith("--"));
if (!bundleArg) die("usage: node scripts/figures/add-hero-mini.cjs <path to bundle> [--verify]");
const BUNDLE_DIR = path.resolve(bundleArg);

// ---------------------------------------------------------------------
// 1. Validate bundle.json. Everything here runs BEFORE any write, so a
//    rejected bundle leaves the repo untouched.
// ---------------------------------------------------------------------
const bundleFile = path.join(BUNDLE_DIR, "bundle.json");
if (!fs.existsSync(bundleFile)) die(`no bundle.json in ${BUNDLE_DIR}`);
const bundle = readJson(bundleFile);

if (bundle.version !== 1) die(`bundle.json: expected version 1, got ${JSON.stringify(bundle.version)}`);
if (!isId(bundle.id)) die(`bundle.json: bad id ${JSON.stringify(bundle.id)}`);
const aliases = Array.isArray(bundle.aliases) ? bundle.aliases : [];
for (const a of aliases) if (!isId(a)) die(`bundle.json: bad alias ${JSON.stringify(a)}`);
if (!(typeof bundle.baseDiameter === "number" && bundle.baseDiameter > 0)) die("bundle.json: bad baseDiameter");
if (!bundle.files || typeof bundle.files.play !== "string" || typeof bundle.files.sprite !== "string")
  die("bundle.json: files.play / files.sprite missing");

const credit = bundle.credit && typeof bundle.credit === "object" ? bundle.credit : {};
// The bundle names its generation tool in modelName (STANDARD §2); that tool
// is not part of the player-facing attribution and must never reach it.
if (typeof credit.modelName === "string") credit.modelName = stripToolCredit(credit.modelName);
// The SAME clearance code the app (isCleared) and render.cjs use, flattened
// into the shape it checks — bundle.json nests license/attribution under
// `credit` (STANDARD §2), clearance.cjs reads them at the top level.
const gateEntry = {
  license: credit.license,
  redistributable: bundle.redistributable,
  officialHero: bundle.officialHero,
  modelName: credit.modelName,
  creator: credit.creator,
  sourceUrl: credit.sourceUrl,
};
const blockers = openRenderBlockers(gateEntry);
if (blockers.length > 0) die(`${bundle.id ?? BUNDLE_DIR}: not cleared (${blockers.join("; ")}) — wrote nothing`);

const playFile = path.join(BUNDLE_DIR, bundle.files.play);
const spriteFile = path.join(BUNDLE_DIR, bundle.files.sprite);
if (!fs.existsSync(playFile)) die(`bundle.json: files.play not found: ${bundle.files.play}`);
if (!fs.existsSync(spriteFile)) die(`bundle.json: files.sprite not found: ${bundle.files.sprite}`);

const declaredSha = bundle.sha256 && typeof bundle.sha256 === "object" ? bundle.sha256 : {};
for (const [name, abs] of [
  [bundle.files.play, playFile],
  [bundle.files.sprite, spriteFile],
]) {
  const want = declaredSha[name];
  if (typeof want !== "string") die(`bundle.json: no sha256 declared for ${name} — wrote nothing`);
  const got = sha256(abs);
  if (got !== want) die(`bundle.json: sha256 mismatch for ${name} (declared ${want}, file is ${got}) — wrote nothing`);
}

const id = bundle.id;
const allIds = [id, ...aliases];

// Everything above only reads; nothing is written until the bundle clears.
// Below this point we start writing, so check the render step's own
// prerequisite now rather than partway through.
const pwPath = process.env.PW_PATH;
if (!pwPath) die("Set PW_PATH to a playwright install, e.g. PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright");

// ---------------------------------------------------------------------
// 2. figures-open.json — one entry per id and alias.
// ---------------------------------------------------------------------
const openConfig = readJson(FIGURES_OPEN_CONFIG);
const openFigures = Array.isArray(openConfig.figures) ? openConfig.figures : [];
const upsertByHeroId = (arr, heroId, entry) => {
  const i = arr.findIndex((f) => f.heroId === heroId);
  if (i > -1) arr[i] = entry;
  else arr.push(entry);
};
for (const heroId of allIds) {
  upsertByHeroId(openFigures, heroId, {
    heroId,
    model: `${id}-meshy.glb`,
    license: credit.license,
    redistributable: bundle.redistributable,
    officialHero: bundle.officialHero,
    modelName: credit.modelName,
    creator: credit.creator,
    sourceUrl: credit.sourceUrl,
  });
}
openConfig.figures = openFigures;
writeJson(FIGURES_OPEN_CONFIG, openConfig);

// ---------------------------------------------------------------------
// 3. Render the sprites (canonical id only) and clone the manifest entry
//    into every alias.
// ---------------------------------------------------------------------
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "add-hero-mini-"));
try {
  fs.copyFileSync(spriteFile, path.join(stage, `${id}-meshy.glb`));
  execFileSync(process.execPath, [path.join(__dirname, "render.cjs"), "--open", stage, "--only", id], {
    stdio: "inherit",
    env: process.env,
  });
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}

const openManifestFile = path.join(FIGURES_OPEN_DIR, "manifest.json");
const openManifest = readJson(openManifestFile);
const canonicalSprite = openManifest.figures[id];
if (!canonicalSprite) die(`${id}: render.cjs produced no manifest entry (its own gate check disagrees with ours?)`);
for (const alias of aliases) openManifest.figures[alias] = { ...canonicalSprite };
writeJson(openManifestFile, openManifest);

// ---------------------------------------------------------------------
// 4. public/minis3d — one canonical play.glb, id + aliases share it.
// ---------------------------------------------------------------------
fs.mkdirSync(MINIS3D_DIR, { recursive: true });
const canonicalPlayName = `${id}.play.glb`;
fs.copyFileSync(playFile, path.join(MINIS3D_DIR, canonicalPlayName));

const minisManifestFile = path.join(MINIS3D_DIR, "manifest.json");
const minisManifest = fs.existsSync(minisManifestFile) ? readJson(minisManifestFile) : { version: 1, minis: {} };
minisManifest.version = 1;
minisManifest.minis = minisManifest.minis && typeof minisManifest.minis === "object" ? minisManifest.minis : {};
for (const heroId of allIds) {
  minisManifest.minis[heroId] = {
    files: { play: canonicalPlayName },
    defaultLod: "play",
    baseDiameter: bundle.baseDiameter,
    license: credit.license,
    redistributable: bundle.redistributable,
    officialHero: bundle.officialHero,
    modelName: credit.modelName,
    creator: credit.creator,
    sourceUrl: credit.sourceUrl,
  };
}
writeJson(minisManifestFile, minisManifest);

// ---------------------------------------------------------------------
// 5. CREDITS.md — one row per canonical id, listing the alias renders.
// ---------------------------------------------------------------------
const licenseCell = (license) => {
  const deed = OPEN_LICENSE_DEEDS[license];
  if (!deed) return license;
  const shortLabel = license === "CC0-1.0" ? "CC0 1.0" : license;
  const note = license === "CC0-1.0" ? "(public domain)" : "— these renders are shared under the same licence";
  return `[${shortLabel}](${deed}) ${note}`;
};

const upsertCredits = () => {
  const text = fs.readFileSync(CREDITS_FILE, "utf8");
  const lines = text.split("\n");
  const rendersCell = allIds.map((h) => `\`${h}.*.webp\``).join(", ");
  const row = `| ${rendersCell} | ${credit.modelName} | ${credit.creator} | ${licenseCell(credit.license)} | ${credit.sourceUrl} |`;
  const idx = lines.findIndex((l) => l.startsWith(`| \`${id}.`));
  if (idx > -1) {
    lines[idx] = row;
  } else {
    const sep = lines.findIndex((l) => l.startsWith("|---"));
    if (sep === -1) die("CREDITS.md: no table found to add a row to");
    let last = sep;
    while (last + 1 < lines.length && lines[last + 1].startsWith("|")) last++;
    lines.splice(last + 1, 0, row);
  }
  fs.writeFileSync(CREDITS_FILE, lines.join("\n"));
};
upsertCredits();

console.log(`${id}: placed (${aliases.length ? `aliases: ${aliases.join(", ")}` : "no aliases"})`);

// ---------------------------------------------------------------------
// --verify: live browser crops, canonical id + first alias, every style.
// ---------------------------------------------------------------------
if (VERIFY) {
  const verifyScript = path.join(REPO, "scripts", "visual-probe", "heroMiniVerify.cjs");
  execFileSync(process.execPath, [verifyScript, id, aliases[0] ?? id], {
    stdio: "inherit",
    env: process.env,
  });
}
