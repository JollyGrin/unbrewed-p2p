/**
 * Tabletop miniature base — does the base BAKED INTO a miniature's render
 * draw as the same ellipse as the board's own flat discs? (#926)
 *
 * A miniature is a pre-rendered image, so its base is whatever ellipse the
 * render camera saw; everything flat on the board (a space, a flat token, the
 * seat-colored base disc under the miniature) is foreshortened live by the
 * browser. The renders were once taken from the wrong elevation and their
 * bases came out ~16% flatter than the disc they stand on. A screenshot shows
 * that as "slightly off"; this measures it.
 *
 * At each board point (far / middle / near rows × left / centre / right) it
 * stands the hero's miniature there (the dev-only figure probe,
 * lib/pro/tableFigureProbe.ts — only WHERE the piece stands is forced) and
 * reads, in device px:
 *
 *   disc   the in-plane base disc under the miniature — a plain circle in the
 *          board plane, the same thing a flat token is.
 *   mini   the miniature's own pixels (the base baked into its render).
 *
 * Both are shot ALONE over green and read from their pixels the same way:
 * `width` is the chord on the feet line (the ellipse's full width), `front`
 * how far the lowest pixel reaches below the feet point (its front half).
 * Pixels, not getBoundingClientRect: off the board's centre line a flat
 * circle projects to a slanted ellipse whose bounding box is wider than it.
 *
 * `ratio` = 2 × front ÷ width, the ellipse's height:width. `ratioError` is
 * mini ÷ disc − 1 (0 = the same ellipse; about −0.16 = the old renders);
 * `widthError` is the same for the widths (0 = the model's base spans the
 * disc). The miniature is also stood beside the first flat token on the
 * board (a sidekick, a board object), in its row, and compared with that
 * token's own ellipse (`besideToken.ratioVsToken`). Everything is measured at the resting view and
 * again zoomed in (`--zoom`, wheel notches; 0 skips it). The board's tilt is
 * DEFAULT_TILT_DEG everywhere — there is no tilt control to vary.
 *
 * Usage (a dev server must be running; the hero needs a figure in the set the
 * tabletop draws — the committed open set has Baba Yaga and Hollow Oak):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:3000 \
 *     node scripts/visual-probe/tableFigureBase.cjs [--hero "Baba Yaga"] [--zoom 4] [--out <dir>]
 *
 * It prints one JSON object and writes, per point, the scene and the
 * miniature alone. A point that runs off the screen once zoomed is `skipped`.
 * Exit 1 when any point's |ratioError| exceeds --tolerance (default 0.08; one
 * device px of `front` is 2–4% at these sizes).
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install, e.g.\n  PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright node scripts/visual-probe/tableFigureBase.cjs");
  process.exit(2);
}
const pw = require(PW_PATH);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const HERO = arg("--hero", "Baba Yaga");
const ZOOM_NOTCHES = Number(arg("--zoom", "4"));
const TOLERANCE = Number(arg("--tolerance", "0.08"));
const OUT = arg("--out", path.join(require("os").tmpdir(), "table-figure-base"));
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PROBE_URL || "http://localhost:3000";
const PROBE_MAP = process.env.PROBE_MAP || "Secluded Temple";
const DSF = 2;

const PLANE = "[data-table-stage-plane]";
const POINTS = [
  ["far-left", 0.12, 0.12],
  ["far-centre", 0.5, 0.12],
  ["far-right", 0.88, 0.12],
  ["mid-left", 0.12, 0.5],
  ["mid-centre", 0.5, 0.5],
  ["mid-right", 0.88, 0.5],
  ["near-left", 0.12, 0.88],
  ["near-centre", 0.5, 0.88],
  ["near-right", 0.88, 0.88],
];

/** One target alone over green. Its ancestors stay visible (a hidden
 *  ancestor changes how the preserve-3d tree composites — see
 *  tableTextOcclusion.cjs) but paint nothing; the glow filters are dropped so
 *  only the target's own pixels count. A flat disc is painted solid magenta:
 *  its own fill is a translucent gradient. */
const ALONE = `
  html, body { visibility: visible !important; background: #00FF00 !important; }
  * { visibility: hidden !important; filter: none !important; animation: none !important; }
  [data-fp-anc]:not(html):not(body) { visibility: visible !important; background: none !important; box-shadow: none !important; border-color: transparent !important; }
  [data-fp-target] { visibility: visible !important; }
  [data-fp-target="flat"] { background: #FF00FF !important; border-color: #FF00FF !important; box-shadow: none !important; }
`;

