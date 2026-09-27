/**
 * Pixel-ratio cap (#945): the 3D mini on the five reference spaces with the
 * canvas backing store capped at 2 and at 3 (`?minis3dDpr=`), on the DPR-3
 * emulated phone, cropped 1:1 in device pixels. Also reports each canvas's
 * backing-store size (pixels drawn + copied per render).
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, referenceSpaces, probe, OUT } = require("../tableMini3d.cjs");

module.exports = async () => {
  const out = {};
  for (const cap of [2, 3]) {
    const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
    await startGame(page, `minis3d=1&minis3dDpr=${cap}`);
    await page.addStyleTag({ content: "[data-badge-owner^='probe'] [data-standee-badges]{display:none!important}" });
    const spaces = await referenceSpaces(page);
    for (const [label, space] of Object.entries(spaces).filter(([k]) => k !== "all")) {
      await probe(page, [{ space, mode: "3d", seat: "p1" }]);
      await page.waitForTimeout(1500);
      const box = await page.evaluate(() => {
        const c = document.querySelector('[data-badge-owner="probe-0"] [data-mini3d-canvas]');
        const r = c.getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height, backing: [c.width, c.height] };
      });
      const pad = 6;
      await page.screenshot({
        path: path.join(OUT, `dpr${cap}-${label}.png`),
        clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad },
      });
      out[`${label}/cap${cap}`] = { space, cssPx: [+box.width.toFixed(1), +box.height.toFixed(1)], backingPx: box.backing };
      console.error(label, cap, JSON.stringify(out[`${label}/cap${cap}`]));
    }
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, "dpr.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
};
