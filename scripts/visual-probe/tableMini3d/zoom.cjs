/**
 * Canvas density under board zoom (#945 review item 1). King Taranis stands
 * in 3D mid-pick (the opening move's gold spaces are live); the board is then
 * zoomed in on him with the wheel, the way the pick auto-focus (#831) or a
 * pinch zooms it. Reports the canvas's backing pixels per on-screen CSS pixel
 * before and after the zoom (the cap is 2 on this DPR-3 phone) and crops him
 * 1:1 at the zoomed size.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, OUT } = require("../tableMini3d.cjs");

const TAG = process.env.PROBE_TAG || "zoom";

const read = (page) =>
  page.evaluate(() => {
    const c = document.querySelector("[data-mini3d-canvas]");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      cssPx: [+r.width.toFixed(1), +r.height.toFixed(1)],
      backingPx: [c.width, c.height],
      backingPerCssPx: +(c.width / r.width).toFixed(2),
      box: { x: r.left, y: r.top, width: r.width, height: r.height },
      renders: window.__minis3d?.stats.renders.length ?? 0,
      prompt: document.body.innerText.match(/Tap a [^\n]*/)?.[0] ?? null,
    };
  });

module.exports = async () => {
  const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  await startGame(page, "minis3d=1");
  await page.waitForTimeout(2000);
  const out = { before: await read(page) };
  const b = out.before.box;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(1500);
  out.zoomed = await read(page);
  out.zoomFactor = +(out.zoomed.cssPx[0] / out.before.cssPx[0]).toFixed(2);
  const z = out.zoomed.box, pad = 8;
  await page.screenshot({
    path: path.join(OUT, `${TAG}-crop.png`),
    clip: { x: Math.max(0, z.x - pad), y: Math.max(0, z.y - pad), width: z.width + 2 * pad, height: z.height + 2 * pad },
  });
  await page.screenshot({ path: path.join(OUT, `${TAG}-board.png`) });
  delete out.before.box;
  delete out.zoomed.box;
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
};