/**
 * In the page: tag one target and return its feet point (CSS px).
 *   "mini"  the hero miniature's two image halves
 *   "disc"  the in-plane base disc under that miniature
 *   "token" the first flat token's bottom layer (a sidekick, a board object)
 */
const tagTarget = ([plane, which]) => {
  document.querySelectorAll("[data-fp-anc],[data-fp-target]").forEach((el) => {
    el.removeAttribute("data-fp-anc");
    el.removeAttribute("data-fp-target");
  });
  const img = document.querySelector(`${plane} img[data-table-figure]`);
  if (!img) return { error: "no miniature on the plane (no img[data-table-figure]) — does this hero have a figure?" };
  const anchorOf = (el) => {
    let a = el;
    while (a && !(a.style.left.endsWith("%") && a.style.top.endsWith("%"))) a = a.parentElement;
    return a;
  };
  const heroAnchor = anchorOf(img);
  const token = document.querySelector(`${plane} [data-standee-ground] [data-fighter-base]`);
  const targets =
    which === "mini"
      ? [...heroAnchor.querySelectorAll("img[data-table-figure], img[data-table-figure-ground]")]
      : which === "disc"
        ? [...heroAnchor.querySelectorAll(":scope > [data-fighter-base]")]
        : token
          ? [token]
          : [];
  if (targets.length === 0) return { error: `no ${which} to measure` };
  const anchor = anchorOf(targets[0]);
  for (const el of targets) {
    el.setAttribute("data-fp-target", which === "mini" ? "image" : "flat");
    for (let a = el.parentElement; a; a = a.parentElement) a.setAttribute("data-fp-anc", "");
  }
  // The feet: the anchor's bottom centre, where its zero-size ground box is.
  const ground = anchor.querySelector(":scope > [data-standee-ground]");
  const mark = ground ?? anchor.appendChild(Object.assign(document.createElement("div"), { style: "position:absolute;left:50%;top:100%;width:0;height:0" }));
  const r = mark.getBoundingClientRect();
  if (!ground) mark.remove();
  return {
    feet: { x: r.left, y: r.top },
    at: { x: parseFloat(anchor.style.left) / 100, y: parseFloat(anchor.style.top) / 100 },
  };
};

/** The target's own pixels in a green-backed shot, around its feet. */
const readShape = async (png, feet) => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const own = (x, y) => {
    const i = (y * width + x) * channels;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // Anything that is not the backdrop; a half-blended edge pixel counts
    // once it is more target than green.
    return !(g > 200 && r < 110 && b < 110);
  };
  const rowSpan = (y) => {
    let x0 = -1;
    let x1 = -1;
    for (let x = 0; x < width; x++) {
      if (!own(x, y)) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
    }
    return x0 < 0 ? null : { x0, x1, w: x1 - x0 + 1 };
  };
  let bottom = -1;
  for (let y = height - 1; y >= 0 && bottom < 0; y--) if (rowSpan(y)) bottom = y;
  if (bottom < 0) return null;
  const fy = Math.round(feet.y * DSF);
  // The base's full diameter lies on the feet line; take the widest of the
  // rows around it so a one-row seam between the two halves cannot decide it.
  let widest = null;
  for (let y = Math.max(0, fy - 2); y <= Math.min(height - 1, fy + 3); y++) {
    const s = rowSpan(y);
    if (s && (!widest || s.w > widest.w)) widest = s;
  }
  if (!widest) return null;
  const front = (bottom + 1) / DSF - feet.y;
  const w = widest.w / DSF;
  // A target that runs off the shot (zoomed in, a point near the rim) has
  // no full chord to measure.
  const clipped = widest.x0 === 0 || widest.x1 === width - 1 || bottom === height - 1;
  return { width: w, front, ratio: (2 * front) / w, centreX: (widest.x0 + widest.x1 + 1) / 2 / DSF - feet.x, clipped };
};

const round = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : v);
const tidy = (m) => ({ width: round(m.width, 1), front: round(m.front, 1), ratio: round(m.ratio), centreX: round(m.centreX, 1) });

/** Shoot one target alone and read its ellipse: chord on the feet line, and
 *  how far it reaches below the feet. */
