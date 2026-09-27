/**
 * 3D minis — high-resolution reference crops (#963 2026-09-28 follow-up).
 *
 * Dean's own reference screenshots (dean-2026-09-28-base.png,
 * dean-2026-09-28-playsize.png) are desktop Chrome on a MacBook Pro 14"
 * (viewport ~1512x945 CSS, deviceScaleFactor 2), tabletop mode, board
 * lightly zoomed — NOT the iPhone 14 emulation the rest of this probe suite
 * uses for perf numbers. That mismatch (a DPR-3 phone context, whose mini
 * canvas is capped at MINIS3D_MAX_PIXEL_RATIO=2 — i.e. BELOW the phone's
 * true 3x pixel density) was why an earlier revision's crops came out
 * visibly blockier than what Dean sees live: the canvas's own WebGL texture
 * (~2x CSS) was being stretched by the browser to fill the screenshot's
 * full 3x-CSS device-pixel footprint. On a real DPR-2 desktop the cap and
 * the true device ratio are the SAME, so the canvas renders at its exact
 * display size — no stretch, no resampling. This mode launches its own
 * DESKTOP context (not `launch()` from tableMini3d.cjs) for exactly that
 * reason; the iPhone-emulation probes (decode/perf/lod/zoom) are unaffected
 * and keep using phone emulation, which is correct for THEIR purpose
 * (measuring the throttled-phone profile).
 *
 * Captures ONE real, never-resampled crop per id at two framings:
 *   - "close": the board's own (small) zoom-in, mini ~250-350 CSS px /
 *     ~500-700 device px tall — matches dean-2026-09-28-base.png.
 *   - "play": the default (unzoomed) board view with neighbouring tokens —
 *     matches dean-2026-09-28-playsize.png.
 * Same probe piece, same seat (p1), same tint throughout. Reuses
 * compare.cjs's candidate staging (so a material-variant id like
 * "C0-nonormals-rough80" gets its own local manifest entry + probe-only
 * material override, never touching git).
 *
 *   HIRES_IDS=C0,C0-nonormals-rough80,C0-nonormals-rough65,C2-45-budget \
 *   HIRES_OUT=~/git/unbrewed/.grove/mini-mesh-quality/compare \
 *   PW_PATH=... PROBE_URL=http://localhost:PORT \
 *   PROBE_ARGS="--use-angle=metal --enable-gpu --ignore-gpu-blocklist" \
 *     node scripts/visual-probe/tableMini3d.cjs hires
 *
 * Writes hires-<id>-close.png, hires-<id>-play.png per id (RAW screenshot
 * clips — no sharp resize at all), plus one 4-up hires-sheet.png (rows =
 * play/close, columns = id; each cell downscale-only, never enlarged), and
 * prints the §1-style diagnostic numbers (devicePixelRatio, canvas backing
 * vs CSS) to stdout for RESULTS.md.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const sharp = require("sharp");
const pw = require(process.env.PW_PATH);
const { startGame, referenceSpaces, probe } = require("../tableMini3d.cjs");
const compareMode = require("./compare.cjs");
const { MATERIAL_VARIANTS, stageManifest } = compareMode;

const IDS = (process.env.HIRES_IDS || "C0,C0-nonormals-rough80,C0-nonormals-rough65,C2-45-budget").split(",");
const OUT = process.env.HIRES_OUT || path.join(os.homedir(), "git", "unbrewed", ".grove", "mini-mesh-quality", "compare");
fs.mkdirSync(OUT, { recursive: true });
const PROBE_ARGS = (process.env.PROBE_ARGS || "").split(" ").filter(Boolean);
const MINI_ID = compareMode.MINI_ID;

/** MacBook Pro 14" desktop Chrome — matches Dean's own screenshots. NOT
 *  `launch()` from tableMini3d.cjs, which is iPhone-14-landscape emulated
 *  (deviceScaleFactor 3, and the mini canvas is capped at 2x CSS regardless
 *  — see the header). isMobile:false keeps the real desktop CSS breakpoints
 *  (not the mobile layout); hasTouch:true only so this file can still drive
 *  the UI with the shared `startGame`'s `.tap()` calls. */
const launchDesktop = async (extraArgs = []) => {
  const browser = await pw.chromium.launch({ headless: !process.env.PROBE_HEADED, args: extraArgs });
  const ctx = await browser.newContext({
    viewport: { width: 1512, height: 945 },
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("pro-board-view", "table");
      localStorage.setItem("pro-figure-style", "3d");
    } catch {}
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => /minis3d/.test(m.text()) && console.error("[console]", m.text()));
  return { browser, page };
};

const lodFor = (id) => (id === "C0" ? "play" : id);

/** Real, file-backed candidates that must be staged: any id that isn't
 *  "C0" and isn't itself a material variant, plus the baseId behind any
 *  material variant in IDS (stageManifest auto-stages every variant of a
 *  staged baseId — see compare.cjs). */
const fileIdsToStage = () => {
  const set = new Set();
  for (const id of IDS) {
    if (id === "C0") continue;
    const v = MATERIAL_VARIANTS[id];
    set.add(v ? v.baseId : id);
  }
  return [...set];
};

const canvasInfo = (page, ownerSelector) =>
  page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const r = c?.getBoundingClientRect();
    return r
      ? {
          x: r.left,
          y: r.top,
          cssW: r.width,
          cssH: r.height,
          backingW: c.width,
          backingH: c.height,
          devicePixelRatio: window.devicePixelRatio,
        }
      : null;
  }, ownerSelector);

