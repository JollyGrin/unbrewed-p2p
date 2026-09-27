/**
 * Perspective match: the sprite mini and the 3D mini on the same five spaces.
 * Measured by PIXELS, never bounding rects (a projected circle off-centre is a
 * slanted ellipse): toggle the figure off → its mask; toggle the base disc off
 * → the disc's mask. Then, in CSS px:
 *   bottomGap    mean (figure's lowest row − disc's lowest row) over the
 *                disc's middle 60% of columns: 0 = the model's base front edge
 *                lies exactly on the base ellipse; + = it hangs below it.
 *   baseWidth    figure width across the disc's lower half ÷ disc width.
 *   centreDx     figure base centre − disc centre, px.
 *   leanDeg      the body's axis (top-15% centroid → base centroid) off the
 *                screen vertical; expectedLeanDeg is the board normal's own
 *                projected direction at that space (what a real upright shows).
 * The probe pieces are drawn WITHOUT their drop-shadow filter and the disc's
 * box-shadow: both bleed below the edge being measured.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, referenceSpaces, probe, OUT } = require("../tableMini3d.cjs");

const ANALYZE = async ([a, b, c, scale]) => {
  const load = (src) =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const g = cv.getContext("2d");
        g.drawImage(im, 0, 0);
        res(g.getImageData(0, 0, im.width, im.height));
      };
      im.src = "data:image/png;base64," + src;
    });
  const [A, B, C] = await Promise.all([load(a), load(b), load(c)]);
  const W = A.width, H = A.height;
  const mask = (P, Q) => {
    const m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const d = Math.abs(P.data[4 * i] - Q.data[4 * i]) + Math.abs(P.data[4 * i + 1] - Q.data[4 * i + 1]) + Math.abs(P.data[4 * i + 2] - Q.data[4 * i + 2]);
      m[i] = d > 36 ? 1 : 0;
    }
    return m;
  };
  const fig = mask(A, B), disc = mask(B, C);
  const bottom = (m, x) => { for (let y = H - 1; y >= 0; y--) if (m[y * W + x]) return y; return -1; };
  let dx0 = W, dx1 = -1, dy0 = H, dy1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (disc[y * W + x]) { dx0 = Math.min(dx0, x); dx1 = Math.max(dx1, x); dy0 = Math.min(dy0, y); dy1 = Math.max(dy1, y); }
  if (dx1 < 0) return { error: "no disc pixels" };
  const discW = dx1 - dx0 + 1, discCy = (dy0 + dy1) / 2, discCx = (dx0 + dx1) / 2;
  const gaps = [];
  for (let x = Math.round(dx0 + discW * 0.2); x <= dx1 - discW * 0.2; x++) {
    const fb = bottom(fig, x), db = bottom(disc, x);
    if (fb >= 0 && db >= 0) gaps.push(fb - db);
  }
  // Figure extent across the disc's lower half.
  let fx0 = W, fx1 = -1;
  for (let y = Math.round(discCy); y <= dy1 + 4; y++) for (let x = 0; x < W; x++) if (fig[y * W + x]) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); }
  // Lean: top-15% centroid vs the base band centroid.
  let fy0 = H, fy1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fig[y * W + x]) { fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y); }
  const centroid = (ya, yb) => { let s = 0, n = 0; for (let y = ya; y <= yb; y++) for (let x = 0; x < W; x++) if (fig[y * W + x]) { s += x; n++; } return n ? s / n : NaN; };
  const hTop = Math.round(fy0 + (fy1 - fy0) * 0.15);
  const topC = centroid(fy0, hTop), baseC = centroid(Math.round(discCy), dy1);
  const topY = (fy0 + hTop) / 2, baseY = (discCy + dy1) / 2;
  const mean = (xs) => xs.reduce((p, q) => p + q, 0) / (xs.length || 1);
  return {
    discWidthPx: +(discW / scale).toFixed(1),
    discHOverW: +((dy1 - dy0 + 1) / discW).toFixed(3),
    bottomGapPx: +(mean(gaps) / scale).toFixed(2),
    bottomGapMaxPx: +(Math.max(...gaps.map(Math.abs)) / scale).toFixed(2),
    baseWidthRatio: fx1 >= 0 ? +((fx1 - fx0 + 1) / discW).toFixed(3) : null,
    centreDxPx: fx1 >= 0 ? +(((fx0 + fx1) / 2 - discCx) / scale).toFixed(2) : null,
    leanDeg: +((Math.atan2(topC - baseC, baseY - topY) * 180) / Math.PI).toFixed(2),
    figureHeightPx: +((fy1 - fy0 + 1) / scale).toFixed(1),
  };
};

module.exports = async () => {
  const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  await startGame(page, "minis3dProbe=1");
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important} [data-badge-owner^='probe'] [data-standee-badges]{display:none!important} [data-badge-owner^='probe'] *{filter:none!important;box-shadow:none!important}" });
  const spaces = await referenceSpaces(page);
  const scale = 3; // iPhone 14 deviceScaleFactor
  const results = {};
  for (const [label, space] of Object.entries(spaces).filter(([k]) => k !== "all")) {
    for (const mode of ["sprite", "3d"]) {
      await probe(page, [{ space, mode, seat: "p1" }]);
      await page.waitForTimeout(mode === "3d" ? 1500 : 800);
      const root = `[data-badge-owner="probe-0"]`;
      const box = await page.evaluate((sel) => {
        const r = document.querySelector(`${sel} [data-fighter-base]`).getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      }, root);
      const clip = { x: Math.max(0, box.x - box.w * 1.2), y: Math.max(0, box.y - box.w * 2.6), width: box.w * 3.4, height: box.w * 2.6 + box.h * 1.6 };
      const figSel = mode === "3d" ? `${root} [data-mini3d-canvas]` : `${root} [data-table-figure], ${root} [data-table-figure-ground]`;
      const shot = async () => (await page.screenshot({ clip })).toString("base64");
      const hide = (sel, on) => page.evaluate(([s, v]) => document.querySelectorAll(s).forEach((el) => (el.style.visibility = v ? "hidden" : "")), [sel, on]);
      const a = await shot();
      fs.writeFileSync(path.join(OUT, `match-${label}-${mode}.png`), Buffer.from(a, "base64"));
      await hide(figSel, true);
      const b = await shot();
      await hide(`${root} [data-fighter-base]`, true);
      const c = await shot();
      await hide(figSel, false);
      await hide(`${root} [data-fighter-base]`, false);
      const m = await page.evaluate(ANALYZE, [a, b, c, scale]);
      const cam = mode === "3d"
        ? await page.evaluate((sel) => { const el = document.querySelector(sel); return el && { elevDeg: +el.dataset.elevDeg, azDeg: +el.dataset.azDeg, expectedLeanDeg: +el.dataset.leanDeg }; }, `${root} [data-mini3d-canvas]`)
        : null;
      // The browser's own answer: a CSS stick standing on the board normal in
      // the piece's (preserve-3d) ground slot, its two ends read on screen.
      const cssLeanDeg = await page.evaluate((sel) => {
        const g = document.querySelector(`${sel} [data-standee-ground]`);
        if (!g) return null;
        const mk = (z) => {
          const d = document.createElement("div");
          d.style.cssText = `position:absolute;left:-2px;top:-2px;width:4px;height:4px;transform:translateZ(${z}px)`;
          g.appendChild(d);
          const r = d.getBoundingClientRect();
          d.remove();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const a0 = mk(0), a1 = mk(40);
        return +((Math.atan2(a1.x - a0.x, a0.y - a1.y) * 180) / Math.PI).toFixed(2);
      }, root);
      results[`${label}/${mode}`] = { space, ...m, ...(cam ?? {}), cssLeanDeg };
      console.error(label, mode, JSON.stringify(results[`${label}/${mode}`]));
    }
  }
  await probe(page, []);
  fs.writeFileSync(path.join(OUT, "match.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
};
