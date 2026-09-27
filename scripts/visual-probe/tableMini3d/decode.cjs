/**
 * Decode cost per detail level on the throttled phone profile (4x CPU,
 * iPhone 14 landscape). A fresh page per LOD, whose FIRST 3D load is that
 * level (`?minis3dLod=`), so the Meshopt decoder's start-up (inline wasm) is
 * counted once in `first`, then four warm re-decodes of the same bytes
 * (cache-busted URLs) in `warm`.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, OUT, LODS } = require("../tableMini3d.cjs");

module.exports = async () => {
  const results = [];
  for (const v of LODS) {
    const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await startGame(page, `minis3dProbe=1&minis3dLod=${v}`);
    await page.waitForTimeout(3000);
    const r = await page.evaluate(async () => {
      const s = window.__minis3d.stats;
      const first = s.loads[0];
      const warm = [];
      for (let i = 0; i < 4; i++) {
        await window.__minis3d.load(`${first.url}?warm=${i}`);
        warm.push(s.loads[s.loads.length - 1].decodeMs);
      }
      return { status: s.status, importMs: s.importMs, first, warm };
    }, v);
    results.push({ lod: v, ...r });
    console.error(JSON.stringify(results[results.length - 1]));
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, `${process.env.PROBE_TAG || "decode"}.json`), JSON.stringify(results, null, 2));
};
