/**
 * 3D minis (#931 spike, kept as tooling by #945) — MEASURING script for the
 * 3D mini path behind `?minis3d=1`. Not a test; it prints JSON and writes
 * crops. Needs a DEV server: the probe pieces come from TableMini3dProbe,
 * which production builds leave out.
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:3107 \
 *     node scripts/visual-probe/tableMini3d.cjs <mode> [--out dir]
 *
 * Modes:
 *   match   sprite vs 3D mini on the near-left, near-right, far-left,
 *           far-right and centre spaces: crops + base-ellipse measurements.
 *   perf    iPhone 14 landscape + 4x CPU throttle (CDP): per-mini render ms
 *           and frame times during a move tween with 2/4/8 minis, per LOD.
 *   rest    frame trace at rest vs during a tween: scheduler frames, GL draw
 *           calls and rAF callbacks (the "zero GPU work at rest" proof).
 *   decode  per-LOD fetch + decode ms on the throttled profile.
 *   fail    --disable-webgl and WEBGL_lose_context: what the board shows.
 *   lod     the mini at each PROBE_LODS detail level, cropped at play size.
 *   dpr     the five reference crops at pixel-ratio cap 2 vs 3.
 *
 *   smoke   one screenshot + the renderer's stats.
 *
 * Env: PROBE_ARGS = extra Chromium flags. Headless Chromium has NO WebGL by
 * default; "--use-angle=metal --enable-gpu --ignore-gpu-blocklist" gives it the
 * Mac's GPU, "--use-angle=swiftshader --enable-unsafe-swiftshader" software GL.
 * PROBE_SYNC=1 (perf) waits for the GPU after each render. PROBE_LODS is a
 * comma list of manifest detail levels (default "play", the only committed
 * one; other levels need local files the manifest names). PROBE_HEADED=1 shows the
 * browser. Needs a dev server (PROBE_URL, default :3107) — a stale one after a
 * rebase serves old modules: restart it.
 */
const path = require("path");
const fs = require("fs");

const pw = require(process.env.PW_PATH);
const MODE = process.argv[2] || "match";
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : path.join(require("os").tmpdir(), "table-mini3d");
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PROBE_URL || "http://localhost:3107";
const MAP = process.env.PROBE_MAP || "Secluded Temple";
const LODS = (process.env.PROBE_LODS || "play").split(",");

const launch = async (extraArgs = []) => {
  const browser = await pw.chromium.launch({ headless: !process.env.PROBE_HEADED, args: extraArgs });
  const ctx = await browser.newContext({ ...pw.devices["iPhone 14 landscape"] });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("pro-board-view", "table");
      localStorage.setItem("pro-figure-style", "open");
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => /minis3d/.test(m.text()) && console.error("[console]", m.text()));
  return { browser, ctx, page };
};

/** Lobby → King Taranis vs AI on one fixed map → tabletop, view reset. */
const startGame = async (page, query) => {
  await page.goto(`${BASE}/pro/game?${query}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: "AI·E", exact: true }).tap();
  await page.getByRole("button", { name: /^King Taranis by/ }).first().tap();
  const stage = page.getByRole("button", { name: MAP, exact: true });
  if (!(await stage.count())) {
    const more = page.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await more.first().tap();
  }
  await stage.first().tap();
  await page.getByRole("button", { name: "PLAY VS AI" }).tap();
  await page.waitForSelector("[data-table-stage-plane]", { timeout: 60000 });
  await page.waitForTimeout(4000);
  const keep = page.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await keep.first().tap().catch(() => {});
  await page.waitForTimeout(1500);
  const reset = page.getByRole("button", { name: /reset view/i });
  if (await reset.count()) await reset.first().evaluate((el) => el.click());
  await page.waitForTimeout(1200);
};

/** The five reference spaces: extremes of the main board by position. */
const referenceSpaces = (page) =>
  page.evaluate(() => {
    const plane = document.querySelector("[data-table-stage-plane]");
    const spaces = [...plane.querySelectorAll("[data-space-id]")]
      .filter((el) => !el.closest("[data-fighter-base]") && !el.hasAttribute("data-fighter-base"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-space-id"), cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width };
      })
      .filter((s) => s.w > 2);
    // Spaces a real fighter stands on are left out: its own base would hide the probe's.
    const taken = new Set([...plane.querySelectorAll("[data-fighter-base][data-space-id]")].map((el) => el.getAttribute("data-space-id")));
    const uniq = [...new Map(spaces.filter((s) => !taken.has(s.id)).map((s) => [s.id, s])).values()];
    const ys = uniq.map((s) => s.cy), xs = uniq.map((s) => s.cx);
    const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
    const pick = (fx, fy) =>
      uniq.reduce((best, s) => {
        const d = Math.hypot((s.cx - (x0 + (x1 - x0) * fx)) / (x1 - x0), (s.cy - (y0 + (y1 - y0) * fy)) / (y1 - y0));
        return !best || d < best.d ? { ...s, d } : best;
      }, null).id;
    return { nearLeft: pick(0, 1), nearRight: pick(1, 1), farLeft: pick(0, 0), farRight: pick(1, 0), centre: pick(0.5, 0.5), all: uniq.map((s) => s.id) };
  });

const probe = (page, pieces) =>
  page.evaluate((p) => window.dispatchEvent(new CustomEvent("table-mini3d-probe", { detail: { pieces: p } })), pieces);

module.exports = { launch, startGame, referenceSpaces, probe, OUT, LODS, BASE };

if (require.main === module) {
  require(path.join(__dirname, "tableMini3d", `${MODE}.cjs`))().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
