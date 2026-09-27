/**
 * Failure modes: what the board draws for King Taranis when WebGL is
 * unavailable (--disable-webgl) and when the shared context is lost and then
 * restored (WEBGL_lose_context). The board must keep a sprite or token.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, OUT } = require("../tableMini3d.cjs");

const snapshot = (page) =>
  page.evaluate(() => ({
    status: window.__minis3d?.stats.status ?? "(renderer never loaded)",
    mini3dCanvases: document.querySelectorAll("[data-mini3d-canvas]").length,
    spriteFigures: document.querySelectorAll("[data-table-figure]").length,
    flatTokens: document.querySelectorAll("[data-table-stage-plane] img").length,
    renders: window.__minis3d?.stats.renders.length ?? 0,
  }));

const heroShot = async (page, file) => {
  const box = await page.evaluate(() => {
    const el = document.querySelector('[data-badge-owner] [data-fighter-base], [data-badge-owner]');
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width };
  });
  await page.screenshot({ path: path.join(OUT, file), clip: { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 90), width: 160, height: 150 } });
};

module.exports = async () => {
  const out = {};
  {
    const { browser, page } = await launch(["--disable-webgl"]);
    await startGame(page, "minis3d=1");
    await page.waitForTimeout(2000);
    out.disableWebgl = await snapshot(page);
    await page.screenshot({ path: path.join(OUT, "fail-disable-webgl.png") });
    await browser.close();
  }
  {
    const { browser, page } = await launch(["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]);
    await startGame(page, "minis3d=1");
    await page.waitForTimeout(2000);
    out.before = await snapshot(page);
    await page.screenshot({ path: path.join(OUT, "fail-before.png") });
    await page.evaluate(() => window.__minis3d.loseContext());
    await page.waitForTimeout(800);
    out.lost = await snapshot(page);
    await page.screenshot({ path: path.join(OUT, "fail-lost.png") });
    await page.evaluate(() => window.__minis3d.restoreContext());
    await page.waitForTimeout(1500);
    out.restored = await snapshot(page);
    await page.screenshot({ path: path.join(OUT, "fail-restored.png") });
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "fail.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
};
