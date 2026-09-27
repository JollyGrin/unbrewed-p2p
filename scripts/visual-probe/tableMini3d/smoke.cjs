const path = require("path");
const { launch, startGame, OUT } = require("../tableMini3d.cjs");
module.exports = async () => {
  const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  const heroIds = new Set();
  page.on("websocket", (ws) => ws.on("framereceived", (f) => {
    const t = String(f.payload);
    for (const m of t.matchAll(/"id":"p\d","heroId":"([^"]+)"/g)) heroIds.add(m[1]); const s = /"players":\[[^\]]{0,300}/.exec(t); if (s) heroIds.add(s[0].slice(0, 200));
  }));
  await startGame(page, "minis3dProbe=1");
  await page.waitForTimeout(3000);
  const info = await page.evaluate(async () => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return {
      glRenderer: gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "webgl, no debug info") : null,
      openKeys: Object.keys((await (await fetch("/figures-open/manifest.json")).json()).figures),
      sprites: document.querySelectorAll("[data-table-figure]").length,
      heroImgs: [...document.querySelectorAll("img")].map((i) => i.src).filter((s) => /hero|taranis/i.test(s)).slice(0, 5),
      canvases: [...document.querySelectorAll("[data-mini3d-canvas]")].map((c) => ({ w: c.width, h: c.height, elev: c.dataset.elevDeg, az: c.dataset.azDeg })),
      stats: window.__minis3d?.stats,
    };
  });
  console.log(JSON.stringify({ heroIds: [...heroIds], ...info }, null, 2));
  await page.screenshot({ path: path.join(OUT, "smoke.png") });
  await browser.close();
};
