/**
 * Hero-mini verify (unbrewed-p2p-965, STANDARD.md §5.4) — proves a mini id
 * (and its aliases) resolve correctly in BOTH figure styles, on the real
 * tabletop, and writes crops. Not a test; it prints JSON and writes crops.
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:3107 \
 *     node scripts/visual-probe/heroMiniVerify.cjs <canonicalId> [aliasId ...] [--out dir]
 *
 * Reuses the SAME dev-only measuring aid `scripts/visual-probe/tableMini3d/`
 * already drives (`TableMini3dProbe`, mounted under `?minis3dProbe=1`,
 * driven by the `table-mini3d-probe` CustomEvent — see tableMini3d.cjs's
 * `launch`/`startGame`/`referenceSpaces`/`probe`) rather than depending on the
 * lobby's actual hero pick (which player ends up playing which hero is not
 * something this script controls or needs to: the probe stands an EXTRA
 * piece for a given `miniId` directly, resolved through the exact same
 * `figureFor` / `mini3dFor` + manifests the game itself reads — so it proves
 * alias resolution exactly, on the real board, without any lobby race).
 *
 * For each id (the canonical id, then every alias), in each of "3d" and
 * "sprite" mode, this: stands one probe piece as that miniId, asserts the
 * piece actually carries a WebGL mini (`[data-mini3d-canvas]`) or a sprite
 * `<img>` (`[data-table-figure]`) as appropriate — failing loudly otherwise —
 * and for sprite mode additionally asserts the `<img>` `src` is the
 * CANONICAL id's file (proving the alias shares it, never a copy) and that
 * `/minis3d/<canonicalId>.play.glb` was actually requested for 3d mode.
 * Tokens don't depend on heroId/alias resolution at all (TableFighterStandee
 * falls back to one the same way for every hero without a figure/mini3d), so
 * one whole-board crop under the "Tokens" figure style is enough there.
 */
const path = require("path");
const fs = require("fs");
const { launch, startGame, referenceSpaces, probe, OUT: DEFAULT_OUT, BASE } = require("./tableMini3d.cjs");

const argv = process.argv.slice(2);
const argOut = argv.indexOf("--out");
const OUT = argOut > -1 ? argv[argOut + 1] : DEFAULT_OUT;
const ids = argv.filter((a, i) => !a.startsWith("--") && (argOut === -1 || i !== argOut + 1));
if (ids.length < 1) {
  console.error("usage: node scripts/visual-probe/heroMiniVerify.cjs <canonicalId> [aliasId ...] [--out dir]");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });
const [canonicalId] = ids;
const SEAT = "p1";

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

/** The piece's own standee root — TableFighterStandee sets this from the
 *  fighter id itself (`probe-0`, per TableMini3dProbe), no lobby-picked
 *  fighter involved. */
const pieceRoot = (index) => `[data-badge-owner="probe-${index}"]`;

const cropPiece = async (page, index, file) => {
  const box = await page.evaluate(
    (sel) => document.querySelector(sel)?.getBoundingClientRect(),
    pieceRoot(index)
  );
  if (!box) throw new Error(`${pieceRoot(index)}: not found to crop`);
  const clip = {
    x: Math.max(0, box.x - box.width * 0.9),
    y: Math.max(0, box.y - box.height * 0.25),
    width: box.width * 2.8,
    height: box.height * 1.5,
  };
  await page.screenshot({ path: file, clip });
};

module.exports = async () => {
  const results = {};

  // 3D + sprite crops, via the probe — deterministic, alias-exact.
  {
    const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean));
    // Never reset: a repeat load of the SAME url can be served from cache
    // without a fresh network event, so membership (not the latest batch) is
    // the reliable signal that a file was actually requested this session.
    const seenGlbs = new Set();
    page.on("request", (r) => {
      const m = /\/minis3d\/([^/?]+\.glb)/.exec(r.url());
      if (m) seenGlbs.add(m[1]);
    });
    await startGame(page, "minis3dProbe=1");
    const spaces = await referenceSpaces(page);
    const spaceIds = [spaces.nearLeft, spaces.nearRight, spaces.farLeft, spaces.farRight].filter(Boolean);
    if (spaceIds.length === 0) die("referenceSpaces: no open space found to stand a probe piece on");

    let spaceCursor = 0;
    for (const miniId of ids) {
      for (const mode of ["3d", "sprite"]) {
        const space = spaceIds[spaceCursor % spaceIds.length];
        spaceCursor++;
        await probe(page, [{ space, mode, seat: SEAT, miniId }]);
        await page.waitForSelector(pieceRoot(0), { timeout: 15000 });
        await page.waitForTimeout(mode === "3d" ? 1500 : 600);

        const info = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const canvas = el.querySelector("[data-mini3d-canvas]");
          const sprite = el.querySelector("[data-table-figure]");
          return { has3d: !!canvas, hasSprite: !!sprite, spriteSrc: sprite ? sprite.getAttribute("src") : null };
        }, pieceRoot(0));
        if (!info) die(`${miniId}/${mode}: ${pieceRoot(0)} not found`);

        if (mode === "3d") {
          if (!info.has3d) die(`${miniId}/3d: expected a [data-mini3d-canvas], found none — ${JSON.stringify(info)}`);
          const wantGlb = `${canonicalId}.play.glb`;
          if (!seenGlbs.has(wantGlb))
            die(`${miniId}/3d: expected a request for /minis3d/${wantGlb} (proves the alias's model IS the canonical file), saw ${JSON.stringify([...seenGlbs])}`);
        } else {
          if (!info.hasSprite) die(`${miniId}/sprite: expected a [data-table-figure] <img>, found none — ${JSON.stringify(info)}`);
          const wantSrc = `/figures-open/${canonicalId}.${SEAT}.webp`;
          if (!info.spriteSrc || !info.spriteSrc.endsWith(wantSrc))
            die(`${miniId}/sprite: expected src ending ${wantSrc} (the canonical id's file — proves alias sharing), got ${info.spriteSrc}`);
        }

        const label = mode === "3d" ? "3d-minis" : "minis";
        const file = path.join(OUT, `${miniId}-${label}.png`);
        await cropPiece(page, 0, file);
        results[`${miniId}/${mode}`] = { file, ...info, seenGlbs: mode === "3d" ? [...seenGlbs] : undefined };
        console.log(`${miniId}/${mode}: OK — ${JSON.stringify(info)}`);
      }
    }
    await probe(page, []);
    await browser.close();
  }

  // Tokens: alias-agnostic (TableFighterStandee's token fallback doesn't
  // read heroId/miniId at all), so one whole-board crop under the "Tokens"
  // figure style is enough — no probe piece needed.
  {
    const { browser, page } = await launch((process.env.PROBE_ARGS || "").split(" ").filter(Boolean), "token");
    await startGame(page, "");
    await page.waitForTimeout(1000);
    const file = path.join(OUT, "tokens.png");
    await page.screenshot({ path: file });
    results.tokens = { file };
    console.log(`tokens: OK — ${file}`);
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, "hero-mini-verify.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ out: OUT, base: BASE, results }, null, 2));
};

if (require.main === module) {
  module.exports().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
