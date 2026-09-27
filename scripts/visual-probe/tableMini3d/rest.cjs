/**
 * "Zero GPU work at rest" (#945): a frame trace with King Taranis standing on
 * the board as a 3D mini, first at rest, then while a probe mini walks.
 *
 * Page side, every WebGL draw call on ANY context is counted (the prototypes
 * are wrapped before the app loads), plus the render scheduler's own frame
 * and job counters. Browser side, a CDP trace over the same window counts
 * FireAnimationFrame events and the GPU process's GL command-buffer work.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, referenceSpaces, probe, OUT } = require("../tableMini3d.cjs");

const WINDOW_MS = 3000;

const counters = (page) =>
  page.evaluate(() => ({
    glDrawCalls: window.__glDraws,
    renders: window.__minis3d?.stats.renders.length ?? 0,
    schedulerFrames: window.__minis3d?.stats.scheduler.frames ?? 0,
    schedulerJobs: window.__minis3d?.stats.scheduler.jobs ?? 0,
    canvases: document.querySelectorAll("[data-mini3d-canvas]").length,
    status: window.__minis3d?.stats.status,
  }));

const trace = async (cdp, during) => {
  const events = [];
  cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame,gpu,disabled-by-default-gpu.service",
    transferMode: "ReportEvents",
  });
  await during();
  const done = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
  await cdp.send("Tracing.end");
  await done;
  const count = (re) => events.filter((e) => re.test(e.name) && (e.ph === "X" || e.ph === "B" || e.ph === "I" || e.ph === "i")).length;
  const gpuNames = {};
  for (const e of events) if (/gpu/.test(e.cat) && (e.ph === "X" || e.ph === "B")) gpuNames[e.name] = (gpuNames[e.name] ?? 0) + 1;
  return {
    fireAnimationFrame: count(/^FireAnimationFrame$/),
    glDrawInGpuProcess: count(/Draw(Arrays|Elements)/),
    topGpuEvents: Object.entries(gpuNames).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
};

const delta = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, typeof b[k] === "number" ? b[k] - a[k] : b[k]]));

module.exports = async () => {
  const { browser, ctx, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  await ctx.addInitScript(() => {
    window.__glDraws = 0;
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean))
      for (const fn of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced", "drawRangeElements"]) {
        const orig = C.prototype[fn];
        if (orig)
          C.prototype[fn] = function (...a) {
            window.__glDraws++;
            return orig.apply(this, a);
          };
      }
  });
  await startGame(page, "minis3dProbe=1");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.waitForTimeout(2500);
  const out = { gl: null, rest: null, walking: null };
  out.gl = await page.evaluate(() => {
    const g = document.createElement("canvas").getContext("webgl");
    const e = g && g.getExtension("WEBGL_debug_renderer_info");
    return g ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : null;
  });

  // At rest: nothing on the board moves.
  let a = await counters(page);
  const restTrace = await trace(cdp, () => page.waitForTimeout(WINDOW_MS));
  let b = await counters(page);
  out.rest = { windowMs: WINDOW_MS, page: delta(a, b), trace: restTrace };

  // A probe mini walks four spaces (1.2 s), inside the same-length window.
  const { all } = await referenceSpaces(page);
  const [s0, ...route] = all.filter((_, i) => i % 2 === 0);
  await probe(page, [{ space: s0, mode: "3d", seat: "p2" }]);
  await page.waitForTimeout(2500);
  a = await counters(page);
  const walkTrace = await trace(cdp, async () => {
    await probe(page, [{ space: s0, mode: "3d", seat: "p2", path: [s0, ...route.slice(0, 4)], durationSec: 1.2 }]);
    await page.waitForTimeout(WINDOW_MS);
  });
  b = await counters(page);
  out.walking = { windowMs: WINDOW_MS, page: delta(a, b), trace: walkTrace };

  // And at rest again afterwards: the loop must have stopped.
  a = await counters(page);
  const afterTrace = await trace(cdp, () => page.waitForTimeout(WINDOW_MS));
  b = await counters(page);
  out.restAfterWalk = { windowMs: WINDOW_MS, page: delta(a, b), trace: afterTrace };

  await probe(page, []);
  fs.writeFileSync(path.join(OUT, "rest.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
};
