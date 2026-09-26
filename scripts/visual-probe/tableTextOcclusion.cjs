/**
 * Tabletop text occlusion — is every label on the plane actually VISIBLE, end
 * to end, in the real browser? (#899)
 *
 * The tabletop plane is `preserve-3d`: the browser orders its pieces by 3D
 * depth, not z-index. #868 raised the LARGE name pill's z-index, a test read
 * the z-index back, and the pill still read "King Kon" live — a token disc
 * covered its end. Neither z-index nor elementFromPoint says what is painted,
 * so this compares PIXELS. For each label it takes three shots of the label's
 * on-screen box:
 *
 *   A  the scene as the player sees it;
 *   B  the plane with ONLY the label visible (everything else visibility:hidden);
 *   D  the plane with nothing visible.
 *
 * The label's own pixels are where B differs from D (eroded by a pixel, so an
 * anti-aliased edge that blends with its backdrop doesn't count). The label is
 * on top at a pixel when A shows the label's pixel there (A ≈ B). Each label is scored on
 * its LEFT and RIGHT end (the outer 30% of its box) — where a neighbouring
 * token cuts in — as the fraction of its own pixels the scene shows. The scene
 * is shot again last; a label whose box changed meanwhile (a piece mid-move on
 * the AI's turn) is reported `unstable`, not scored — and fails if it's a pill.
 *
 * It measures every LARGE name pill (`[data-band-label]`, the pass/fail check:
 * both ends ≥ PASS_FRACTION, and at least one pill found) and reports every other text on the plane (HP
 * badges, chips, walk-ghost initials, item badges) the same way.
 *
 * The game is a real one against the default engine: King Kong vs AI·E. It
 * measures after Kong's setup tail placement (`--tail <space>`, default the
 * first pick), then after a boosted Maneuver to `--walk <space>` (on Secluded
 * Temple, `--tail s6 --walk s14` leaves Kong on two adjacent spaces side by
 * side — a horizontal band; start spaces are random, so a flag that doesn't
 * apply falls back to the first pick). `--walk mid` aims at the band's
 * midpoint instead, which enters stepping: it keeps the head end, measures the
 * mid-walk state (walk ghost + initials), then steps on to the commit.
 *
 * Usage (a dev server must already be running):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *   PROBE_URL=http://localhost:3899 PROBE_MAP="Secluded Temple" \
 *     node scripts/visual-probe/tableTextOcclusion.cjs \
 *       --device desktop|phone|portrait [--tail s6] [--walk s14] [--out <dir>]
 *
 * `desktop` is a 1440×900 Chromium window at 2× pixels; `phone` is WebKit
 * with "iPhone 14 landscape". (`portrait` is "iPhone 14", which always draws
 * the flat board since #870 — it reports "no tabletop".) Prints one JSON
 * object, writes a zoomed crop of each pill per stage, and exits 1 if a pill
 * fails (or none is found) at any stage.
 */
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

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
const DEVICE = arg("--device", "desktop");
const TAIL = arg("--tail", null);
const WALK = arg("--walk", null);
const OUT = arg("--out", path.join(require("os").tmpdir(), "table-text-occlusion"));
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.PROBE_URL || "http://localhost:3000";
const PROBE_MAP = process.env.PROBE_MAP || "Secluded Temple";

/** A label end passes when the scene shows at least this much of its own pixels. */
const PASS_FRACTION = 0.97;
/** Summed |ΔRGB| above which B differs from D, i.e. the label paints the pixel. */
const PAINT_DELTA = 90;
/** Summed |ΔRGB| under which A matches B, i.e. the scene shows the label's pixel. */
const MATCH_DELTA = 60;
/** Each end is this outer fraction of the label's box. */
const END_FRACTION = 0.3;

const PLANE = "[data-table-stage-plane]";
const HIDE_ALL = `${PLANE}, ${PLANE} * { visibility: hidden !important; }`;
const SHOW_TARGET = `[data-occlusion-target], [data-occlusion-target] * { visibility: visible !important; }`;

