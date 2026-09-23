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
 *   public/figures/                       (git-ignored, NOT vercel-ignored)
 *     <heroId>.<seat>.webp, manifest.json
 *
 * `public/figures/` ships with the owner's own `vercel --prod` (the CLI
 * uploads the working tree) so friends see the figures live, and is absent
 * from every git checkout — where the app finds no manifest and keeps its
 * token standees. See lib/pro/figures.ts for the runtime side.
 *
 * figures.json:
 *   { "figures": [ { "heroId": "king-kong", "model": "models/king-kong.stl" },
 *                  { "heroId": "thrall", "model": "models/thrall.3mf", "az": 10 } ] }
 * Optional per figure: "elev" (camera elevation, default 40°), "az" (turn the
 * camera around the model, default 0 = its front), "footprintMm" (base width,
 * default measured from the model).
 *
 * WHY 40°. The board is tipped back 40°, so its spaces — and the seat-colored
 * base disc under a figure — are ellipses seen from 50° above. Rendered from
 * there the miniatures looked squat; from 30° their bases were so much flatter
 * than the disc that the disc's front half showed empty. 40° keeps the model's
 * base close to the disc's shape and the figure upright.
 *
 * Usage (needs a Playwright install; three.js comes from node_modules):
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *     node scripts/figures/render.cjs [~/Developer/unbrewed-figures]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install, e.g. PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright");
  process.exit(2);
}
const pw = require(PW_PATH);

const SOURCE = path.resolve(process.argv[2] || path.join(os.homedir(), "Developer", "unbrewed-figures"));
const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(REPO, "public", "figures");
// three.js is not a direct dependency; it arrives with another package. Fine
// for a local tool — if it ever disappears, `yarn add -D three` restores it.
const THREE_DIR = path.dirname(path.dirname(require.resolve("three", { paths: [REPO] })));

/**
 * A figure's tint per seat: the seat colors of TableBoard's PLAYER_COLOR
 * (p1 #E0A82E, p2 #3B8BEB, p3 #2F9E68, p4 #C0449E), pulled toward a painted
 * metal. The raw UI colors lit as plastic read as toys.
 */
const SEAT_TINTS = { p1: "#b8893a", p2: "#5a7fae", p3: "#4f8f6a", p4: "#a0578a" };

const HOST = "http://figures.local";
const mime = (f) => ({ ".html": "text/html", ".js": "text/javascript", ".stl": "model/stl", ".3mf": "model/3mf" })[path.extname(f)] ?? "application/octet-stream";

const readConfig = () => {
  const file = path.join(SOURCE, "figures.json");
  if (!fs.existsSync(file)) {
    console.error(`No ${file}. Create it — see the header of this script for the format.`);
    process.exit(2);
  }
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  const figures = Array.isArray(config.figures) ? config.figures : [];
  for (const f of figures) {
    if (!/^[a-z0-9-]+$/.test(f.heroId ?? "")) throw new Error(`bad heroId: ${JSON.stringify(f.heroId)}`);
    if (!fs.existsSync(path.join(SOURCE, f.model ?? ""))) throw new Error(`${f.heroId}: model not found: ${f.model}`);
  }
  return figures;
};

(async () => {
  const figures = readConfig();
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await pw.chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
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
    const q = new URLSearchParams({ model: `/model/${fig.model}`, tint, elev: String(fig.elev ?? 40), az: String(fig.az ?? 0) });
    if (fig.footprintMm) q.set("footprintMm", String(fig.footprintMm));
    await page.goto(`${HOST}/render.html?${q}`);
    await page.waitForFunction(() => window.__result, null, { timeout: 300000 });
    return page.evaluate(() => window.__result);
  };

  // The first frame of a fresh headless WebGL context comes back blank.
  if (figures[0]) await renderOne(figures[0], SEAT_TINTS.p1);

  const manifest = { version: 1, figures: {} };
  for (const fig of figures) {
    const seats = {};
    let geometry = null;
    for (const [seat, tint] of Object.entries(SEAT_TINTS)) {
      const r = await renderOne(fig, tint);
      const name = `${fig.heroId}.${seat}.webp`;
      fs.writeFileSync(path.join(OUT, name), Buffer.from(r.image.split(",")[1], "base64"));
      seats[seat] = name;
      geometry = { anchor: r.anchor, imageWidthMm: r.imageWidthMm, footprintMm: r.footprintMm, aspect: r.aspect };
    }
    manifest.figures[fig.heroId] = { ...geometry, seats };
    console.log(`${fig.heroId}: footprint ${geometry.footprintMm.toFixed(1)}mm, anchor ${geometry.anchor.x.toFixed(3)}/${geometry.anchor.y.toFixed(3)}`);
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${Object.keys(manifest.figures).length} figure(s) to ${path.relative(REPO, OUT)}/`);
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
