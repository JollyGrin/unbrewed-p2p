/**
 * Frame cost on an EMULATED phone: iPhone 14 landscape viewport/DPR 3 and a
 * 4x CPU throttle over CDP (Emulation.setCPUThrottlingRate). The GPU is NOT
 * throttled — it is whatever the host gives Chromium (PROBE_ARGS picks Metal
 * or SwiftShader), so GPU-bound time is a lower bound on a real phone.
 *
 * Per LOD and per N (2/4/8 minis on the board, the model instanced onto
 * probe pieces): per-mini render ms (renderMini: GL draw + copy into the
 * piece's canvas) and rAF frame intervals over a 1.2 s move tween of ONE
 * piece, and of ALL pieces at once. The same runs with sprites give the
 * baseline.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, referenceSpaces, probe, OUT, LODS } = require("../tableMini3d.cjs");

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : null);
  const r = (v) => (v === null ? null : +v.toFixed(2));
  return { n: s.length, median: r(q(0.5)), p95: r(q(0.95)), max: r(s[s.length - 1] ?? null) };
};

module.exports = async () => {
  const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  await startGame(page, "minis3d=1");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const sync = !!process.env.PROBE_SYNC;
  await page.evaluate((v) => (window.__minis3d.stats.syncTiming = v), sync);
  const gl = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl");
    const e = g && g.getExtension("WEBGL_debug_renderer_info");
    return g ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null;
  });
  const { all } = await referenceSpaces(page);
  const free = all.filter((_, i) => i % 2 === 0); // spread out
  const renderCount = () => page.evaluate(() => window.__minis3d.stats.renders.length);
  const rendersSince = (i) => page.evaluate((k) => window.__minis3d.stats.renders.slice(k).map((r) => r.ms), i);
  const frames = (ms) =>
    page.evaluate(
      (dur) =>
        new Promise((res) => {
          const out = [];
          let last = performance.now();
          const t0 = last;
          const tick = (t) => {
            out.push(t - last);
            last = t;
            if (t - t0 < dur) requestAnimationFrame(tick);
            else res(out);
          };
          requestAnimationFrame(tick);
        }),
      ms
    );

  const results = { gl, gpuSyncedTiming: sync, cpuThrottle: 4, device: "iPhone 14 landscape (emulated)", runs: [] };
  for (const mode of ["sprite", ...LODS]) {
    for (const n of [2, 4, 8]) {
      const spaces = free.slice(0, n);
      const pieces = (extra = {}) =>
        spaces.map((space, i) => ({ space, seat: `p${(i % 4) + 1}`, mode: mode === "sprite" ? "sprite" : "3d", lod: mode === "sprite" ? undefined : mode, ...(extra[i] ?? {}) }));
      await probe(page, []);
      await page.waitForTimeout(300);
      const r0 = await renderCount();
      await probe(page, pieces());
      await page.waitForTimeout(mode === "sprite" ? 1500 : 4000); // first load decodes
      const placeRenders = await rendersSince(r0);
      const idle = await frames(1000);
      // One piece walks four spaces.
      const route = free.slice(n, n + 4);
      const r1 = await renderCount();
      const oneMoving = frames(1500);
      await probe(page, pieces({ 0: { path: [spaces[0], ...route], durationSec: 1.2 } }));
      const oneFrames = await oneMoving;
      const oneRenders = await rendersSince(r1);
      await page.waitForTimeout(600);
      // Every piece moves at once (a worst case: swaps, a board-wide shove).
      await probe(page, []);
      await page.waitForTimeout(300);
      await probe(page, pieces());
      await page.waitForTimeout(1500);
      const r2 = await renderCount();
      const allMoving = frames(1500);
      await probe(page, pieces(Object.fromEntries(spaces.map((s, i) => [i, { path: [s, free[(i * 3 + 5) % free.length]], durationSec: 1.2 }]))));
      const allFrames = await allMoving;
      const allRenders = await rendersSince(r2);
      await page.waitForTimeout(600);
      const run = {
        mode,
        minis: n,
        placeRenderMs: stats(placeRenders),
        idleFrameMs: stats(idle),
        oneMoving: { frameMs: stats(oneFrames), over20ms: oneFrames.filter((f) => f > 20).length, renderMs: stats(oneRenders) },
        allMoving: { frameMs: stats(allFrames), over20ms: allFrames.filter((f) => f > 20).length, renderMs: stats(allRenders) },
      };
      run.rendererStatus = await page.evaluate(() => window.__minis3d.stats.status);
      run.scheduler = await page.evaluate(() => ({ ...window.__minis3d.stats.scheduler }));
      run.canvases = await page.evaluate(() => [...document.querySelectorAll('[data-badge-owner^="probe"] [data-mini3d-canvas]')].length);
      results.runs.push(run);
      console.error(JSON.stringify(run));
    }
  }
  await probe(page, []);
  const tag = process.env.PROBE_TAG || "perf";
  fs.writeFileSync(path.join(OUT, `${tag}.json`), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ gl: results.gl }, null, 2));
  await browser.close();
};