module.exports = async () => {
  const restore = stageManifest(fileIdsToStage());
  process.on("exit", restore);
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });

  const OWNER = '[data-badge-owner="probe-0"] [data-mini3d-canvas]';
  const files = {};
  const diagnostics = {};
  try {
    const { browser, page } = await launchDesktop(PROBE_ARGS);
    await startGame(page, "minis3dProbe=1");
    await page.addStyleTag({ content: "[data-badge-owner^='probe'] [data-standee-badges]{display:none!important}" });
    const { nearLeft } = await referenceSpaces(page);

    const place = async (id) => {
      await page.evaluate((o) => window.__minis3d?.setMaterialOverride?.(o), MATERIAL_VARIANTS[id] ?? null);
      await probe(page, [{ space: nearLeft, mode: "3d", seat: "p1", miniId: MINI_ID, lod: lodFor(id) }]);
    };

    // Diagnostics (#963 review, 1): devicePixelRatio, canvas backing vs CSS,
    // BEFORE any board zoom (the app's own default view).
    await place(IDS[0]);
    await page.waitForTimeout(2000);
    diagnostics.unzoomed = await canvasInfo(page, OWNER);
    diagnostics.minis3dMaxPixelRatioCap = 2; // lib/pro/minis3d/camera.ts MINIS3D_MAX_PIXEL_RATIO
    console.error("[diagnostic] unzoomed", diagnostics.unzoomed);

    // Phase 1: "play" — default board view, generous board context (several
    // neighbouring tokens), matching dean-2026-09-28-playsize.png.
    for (const id of IDS) {
      await place(id);
      await page.waitForTimeout(2000);
      const box = await canvasInfo(page, OWNER);
      if (!box) continue;
      const padX = box.cssW * 1.5, padY = box.cssH * 1.1;
      const file = path.join(OUT, `hires-${id}-play.png`);
      await page.screenshot({
        path: file,
        clip: { x: Math.max(0, box.x - padX), y: Math.max(0, box.y - padY), width: box.cssW + 2 * padX, height: box.cssH + 2 * padY },
      });
      files[id] = { ...files[id], play: file };
      console.error("play", id, box);
    }

    // Phase 2: a SMALL board zoom-in (Dean: "board slightly zoomed in"),
    // just enough to bring the piece to ~250-350 CSS px tall, then re-probe
    // every id in place — matches dean-2026-09-28-base.png.
    const TARGET_CSS_H = 300;
    let cur = await canvasInfo(page, OWNER);
    let ticks = 0;
    while (cur.cssH < TARGET_CSS_H && ticks < 40) {
      await page.mouse.move(cur.x + cur.cssW / 2, cur.y + cur.cssH / 2);
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(70);
      cur = await canvasInfo(page, OWNER);
      ticks++;
    }
    await page.waitForTimeout(800);
    diagnostics.zoomed = cur;
    diagnostics.zoomTicks = ticks;
    console.error("[diagnostic] zoomed", cur, "ticks", ticks);

    for (const id of IDS) {
      await place(id);
      await page.waitForTimeout(1500);
      const box = await canvasInfo(page, OWNER);
      if (!box) continue;
      const pad = box.cssW * 0.35;
      const file = path.join(OUT, `hires-${id}-close.png`);
      await page.screenshot({
        path: file,
        clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.cssW + 2 * pad, height: box.cssH + 2 * pad },
      });
      files[id] = { ...files[id], close: file };
      console.error("close", id, box);
    }
    await browser.close();
  } finally {
    restore();
  }

  fs.writeFileSync(path.join(OUT, "hires-diagnostics.json"), JSON.stringify(diagnostics, null, 2));
  await buildHiresSheet(IDS, files, OUT);
  console.log(JSON.stringify({ ids: IDS, out: OUT, files, diagnostics }, null, 2));
};

const CELL_H = 520;
const HEADER_H = 26;
const PAD = 14;

const svgText = (text, w, h, opts = {}) => {
  const { size = 14, color = "#eee", weight = "normal" } = opts;
  const esc = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return Buffer.from(
    `<svg width="${w}" height="${h}"><text x="6" y="${Math.round(h / 2 + size / 3)}" font-family="Menlo,monospace" font-size="${size}" font-weight="${weight}" fill="${color}">${esc}</text></svg>`
  );
};

/** 4-up: one column per id, play crop over close crop. Downscale-only
 *  (`withoutEnlargement`) to fit the sheet cell — never upscaled; the
 *  per-id files written above are the untouched, full-resolution source. */
const buildHiresSheet = async (ids, files, outDir) => {
  const colW = 420;
  const cardW = PAD + ids.length * (colW + PAD);
  const cardH = HEADER_H + CELL_H + HEADER_H + CELL_H + PAD * 2;
  const composite = [];
  let x = PAD;
  for (const id of ids) {
    composite.push({ input: svgText(id, colW, HEADER_H, { weight: "bold" }), top: PAD, left: x });
    const f = files[id] ?? {};
    let y = PAD + HEADER_H;
    if (f.play && fs.existsSync(f.play)) {
      const buf = await sharp(f.play).resize({ width: colW, height: CELL_H, fit: "inside", withoutEnlargement: true }).toBuffer();
      composite.push({ input: buf, top: y, left: x });
    }
    y += CELL_H + HEADER_H;
    composite.push({ input: svgText("close", colW, HEADER_H, { color: "#888" }), top: y - HEADER_H, left: x });
    if (f.close && fs.existsSync(f.close)) {
      const buf = await sharp(f.close).resize({ width: colW, height: CELL_H, fit: "inside", withoutEnlargement: true }).toBuffer();
      composite.push({ input: buf, top: y, left: x });
    }
    x += colW + PAD;
  }
  await sharp({ create: { width: cardW, height: cardH, channels: 4, background: "#14100c" } })
    .composite(composite)
    .png()
    .toFile(path.join(outDir, "hires-sheet.png"));
};