/** Runs in the page: tag every visible label on the plane, return their boxes. */
const tagTexts = (plane) => {
  const root = document.querySelector(plane);
  if (!root) return [];
  const leaves = [...root.querySelectorAll("*")].filter(
    (el) =>
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) &&
      getComputedStyle(el).visibility !== "hidden" &&
      Number(getComputedStyle(el).opacity) > 0.05
  );
  // Score a label by its CHIP — the nearest small ancestor that paints a
  // background (a badge's disc, a pill) — not by its bare glyph strokes, which
  // are too thin to survive the one-pixel erosion.
  const paints = (el) => {
    const cs = getComputedStyle(el);
    return cs.backgroundImage !== "none" || !/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor);
  };
  const chipOf = (leaf) => {
    const area = (el) => el.getBoundingClientRect().width * el.getBoundingClientRect().height;
    for (let el = leaf, depth = 0; el && el !== root && depth < 4; el = el.parentElement, depth++) {
      if (area(el) > 6 * Math.max(area(leaf), 1)) break;
      if (paints(el)) return el;
    }
    return leaf;
  };
  return [...new Set(leaves.map(chipOf))]
    .map((el, i) => {
      el.setAttribute("data-occlusion-id", String(i));
      const r = el.getBoundingClientRect();
      const owner = el.closest("[data-band-label]")
        ? "band-label"
        : el.closest("[data-move-ghost]")
          ? "walk-ghost"
          : el.closest("[data-space-badge]")
            ? "space-badge"
            : el.closest("[data-fighter-id]")
              ? `fighter ${el.closest("[data-fighter-id]").getAttribute("data-fighter-id")}`
              : "plane";
      const band = el.closest("[data-band-label]")?.getAttribute("data-band-label") ?? null;
      return { id: String(i), text: el.textContent.trim(), owner, band, x: r.x, y: r.y, w: r.width, h: r.height };
    })
    .filter((t) => t.w > 1 && t.h > 1 && t.x + t.w > 0 && t.y + t.h > 0 && t.x < innerWidth && t.y < innerHeight);
};

const setStyle = (p, css) =>
  p.evaluate((c) => {
    let s = document.getElementById("occlusion-probe-style");
    if (!s) {
      s = document.createElement("style");
      s.id = "occlusion-probe-style";
      document.head.appendChild(s);
    }
    s.textContent = c;
  }, css);

const raw = async (buf) => {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
};

/** Shoots A/B/D for one text leaf and scores its two ends. */
const checkText = async (p, t) => {
  const vw = p.viewportSize();
  const x = Math.max(0, Math.floor(t.x));
  const y = Math.max(0, Math.floor(t.y));
  const clip = { x, y, width: Math.min(vw.width, Math.ceil(t.x + t.w)) - x, height: Math.min(vw.height, Math.ceil(t.y + t.h)) - y };
  if (clip.width < 2 || clip.height < 2) return null;
  await p.evaluate((id) => document.querySelector(`[data-occlusion-id="${id}"]`)?.setAttribute("data-occlusion-target", ""), t.id);
  await setStyle(p, "");
  const A = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, `${HIDE_ALL}\n${SHOW_TARGET}`);
  const B = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, HIDE_ALL);
  const D = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, "");
  // The scene again: if it changed while B and D were shot (the AI moving a
  // piece, a damage number), the comparison is meaningless — say so.
  const A2 = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await p.evaluate(() => document.querySelectorAll("[data-occlusion-target]").forEach((e) => e.removeAttribute("data-occlusion-target")));
  if (process.env.OCCLUSION_DEBUG) {
    for (const [k, img] of Object.entries({ A, B, D }))
      await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } }).resize(img.w * 4, img.h * 4, { kernel: "nearest" }).toFile(path.join(OUT, `dbg-${t.id}-${k}.png`));
  }

  const ends = { left: { own: 0, shown: 0 }, right: { own: 0, shown: 0 } };
  const d = (P, Q, i) => Math.abs(P.data[i] - Q.data[i]) + Math.abs(P.data[i + 1] - Q.data[i + 1]) + Math.abs(P.data[i + 2] - Q.data[i + 2]);
  // The label's own pixels, eroded by one pixel: an anti-aliased rim or glyph
  // edge blends with whatever is behind it, so only SOLID label pixels count.
  const painted = (xx, yy) => xx >= 0 && yy >= 0 && xx < A.w && yy < A.h && d(B, D, (yy * A.w + xx) * 3) >= PAINT_DELTA;
  const solid = (xx, yy) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!painted(xx + dx, yy + dy)) return false;
    return true;
  };
  for (let yy = 0; yy < A.h; yy++) {
    for (let xx = 0; xx < A.w; xx++) {
      const end = xx < A.w * END_FRACTION ? ends.left : xx >= A.w * (1 - END_FRACTION) ? ends.right : null;
      if (!end) continue;
      const i = (yy * A.w + xx) * 3;
      if (!solid(xx, yy)) continue;
      end.own++;
      if (d(A, B, i) < MATCH_DELTA) end.shown++;
    }
  }
  const frac = (e) => (e.own ? +(e.shown / e.own).toFixed(3) : null);
  let moved = 0;
  for (let i = 0; i < A.data.length; i += 3) if (d(A, A2, i) >= MATCH_DELTA) moved++;
  if (moved > (A.data.length / 3) * 0.02) return { id: t.id, text: t.text, owner: t.owner, unstable: true };
  return { id: t.id, text: t.text, owner: t.owner, left: frac(ends.left), right: frac(ends.right), ownPx: ends.left.own + ends.right.own };
};