const shape = async (p, which, shotName) => {
  const tag = await p.evaluate(tagTarget, [PLANE, which]);
  if (tag.error) return { error: tag.error };
  const style = await p.addStyleTag({ content: ALONE });
  await p.waitForTimeout(150);
  const png = await p.screenshot();
  await style.evaluate((el) => el.remove());
  if (shotName) fs.writeFileSync(path.join(OUT, `${shotName}.png`), png);
  const m = await readShape(png, tag.feet);
  return m ? { ...m, at: tag.at } : { error: `the ${which} drew no pixels (off screen?)` };
};

const measureAt = async (p, label, point, shotName) => {
  await p.evaluate((detail) => window.dispatchEvent(new CustomEvent("table-figure-probe", { detail })), point);
  await p.waitForTimeout(700);
  if (shotName) await p.screenshot({ path: path.join(OUT, `${shotName}.png`) });
  const disc = await shape(p, "disc");
  const mini = await shape(p, "mini", shotName ? `${shotName}-mini` : null);
  if (disc.error || mini.error) return { label, ...point, error: disc.error ?? mini.error };
  if (disc.clipped || mini.clipped) return { label, ...point, skipped: "runs off the screen at this zoom" };
  return {
    label,
    ...point,
    disc: tidy(disc),
    mini: tidy(mini),
    ratioError: round(mini.ratio / disc.ratio - 1),
    widthError: round(mini.width / disc.width - 1),
  };
};

const measureAll = async (p, tag) => {
  const points = [];
  for (const [label, x, y] of POINTS) points.push(await measureAt(p, label, { x, y }, `${tag}-${label}`));
  let besideToken = null;
  const token = await shape(p, "token");
  if (!token.error && !token.clipped) {
    const x = token.at.x > 0.5 ? token.at.x - 0.12 : token.at.x + 0.12;
    const at = await measureAt(p, "beside-token", { x, y: token.at.y }, `${tag}-beside-token`);
    besideToken = {
      ...at,
      token: { ...tidy(token), x: round(token.at.x), y: round(token.at.y) },
      ratioVsToken: at.mini ? round(at.mini.ratio / token.ratio - 1) : null,
    };
  }
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("table-figure-probe", { detail: null })));
  const errors = [...points, ...(besideToken ? [besideToken] : [])]
    .filter((pt) => pt.ratioError !== undefined)
    .map((pt) => Math.abs(pt.ratioError));
  return { worstRatioError: errors.length ? round(Math.max(...errors)) : null, points, besideToken };
};

(async () => {
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));

  await p.goto(`${BASE}/pro/game`);
  await p.waitForTimeout(6000);
  await p.getByRole("button", { name: "AI·E", exact: true }).click();
  await p
    .getByRole("button", { name: new RegExp(`^${HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} by`) })
    .first()
    .click();
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
  for (let attempt = 0; attempt < 3 && !(await p.$(PLANE)); attempt++) {
    if (await keep.count()) await keep.click().catch(() => {});
    const toTable = p.getByRole("button", { name: "Flat board" });
    await toTable.waitFor({ timeout: 60000 });
    await toTable.click();
    await p.waitForTimeout(3000);
  }

  const report = { hero: HERO, map: PROBE_MAP, tolerance: TOLERANCE, out: OUT, views: {} };
  if (!(await p.$(PLANE))) {
    report.error = "no tabletop view";
  } else {
    const reset = p.getByRole("button", { name: /reset view/i });
    if (await reset.count()) {
      await reset.first().evaluate((el) => el.click());
      await p.waitForTimeout(1200);
    }
    report.views.rest = await measureAll(p, "rest");
    if (ZOOM_NOTCHES > 0) {
      const box = await p.locator(PLANE).boundingBox();
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < ZOOM_NOTCHES; i++) {
        await p.mouse.wheel(0, -120);
        await p.waitForTimeout(120);
      }
      await p.waitForTimeout(800);
      report.views.zoomed = await measureAll(p, "zoomed");
    }
  }
  console.log(JSON.stringify(report, null, 2));
  await b.close();
  const worst = Object.values(report.views).map((v) => v.worstRatioError ?? Infinity);
  process.exit(report.error || worst.length === 0 || worst.some((w) => !(w <= TOLERANCE)) ? 1 : 0);
})();
