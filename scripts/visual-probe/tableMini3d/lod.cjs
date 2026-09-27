/**
 * Detail levels at play size: the same space, the 3D mini at each PROBE_LODS
 * level (only "play" is committed; others need local files the manifest names),
 * cropped 1:1 in device pixels.
 */
const path = require("path");
const { launch, startGame, referenceSpaces, probe, OUT, LODS } = require("../tableMini3d.cjs");

module.exports = async () => {
  const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
  await startGame(page, "minis3d=1");
  await page.addStyleTag({ content: "[data-badge-owner^='probe'] [data-standee-badges]{display:none!important}" });
  const { nearLeft } = await referenceSpaces(page);
  for (const lod of LODS) {
    await probe(page, [{ space: nearLeft, mode: "3d", seat: "p1", lod }]);
    await page.waitForTimeout(2500);
    const box = await page.evaluate(() => {
      const r = document.querySelector('[data-badge-owner="probe-0"] [data-mini3d-canvas]').getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    await page.screenshot({ path: path.join(OUT, `lod-${lod}.png`), clip: box });
  }
  await browser.close();
};