const passes = (r) => !!r && r.left !== null && r.right !== null && r.left >= PASS_FRACTION && r.right >= PASS_FRACTION;

const press = async (loc) => (DEVICE === "desktop" ? loc.click() : loc.tap());
const pickIds = (p) => p.$$eval(`${PLANE} [data-pick][data-space-id][title]`, (els) => els.map((e) => e.getAttribute("data-space-id")));
const clickPick = (p, id) => p.evaluate(([plane, s]) => document.querySelector(`${plane} [data-pick][data-space-id="${s}"][title]`).click(), [PLANE, id]);

/** A band's on-screen angle, 0° = left-right, 90° = far-near. */
const bandAngle = (p, fighterId) =>
  p.evaluate((id) => {
    const c = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const tail = c(`[data-fighter-id="${id}-tail"] [data-fighter-base]`);
    const head = c(`[data-fighter-id="${id}"]`);
    if (!tail || !head) return null;
    const deg = (Math.abs(Math.atan2(tail.y - head.y, tail.x - head.x)) * 180) / Math.PI;
    return Math.round(deg > 90 ? 180 - deg : deg);
  }, fighterId);

const measure = async (p, stage) => {
  const texts = await p.evaluate(tagTexts, PLANE);
  const results = [];
  for (const t of texts) {
    const r = await checkText(p, t);
    if (r) results.push(r);
  }
  // Every LARGE fighter's pill (the AI may draw one too), each with a crop.
  const pills = [];
  for (const box of texts.filter((t) => t.owner === "band-label")) {
    const r = results.find((x) => x.id === box.id);
    const pad = 36;
    const shot = await p.screenshot({ clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.w + 2 * pad, height: box.h + 2 * pad } });
    const meta = await sharp(shot).metadata();
    const scale = DEVICE === "desktop" ? 2 : 4;
    const file = path.join(OUT, `${DEVICE}-${stage}-pill-${box.text.replace(/\W+/g, "_")}.png`);
    await sharp(shot).resize(meta.width * scale, meta.height * scale, { kernel: "nearest" }).toFile(file);
    pills.push({ ...r, bandAngleDeg: await bandAngle(p, box.band), passes: passes(r), crop: file });
  }
  await p.screenshot({ path: path.join(OUT, `${DEVICE}-${stage}-full.png`) });
  return { pills, otherTexts: results.filter((r) => r.owner !== "band-label") };
};

