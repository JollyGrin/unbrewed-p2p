/**
 * Tabletop miniatures — do a hero's HP/reach badges sit on its own silhouette?
 * (#928). The badges hang off the corners of the standee's upright plate, and
 * the miniature is a separate image standing in it, so jsdom can only compare
 * numbers: this asks the real browser where both actually land.
 *
 * It starts a real game vs AI·E with the given hero, switches to the tabletop
 * view, and for every hero standing as a miniature reports, in screen px:
 *
 *   silhouette   the model's visible box (the image's rect × the manifest's
 *                `bounds`), above the feet;
 *   hp           the HP badge's rect;
 *   gapX / gapY  how far the badge's centre is from the silhouette's top-right
 *                corner, in SPACE DIAMETERS (the base disc's on-screen width).
 *
 * A badge hung on the model's own corner is within about half a space of it.
 *
 * It also re-checks click routing (#873) on each miniature: what a tap lands on
 * at its base (`baseHit` — the piece's own base) and on its upper body and HP
 * badge (`bodyHit`, `badgeHit` — "own" only while the fighter is a target;
 * otherwise whatever stands behind it, never this piece).
 *
 * Usage (a dev server must already be running):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:3928 \
 *     node scripts/visual-probe/tableFigureBadges.cjs --hero "Hollow Oak" [--out <dir>] [--tag before]
 */
const path = require("path");
const fs = require("fs");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install (see the header comment).");
  process.exit(2);
}
const pw = require(PW_PATH);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const HERO = arg("--hero", "Hollow Oak");
const TAG = arg("--tag", "shot");
const OUT = arg("--out", path.join(require("os").tmpdir(), "table-figure-badges"));
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PROBE_URL || "http://localhost:3000";
const PROBE_MAP = process.env.PROBE_MAP || "Secluded Temple";

/** Runs in the page. */
const measure = async () => {
  const manifest = await fetch("/figures-open/manifest.json").then((r) => r.json());
  const boundsOf = (src) => {
    const file = src.split("/").pop();
    const entry = Object.values(manifest.figures).find((e) => Object.values(e.seats).includes(file));
    return entry?.bounds ?? { left: 0, top: 0, right: 1, bottom: 1 };
  };
  const round = (v) => Math.round(v * 10) / 10;
  const box = (r) => ({ x: [round(r.left), round(r.right)], y: [round(r.top), round(r.bottom)] });
  return [...document.querySelectorAll("[data-badge-owner]")].flatMap((root) => {
    const img = root.querySelector("img[data-table-figure]");
    const hp = root.querySelector('[data-fighter-badge="hp"]');
    if (!img || !hp) return [];
    // The image's own rect: its clip frame cuts it at the feet line.
    const ir = img.getBoundingClientRect();
    const feetY = img.parentElement.getBoundingClientRect().bottom;
    const b = boundsOf(img.getAttribute("src"));
    const sil = {
      left: ir.left + b.left * ir.width,
      right: ir.left + b.right * ir.width,
      top: ir.top + b.top * ir.height,
      bottom: feetY,
    };
    const hr = hp.getBoundingClientRect();
    const layer = root.querySelector("[data-standee-badges]");
    const baseEl = root.querySelector("[data-fighter-base]") ?? document.querySelector("[data-fighter-base]");
    const diam = baseEl ? baseEl.getBoundingClientRect().width / 0.9 : ir.width;
    const hitAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return "nothing";
      if (root.contains(el)) return `own:${el.hasAttribute("data-fighter-base") ? "base" : el.tagName.toLowerCase()}`;
      const space = el.closest("[data-space-id]");
      return space ? `space:${space.getAttribute("data-space-id")}` : `other:${el.tagName.toLowerCase()}`;
    };
    const br = baseEl.getBoundingClientRect();
    return [
      {
        fighter: root.getAttribute("data-badge-owner"),
        pick: root.hasAttribute("data-pick"),
        baseHit: hitAt((br.left + br.right) / 2, br.bottom - br.height * 0.2),
        bodyHit: hitAt((sil.left + sil.right) / 2, sil.top + (sil.bottom - sil.top) * 0.3),
        badgeHit: hitAt((hr.left + hr.right) / 2, (hr.top + hr.bottom) / 2),
        figure: img.getAttribute("src"),
        silhouette: box(sil),
        badgeLayer: box(layer.getBoundingClientRect()),
        badgeForward: layer.getAttribute("data-badge-forward"),
        hp: box(hr),
        spaceDiamPx: round(diam),
        gapX: round(((hr.left + hr.right) / 2 - sil.right) / diam),
        gapY: round(((hr.top + hr.bottom) / 2 - sil.top) / diam),
        crop: {
          x: Math.max(0, Math.min(sil.left, hr.left) - 2 * diam),
          y: Math.max(0, Math.min(sil.top, hr.top) - 2 * diam),
          width: 5 * diam + (sil.right - sil.left),
          height: 5 * diam + (sil.bottom - sil.top),
        },
      },
    ];
  });
};

(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));
  const report = { hero: HERO, tag: TAG };
  try {
    await p.goto(`${BASE}/pro/game?debug`);
    await p.waitForTimeout(6000);
    await p.getByRole("button", { name: "AI·E", exact: true }).click();
    await p.getByRole("button", { name: new RegExp(`^(The )?${HERO}( ★)? by`, "i") }).first().click();
    const stage = p.getByRole("button", { name: PROBE_MAP, exact: true });
    if (!(await stage.count())) {
      const more = p.getByRole("button", { name: /^All \d+ boards$/ });
      if (await more.count()) await more.first().click();
    }
    await stage.first().click();
    await p.getByRole("button", { name: "PLAY VS AI" }).click();
    await p.waitForTimeout(12000);
    const keep = p.getByRole("button", { name: /keep your opening hand/i });
    if (await keep.count()) await keep.click();
    await p.waitForTimeout(3000);
    await p.getByRole("button", { name: "Flat board" }).click();
    await p.waitForTimeout(4000);

    report.figures = await p.evaluate(measure);
    const slug = HERO.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await p.screenshot({ path: path.join(OUT, `${slug}-${TAG}.png`) });
    for (const [i, f] of report.figures.entries()) {
      const { crop } = f;
      delete f.crop;
      const clip = { x: crop.x, y: crop.y, width: Math.min(crop.width, 1440 - crop.x), height: Math.min(crop.height, 900 - crop.y) };
      await p.screenshot({ path: path.join(OUT, `${slug}-${TAG}-figure${i}.png`), clip });
    }
  } catch (e) {
    report.error = String(e.message || e).split("\n")[0];
    await p.screenshot({ path: path.join(OUT, `error-${TAG}.png`) }).catch(() => {});
  }
  console.log(JSON.stringify(report, null, 2));
  await b.close();
})();
