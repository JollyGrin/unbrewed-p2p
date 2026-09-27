/**
 * Decode cost per variant on the throttled phone profile (4x CPU, iPhone 14
 * landscape). A fresh page per variant, whose FIRST 3D load is that variant
 * (`?minis3dVariant=`), so the decoder's own start-up (Draco wasm fetch +
 * compile + worker; Meshopt's inline wasm) is counted once in `first`, then
 * four warm re-decodes of the same bytes (cache-busted URLs) in `warm`.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, OUT, VARIANTS } = require("../tableMini3d.cjs");

module.exports = async () => {
  const results = [];
  for (const v of VARIANTS) {
    const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await startGame(page, `minis3d=1&minis3dVariant=${v}`);
    await page.waitForTimeout(3000);
    const r = await page.evaluate(async (variant) => {
      const s = window.__minis3d.stats;
      const first = s.loads[0];
      const codec = /meshopt/.test(variant) ? "meshopt" : "draco";
      const warm = [];
      for (let i = 0; i < 4; i++) {
        await window.__minis3d.load(`${first.url}?warm=${i}`, codec);
        warm.push(s.loads[s.loads.length - 1].decodeMs);
      }
      return { status: s.status, importMs: s.importMs, first, warm };
    }, v);
    results.push({ variant: v, ...r });
    console.error(JSON.stringify(results[results.length - 1]));
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `${process.env.PROBE_TAG || "decode"}.json`), JSON.stringify(results, null, 2));
};