(async () => {
  const b = DEVICE === "desktop" ? await pw.chromium.launch() : await pw.webkit.launch();
  const ctx = await b.newContext(
    DEVICE === "phone"
      ? pw.devices["iPhone 14 landscape"]
      : DEVICE === "portrait"
        ? pw.devices["iPhone 14"]
        : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
  );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));

  await p.goto(`${BASE}/pro/game`);
  await p.waitForTimeout(6000);
  await press(p.getByRole("button", { name: "AI·E", exact: true }));
  await press(p.getByRole("button", { name: /^King Kong by/ }).first());
  const stage = p.getByRole("button", { name: PROBE_MAP, exact: true });
  if (!(await stage.count())) {
    const more = p.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await press(more.first());
  }
  await press(stage.first());
  await press(p.getByRole("button", { name: "PLAY VS AI" }));
  await p.waitForTimeout(12000);
  const keep = p.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await press(keep);
  await p.waitForTimeout(3000);
  if (DEVICE === "desktop") {
    const toTable = p.getByRole("button", { name: "Flat board" });
    await toTable.waitFor({ timeout: 60000 });
    await press(toTable);
  } else {
    await press(p.locator('[aria-label="Game menu"]').first());
    await p.waitForTimeout(500);
    const item = p.getByRole("menuitem", { name: /Board — /i });
    if (await item.count()) await item.evaluate((el) => el.click());
  }
  await p.waitForTimeout(3000);

  const report = { device: DEVICE, map: PROBE_MAP, passFraction: PASS_FRACTION, stages: {} };
  let failed = false;
  try {
    if (!(await p.$(PLANE))) {
      report.error = "no tabletop (this viewport draws the flat board)";
    } else {
      // 1. Kong's setup: place the tail.
      const setupPicks = await pickIds(p);
      const tail = TAIL && setupPicks.includes(TAIL) ? TAIL : setupPicks[0];
      report.tailPicks = setupPicks;
      if (tail) {
        await clickPick(p, tail);
        report.tail = tail;
        await p.waitForTimeout(3000);
      }
      report.stages.setup = await measure(p, "setup");

      // 2. A boosted maneuver to --walk (or the first pick), committed.
      const maneuver = p.getByRole("button", { name: /^\d*\s*maneuver/i });
      let ready = false;
      for (let t = 0; t < 120 && !ready; t++) {
        ready = (await maneuver.count()) > 0;
        if (!ready) await p.waitForTimeout(1000);
      }
      if (ready) {
        await press(maneuver.first());
        await p.waitForTimeout(1500);
        const boosts = p.getByRole("button", { name: /^\d*\s*Boost \+\d/i });
        const labels = await boosts.allInnerTexts();
        const best = labels.map((t, i) => [Number(/\+(\d+)/.exec(t)[1]), i]).sort((a, c) => c[0] - a[0])[0];
        if (best) await press(boosts.nth(best[1]));
        await p.waitForTimeout(1500);
        const walkPicks = await pickIds(p);
        // `--walk mid`: the pick nearest the band's midpoint, which (unlike
        // most first clicks) enters STEPPING — the server asks which end to
        // keep, and then a walk ghost stands on the board.
        const kongSpaces = await p.evaluate(() => {
          const tail = document.querySelector('[data-fighter-id$="-tail"] [data-fighter-base]');
          const tailId = tail?.closest("[data-fighter-id]")?.getAttribute("data-fighter-id") ?? "";
          // The head's id sits on its token FACE; its base is the one nearest it.
          const face = document.querySelector(`[data-fighter-id="${tailId.replace(/-tail$/, "")}"]`);
          if (!tail || !face) return [];
          const c = (el) => {
            const r = el.getBoundingClientRect();
            return [r.x + r.width / 2, r.y + r.height / 2];
          };
          const f = c(face);
          const bases = [...document.querySelectorAll("[data-fighter-base][data-space-id]")].filter((b) => b !== tail);
          bases.sort((a, b) => Math.hypot(c(a)[0] - f[0], c(a)[1] - f[1]) - Math.hypot(c(b)[0] - f[0], c(b)[1] - f[1]));
          return [bases[0], tail].map((el) => el?.getAttribute("data-space-id")).filter(Boolean);
        });
        const midPick = () =>
          p.evaluate(([plane, own]) => {
            const c = (el) => {
              const r = el.getBoundingClientRect();
              return [r.x + r.width / 2, r.y + r.height / 2];
            };
            const ends = own.map((id) => document.querySelector(`${plane} [data-space-id="${id}"][title]`)).filter(Boolean).map(c);
            if (ends.length < 2) return null;
            const m = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
            const picks = [...document.querySelectorAll(`${plane} [data-pick][data-space-id][title]`)].filter((e) => !own.includes(e.getAttribute("data-space-id")));
            picks.sort((a, b) => Math.hypot(c(a)[0] - m[0], c(a)[1] - m[1]) - Math.hypot(c(b)[0] - m[0], c(b)[1] - m[1]));
            return picks[0]?.getAttribute("data-space-id") ?? null;
          }, [PLANE, kongSpaces]);
        const walk = WALK === "mid" ? ((await midPick()) ?? walkPicks[0]) : WALK && walkPicks.includes(WALK) ? WALK : walkPicks[0];
        report.walk = walk;
        await clickPick(p, walk);
        await p.waitForTimeout(3000);
        // Keep-which-end prompt: its picks are Kong's own spaces. Keep the head.
        const endPicks = await pickIds(p);
        if (kongSpaces.length && endPicks.length && endPicks.every((id) => kongSpaces.includes(id))) {
          report.keptEnd = kongSpaces[0];
          await clickPick(p, kongSpaces[0]);
          await p.waitForTimeout(3000);
        }
        if (await p.$("[data-move-ghost]")) {
          report.stages.midWalk = await measure(p, "mid-walk");
          // Step on until the walk commits.
          for (let i = 0; i < 6 && (await p.$("[data-move-ghost]")); i++) {
            const next = (await pickIds(p))[0];
            if (!next) break;
            await clickPick(p, next);
            await p.waitForTimeout(2000);
          }
        }
        report.stages.walk = await measure(p, "walk");
      } else {
        report.walkError = "no Maneuver action appeared";
      }
    }
  } catch (e) {
    report.error = String(e.message || e).split("\n")[0];
  }
  for (const s of Object.values(report.stages)) if (!s.pills.length || s.pills.some((x) => !x.passes)) failed = true;
  console.log(JSON.stringify(report, null, 2));
  await b.close();
  process.exit(failed || report.error ? 1 : 0);
})();
