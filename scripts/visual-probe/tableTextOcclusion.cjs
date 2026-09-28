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
 *   B  the plane with ONLY the label visible (everything else visibility:hidden
 *      but the label's own transparent ancestors — see SHOW_TARGET);
 *   D  the plane with nothing visible.
 *
 * The label's own pixels are where B differs from D (eroded by a pixel, so an
 * anti-aliased edge that blends with its backdrop doesn't count). The label is
 * on top at a pixel when A shows the label's pixel there (A ≈ B). Each label is scored on
 * its LEFT and RIGHT end (the outer 30% of its box) — where a neighbouring
 * token cuts in — as the fraction of its own pixels the scene shows. The scene
 * is shot again last; a label whose box changed meanwhile (a piece mid-move on
 * the bot's turn) is reported `unstable`, not scored — and fails if it's a pill.
 *
 * It measures every LARGE name pill (`[data-band-label]`, the pass/fail check:
 * both ends ≥ PASS_FRACTION, and at least one pill found when the hero is
 * King Kong) and reports every other text on the plane (chips, walk-ghost
 * initials, item badges) the same way.
 *
 * FIGHTER BADGES (#902) are pass/fail too: every `[data-fighter-badge]` (HP
 * heart, reach glyph, flag, status dot, "reach 2" tag, pick number, chip) is a
 * target whether or not it holds text — the reach glyph is an icon only, which
 * is how #900's text-only pass missed its bite. A badge is scored on its left
 * and right ends, its BOTTOM 30% (a token disc bites a low badge from below)
 * and its whole box, and passes when all four are ≥ PASS_FRACTION; at least
 * one measured hp and reach badge must be found (a badge with no pixels of
 * its own even alone on the plane is under page chrome — reported
 * `unmeasured`, not scored). The badge is painted solid
 * magenta in every shot (several are translucent, which would read as
 * "covered" wherever the backdrop differs), and its B and D shots are taken
 * over a flat green backdrop. A fourth shot, C, shows the target with the
 * piece's OTHER badges and its own LARGE name pill: pixels where one of those
 * covers the target (on a small phone token the "reach 2" tag overlaps the
 * reach glyph; Kong's pill is meant to read over his head's badges) are a
 * layout overlap, not a depth bug — counted as `siblingPx`, never scored. The page
 * is opened with the dev-only `?badgeProbe` (lib/pro/tableBadgeProbe.ts) so
 * every fighter wears every badge — drop it with `--no-badge-probe`. Each
 * fighter's badges are cropped (token + badges, zoomed) per stage.
 *
 * The game is a real one against the default engine: King Kong vs Bot·E. It
 * measures after Kong's setup tail placement (`--tail <space>`, default the
 * first pick), then after a boosted Maneuver to `--walk <space>` (on Secluded
 * Temple, `--tail s6 --walk s14` leaves Kong on two adjacent spaces side by
 * side — a horizontal band; start spaces are random, so a flag that doesn't
 * apply falls back to the first pick). `--walk mid` aims at the band's
 * midpoint instead, which enters stepping: it keeps the head end, measures the
 * mid-walk state (walk ghost + initials), then steps on to the commit.
 *
 * `--hero "<name>"` picks the hero (default King Kong); a one-space hero has
 * no tail to place, so the setup stage is just the opening board.
 *
 * Usage (a dev server must already be running):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *   PROBE_URL=http://localhost:3899 PROBE_MAP="Secluded Temple" \
 *     node scripts/visual-probe/tableTextOcclusion.cjs \
 *       --device desktop|phone|android|portrait [--hero "Darth Maul"] [--viewport 1024x640] [--tail s6] [--walk s14] [--out <dir>]
 *
 * `desktop` is a 1440×900 Chromium window at 2× pixels; `phone` is WebKit
 * with "iPhone 14 landscape"; `android` is Chromium with "Pixel 7 landscape" —
 * the engines differ: Chromium depth-sorts the plane per pixel (a token disc
 * can bite a badge standing in its plate), WebKit orders whole flattened
 * layers, so a phone-sized board needs both. (`portrait` is "iPhone 14", which always draws
 * the flat board since #870 — it reports "no tabletop".) Prints one JSON
 * object, writes a zoomed crop of each pill and each fighter's badges per
 * stage, and exits 1 if a pill or a fighter badge fails (or none is found) at
 * any stage.
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
const HERO = arg("--hero", "King Kong");
const BADGE_PROBE = !process.argv.includes("--no-badge-probe");
/** `--viewport 1024x640`: a smaller desktop window (smaller spaces, so a
 *  lower badge plate — where the reach glyph sank into its own token). */
const VIEWPORT = arg("--viewport", null);
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
/** The target's ANCESTORS stay visible too (they are transparent boxes; every
 *  other element is hidden by name). A hidden ancestor changes how the browser
 *  composites the preserve-3d tree, and the target then drew somewhere else
 *  in B than in the scene. */
const SHOW_TARGET = `[data-occlusion-target], [data-occlusion-target] *, [data-occlusion-ancestor] { visibility: visible !important; }`;
/** B/D backdrop for a fighter badge: pure green behind the hidden plane. */
const GREEN_BACKDROP = `:has(> ${PLANE}) { background: #00FF00 !important; }`;
/** A fighter badge is painted solid magenta in EVERY shot. Several are
 *  translucent (the reach glyph's dark plate, the chip), so their own pixels
 *  show whatever is behind them and never match between the scene and the
 *  green-backed B shot even when nothing covers them. Opaque, the check is
 *  exactly "how much of this box does the scene cover". */
const SHOW_ANCESTORS = `[data-occlusion-ancestor] { visibility: visible !important; }`;
/** C (fighter badges only): the target AND its fighter's other badges, alone. */
const SHOW_SIBLINGS = `[data-occlusion-sibling], [data-occlusion-sibling] *, [data-occlusion-ancestor] { visibility: visible !important; }`;
const PAINT_TARGET = `[data-occlusion-target] { background: #FF00FF !important; border-color: #FF00FF !important; box-shadow: none !important; }`;

/** Runs in the page: tag every visible label on the plane, return their boxes. */
const tagTexts = (plane) => {
  const root = document.querySelector(plane);
  if (!root) return [];
  const shown = (el) => getComputedStyle(el).visibility !== "hidden" && Number(getComputedStyle(el).opacity) > 0.05;
  const badges = [...root.querySelectorAll("[data-fighter-badge]")].filter(shown);
  const leaves = [...root.querySelectorAll("*")].filter(
    (el) =>
      !el.closest("[data-fighter-badge]") &&
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
  return [...new Set([...badges, ...leaves.map(chipOf)])]
    .map((el, i) => {
      el.setAttribute("data-occlusion-id", String(i));
      const r = el.getBoundingClientRect();
      const owner = el.hasAttribute("data-fighter-badge")
        ? "fighter-badge"
        : el.closest("[data-band-label]")
          ? "band-label"
          : el.closest("[data-move-ghost]")
            ? "walk-ghost"
            : el.closest("[data-space-badge]")
              ? "space-badge"
              : el.closest("[data-fighter-id]")
                ? `fighter ${el.closest("[data-fighter-id]").getAttribute("data-fighter-id")}`
                : "plane";
      const band = el.closest("[data-band-label]")?.getAttribute("data-band-label") ?? null;
      const badge = el.getAttribute("data-fighter-badge");
      const fighter = el.closest("[data-badge-owner]")?.getAttribute("data-badge-owner") ?? null;
      return {
        id: String(i),
        text: el.textContent.trim(),
        owner,
        band,
        badge,
        fighter,
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
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
  // A fighter badge is found by its own pixels, never its layout box: for a
  // piece inside the tilted preserve-3d plane getBoundingClientRect can be
  // tens of px off where it paints (seen on a far-rank corner token in
  // Chromium, and on most slid badges in WebKit). So a badge is shot over
  // the whole viewport and every region below is measured on the box its
  // magenta pixels actually cover.
  // Badges and LARGE name pills are both slid along the eye ray (#902), so
  // both are located by their own magenta pixels (see below).
  const located = !!t.badge || t.owner === "band-label";
  const x = located ? 0 : Math.max(0, Math.floor(t.x));
  const y = located ? 0 : Math.max(0, Math.floor(t.y));
  const clip = located
    ? { x: 0, y: 0, width: vw.width, height: vw.height }
    : {
        x,
        y,
        width: Math.min(vw.width, Math.ceil(t.x + t.w)) - x,
        height: Math.min(vw.height, Math.ceil(t.y + t.h)) - y,
      };
  if (clip.width < 2 || clip.height < 2) return null;
  await p.evaluate((id) => {
    const el = document.querySelector(`[data-occlusion-id="${id}"]`);
    el?.setAttribute("data-occlusion-target", "");
    for (let a = el?.parentElement; a; a = a.parentElement) a.setAttribute("data-occlusion-ancestor", "");
    // A fighter badge's siblings: the other badges the same piece wears, and
    // its own LARGE name pill, which is meant to read over them (#902).
    const owner = el?.hasAttribute("data-fighter-badge") ? el.closest("[data-badge-owner]") : null;
    if (owner) {
      owner.querySelectorAll("[data-fighter-badge]").forEach((b) => b.setAttribute("data-occlusion-sibling", ""));
      const id = owner.getAttribute("data-badge-owner");
      document.querySelectorAll("[data-band-label]").forEach((b) => b.getAttribute("data-band-label") === id && b.setAttribute("data-occlusion-sibling", ""));
    }
  }, t.id);
  const paint = located ? PAINT_TARGET : "";
  const backdrop = located ? `\n${GREEN_BACKDROP}` : "";
  await setStyle(p, paint);
  const A = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, `${HIDE_ALL}\n${SHOW_TARGET}${backdrop}\n${paint}`);
  const B = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, `${HIDE_ALL}\n${SHOW_ANCESTORS}${backdrop}`);
  const D = await raw(await p.screenshot({ clip, animations: "disabled" }));
  let C = null;
  if (t.badge) {
    await setStyle(p, `${HIDE_ALL}\n${SHOW_SIBLINGS}${backdrop}\n${paint}`);
    C = await raw(await p.screenshot({ clip, animations: "disabled" }));
  }
  await setStyle(p, paint);
  // The scene again: if it changed while B and D were shot (the bot moving a
  // piece, a damage number), the comparison is meaningless — say so.
  const A2 = await raw(await p.screenshot({ clip, animations: "disabled" }));
  await setStyle(p, "");
  await p.evaluate(() => {
    document.querySelectorAll("[data-occlusion-target]").forEach((e) => e.removeAttribute("data-occlusion-target"));
    document.querySelectorAll("[data-occlusion-sibling]").forEach((e) => e.removeAttribute("data-occlusion-sibling"));
    document.querySelectorAll("[data-occlusion-ancestor]").forEach((e) => e.removeAttribute("data-occlusion-ancestor"));
  });
  const who = {
    id: t.id,
    text: t.text,
    owner: t.owner,
    ...(t.badge ? { badge: t.badge, fighter: t.fighter } : {}),
  };
  if (located) return { ...who, ...(await scoreLocated(t, { A, A2, B, C })) };

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
  if (moved > (A.data.length / 3) * 0.02) return { ...who, unstable: true };
  return {
    ...who,
    left: frac(ends.left),
    right: frac(ends.right),
    ownPx: ends.left.own + ends.right.own,
  };
};

/** Solid magenta — a located target's paint (PAINT_TARGET). */
const magentaMask = (img) => {
  const m = new Uint8Array(img.w * img.h);
  for (let j = 0; j < m.length; j++) {
    const i = j * 3;
    m[j] = img.data[i] > 190 && img.data[i + 1] < 90 && img.data[i + 2] > 190 ? 1 : 0;
  }
  return m;
};

/** How far (device px) A may sit from B — see scoreLocated. */
const ALIGN_RANGE = 160;

/**
 * Scores a located target (a fighter badge or a LARGE name pill) from its
 * MAGENTA pixels. In Chromium, hiding everything else on the plane moved the
 * target: the same pill drew ~20px apart in A and B. So B only gives the
 * target's full SHAPE (its magenta, eroded 2px so an anti-aliased rim does not
 * count; minus what C shows a sibling covering), and A is aligned to that
 * shape by the offset with the most overlap. Shown = the shape's pixels that
 * are magenta in A there. A covered target has no magenta left in A, so any
 * offset scores it low; nothing else on the page is magenta.
 */
const scoreLocated = async (t, { A, A2, B, C }) => {
  const W = A.w;
  const H = A.h;
  const mB = magentaMask(B);
  const mC = C ? magentaMask(C) : null;
  const mA = magentaMask(A);
  const mA2 = magentaMask(A2);
  const at = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
  // Shown = magenta in A within 1px: B can render a hair larger or smaller
  // than the scene (a separate composite), and the shape is eroded by 2px, so
  // a real cover still reads as uncovered pixels.
  const near = (m, x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(m, x + dx, y + dy)) return true;
    return false;
  };
  const E = 2;
  const own = [];
  let siblingPx = 0;
  let [bx0, by0, bx1, by1] = [W, H, 0, 0];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!mB[y * W + x]) continue;
      let solid = true;
      for (let dy = -E; dy <= E && solid; dy++)
        for (let dx = -E; dx <= E; dx++)
          if (!at(mB, x + dx, y + dy)) {
            solid = false;
            break;
          }
      if (!solid) continue;
      if (mC && !mC[y * W + x]) {
        siblingPx++;
        continue;
      }
      own.push(x, y);
      if (x < bx0) bx0 = x;
      if (y < by0) by0 = y;
      if (x + 1 > bx1) bx1 = x + 1;
      if (y + 1 > by1) by1 = y + 1;
    }
  const n = own.length / 2;
  if (!n)
    return {
      left: null,
      right: null,
      bottom: null,
      all: null,
      ownPx: 0,
      ...(C ? { siblingPx } : {}),
    };
  // Best offset, coarse to fine.
  const overlap = (ox, oy, step = 1) => {
    let c = 0;
    for (let k = 0; k < own.length; k += 2 * step) if (at(mA, own[k] + ox, own[k + 1] + oy)) c++;
    return c;
  };
  const sub = Math.max(1, Math.floor(n / 400));
  let best = [0, 0, overlap(0, 0, sub)];
  for (let oy = -ALIGN_RANGE; oy <= ALIGN_RANGE; oy += 4)
    for (let ox = -ALIGN_RANGE; ox <= ALIGN_RANGE; ox += 4) {
      const c = overlap(ox, oy, sub);
      if (c > best[2]) best = [ox, oy, c];
    }
  const [cx, cy] = best;
  best = [cx, cy, overlap(cx, cy)];
  for (let oy = cy - 4; oy <= cy + 4; oy++)
    for (let ox = cx - 4; ox <= cx + 4; ox++) {
      const c = overlap(ox, oy);
      if (c > best[2]) best = [ox, oy, c];
    }
  const [ox, oy] = best;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const ends = {
    left: { own: 0, shown: 0 },
    right: { own: 0, shown: 0 },
    bottom: { own: 0, shown: 0 },
    all: { own: 0, shown: 0 },
  };
  let stable = 0;
  let inA = 0;
  for (let k = 0; k < own.length; k += 2) {
    const x = own[k];
    const y = own[k + 1];
    const hit = near(mA, x + ox, y + oy);
    if (hit) {
      inA++;
      if (near(mA2, x + ox, y + oy)) stable++;
    }
    const regions = [ends.all];
    if (x < bx0 + bw * END_FRACTION) regions.push(ends.left);
    if (x >= bx1 - bw * END_FRACTION) regions.push(ends.right);
    if (y >= by1 - bh * END_FRACTION) regions.push(ends.bottom);
    for (const e of regions) {
      e.own++;
      if (hit) e.shown++;
    }
  }
  if (process.env.OCCLUSION_DEBUG) {
    const m = 8;
    const box = (dx, dy) => {
      const left = Math.max(0, bx0 + dx - m);
      const top = Math.max(0, by0 + dy - m);
      return {
        left,
        top,
        width: Math.min(W, bx1 + dx + m) - left,
        height: Math.min(H, by1 + dy + m) - top,
      };
    };
    for (const [k, img, dx, dy] of [["A", A, ox, oy], ["B", B, 0, 0], ...(C ? [["C", C, 0, 0]] : [])]) {
      const b = box(dx, dy);
      if (b.width > 0 && b.height > 0)
        await sharp(img.data, { raw: { width: W, height: H, channels: 3 } })
          .extract(b)
          .resize(b.width * 4, b.height * 4, { kernel: "nearest" })
          .toFile(path.join(OUT, `dbg-${STAGE}-${t.id}-${k}.png`));
    }
  }
  if (process.env.OCCLUSION_DEBUG) {
    const map = Buffer.alloc(W * H * 3);
    for (let k = 0; k < own.length; k += 2) {
      const j = (own[k + 1] * W + own[k]) * 3;
      if (at(mA, own[k] + ox, own[k + 1] + oy)) map[j + 1] = 255;
      else map[j] = 255;
    }
    const left = Math.max(0, bx0 - 8);
    const top = Math.max(0, by0 - 8);
    await sharp(map, { raw: { width: W, height: H, channels: 3 } })
      .extract({ left, top, width: Math.min(W, bx1 + 8) - left, height: Math.min(H, by1 + 8) - top })
      .resize({ width: (Math.min(W, bx1 + 8) - left) * 4, kernel: "nearest" })
      .toFile(path.join(OUT, `dbg-${STAGE}-${t.id}-hits.png`));
  }
  // The scene moved while B/C were shot: A2 lost the pixels A showed.
  if (inA && stable < inA * 0.98) return { unstable: true };
  const frac = (e) => (e.own ? +(e.shown / e.own).toFixed(3) : null);
  return {
    left: frac(ends.left),
    right: frac(ends.right),
    bottom: frac(ends.bottom),
    all: frac(ends.all),
    ownPx: n,
    offsetPx: [ox, oy],
    ...(C ? { siblingPx } : {}),
  };
};

const passes = (r) => !!r && !r.unstable && r.left != null && r.right != null && r.left >= PASS_FRACTION && r.right >= PASS_FRACTION;
/** A fighter badge must show its whole box, and each end and its bottom that
 *  has any solid pixels of its own (a tiny tag's bottom rows can all erode). */
const badgePasses = (r) =>
  !!r && !r.unstable && r.all != null && r.all >= PASS_FRACTION && [r.left, r.right, r.bottom].every((f) => f === null || f >= PASS_FRACTION);

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

/** Waits (up to ~20s) for the table to stop moving: no finite animation or
 *  transition still running (the camera's auto-focus zoom is a CSS
 *  transition — a screenshot with `animations: "disabled"` jumps it to its
 *  end, but layout rects read mid-way do not), and every piece's rect the
 *  same twice in a row (framer-motion glides are JS, not in getAnimations). */
const settle = async (p) => {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const now = await p.evaluate((plane) => {
      const busy = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations !== Infinity).length;
      const rects = [...document.querySelectorAll(`${plane} [data-fighter-badge], ${plane} [data-band-label], ${plane} [data-fighter-base]`)]
        .map((el) => {
          const r = el.getBoundingClientRect();
          return `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)}`;
        })
        .join("|");
      return { busy, rects };
    }, PLANE);
    if (!now.busy && last !== null && now.rects === last) return true;
    last = now.rects;
    await p.waitForTimeout(500);
  }
  return false;
};

/** The stage being measured — names the OCCLUSION_DEBUG images. */
let STAGE = "";
const measure = async (p, stage) => {
  STAGE = stage;
  const settled = await settle(p);
  const texts = await p.evaluate(tagTexts, PLANE);
  const results = [];
  for (const t of texts) {
    let r = await checkText(p, t);
    // A badge or pill that fails is looked at once more after the table
    // settles again: the bot placing or moving a piece mid-measurement reads as
    // a cover for one shot, a real cover stays. Both readings are reported.
    if (r && (t.badge || t.owner === "band-label") && !(t.badge ? badgePasses(r) : passes(r))) {
      await settle(p);
      const again = await checkText(p, t);
      if (again) r = { ...again, firstReading: r };
    }
    if (r) results.push(r);
  }
  // Every LARGE fighter's pill (the bot may draw one too), each with a crop.
  const pills = [];
  for (const box of texts.filter((t) => t.owner === "band-label")) {
    const r = results.find((x) => x.id === box.id);
    const pad = 36;
    const shot = await p.screenshot({
      clip: {
        x: Math.max(0, box.x - pad),
        y: Math.max(0, box.y - pad),
        width: box.w + 2 * pad,
        height: box.h + 2 * pad,
      },
    });
    const meta = await sharp(shot).metadata();
    const scale = DEVICE === "desktop" ? 2 : 4;
    const file = path.join(OUT, `${DEVICE}-${stage}-pill-${box.text.replace(/\W+/g, "_")}.png`);
    await sharp(shot)
      .resize(meta.width * scale, meta.height * scale, { kernel: "nearest" })
      .toFile(file);
    pills.push({
      ...r,
      bandAngleDeg: await bandAngle(p, box.band),
      passes: passes(r),
      crop: file,
    });
  }
  // Every fighter badge, pass/fail, and one zoomed crop per fighter: its
  // token face plus every badge it wears.
  // A badge with NO pixels of its own in B is covered by page chrome outside
  // the plane (the HUD, the hand) or clipped by the viewport — not by the
  // table (a badge buried under a token still paints in B, and scores 0).
  // It is reported as unmeasured, not scored.
  const badges = results
    .filter((r) => r.owner === "fighter-badge")
    .map((r) => (!r.unstable && r.all == null ? { ...r, unmeasured: true, passes: true } : { ...r, passes: badgePasses(r) }));
  const crops = {};
  for (const fighter of [...new Set(texts.filter((t) => t.badge).map((t) => t.fighter))]) {
    const boxes = texts.filter((t) => t.badge && t.fighter === fighter);
    const face = await p.evaluate((id) => {
      const el = document.querySelector(`[data-badge-owner="${id}"] [data-fighter-id="${id}"]`);
      const r = el?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    }, fighter);
    // The face's rect is reliable (the ground layer is not slid); the badges'
    // are not in WebKit (see checkText), so frame the face with a margin
    // wide enough for every badge instead.
    if (face) {
      const m = Math.max(face.w, face.h) * 0.6 + 16;
      boxes.splice(0, boxes.length, {
        x: face.x - m,
        y: face.y - m,
        w: face.w + 2 * m,
        h: face.h + 2 * m,
      });
    }
    const pad = 4;
    const vw = p.viewportSize();
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const x1 = Math.min(vw.width, Math.max(...boxes.map((b) => b.x + b.w)) + pad);
    const y1 = Math.min(vw.height, Math.max(...boxes.map((b) => b.y + b.h)) + pad);
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    const shot = await p.screenshot({
      clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
    });
    const meta = await sharp(shot).metadata();
    const scale = DEVICE === "desktop" ? 3 : 5;
    const file = path.join(OUT, `${DEVICE}-${stage}-badges-${fighter.replace(/\W+/g, "_")}.png`);
    await sharp(shot)
      .resize(meta.width * scale, meta.height * scale, { kernel: "nearest" })
      .toFile(file);
    crops[fighter] = file;
  }
  await p.screenshot({ path: path.join(OUT, `${DEVICE}-${stage}-full.png`) });
  return {
    settled,
    pills,
    badges,
    badgeCrops: crops,
    otherTexts: results.filter((r) => r.owner !== "band-label" && r.owner !== "fighter-badge"),
  };
};

(async () => {
  const b = DEVICE === "desktop" || DEVICE === "android" ? await pw.chromium.launch() : await pw.webkit.launch();
  const ctx = await b.newContext(
    DEVICE === "phone"
      ? pw.devices["iPhone 14 landscape"]
      : DEVICE === "android"
        ? pw.devices["Pixel 7 landscape"]
        : DEVICE === "portrait"
          ? pw.devices["iPhone 14"]
          : {
              viewport: VIEWPORT
                ? {
                    width: +VIEWPORT.split("x")[0],
                    height: +VIEWPORT.split("x")[1],
                  }
                : { width: 1440, height: 900 },
              deviceScaleFactor: 2,
            }
  );
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));

  await p.goto(`${BASE}/pro/game${BADGE_PROBE ? "?badgeProbe" : ""}`);
  await p.waitForTimeout(6000);
  await press(p.getByRole("button", { name: "Bot·E", exact: true }));
  await press(
    p
      .getByRole("button", {
        name: new RegExp(`^${HERO.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} by`),
      })
      .first()
  );
  const stage = p.getByRole("button", { name: PROBE_MAP, exact: true });
  if (!(await stage.count())) {
    const more = p.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await press(more.first());
  }
  await press(stage.first());
  await press(p.getByRole("button", { name: "PLAY VS BOT" }));
  await p.waitForTimeout(12000);
  const keep = p.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await press(keep);
  await p.waitForTimeout(3000);
  // Switch to the tabletop; a slow engine start can leave the opening-hand
  // prompt over the toggle, so retry until the plane is there.
  for (let attempt = 0; attempt < 3 && !(await p.$(PLANE)); attempt++) {
    if (await keep.count()) await press(keep).catch(() => {});
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
  }

  const report = {
    device: DEVICE,
    viewport: VIEWPORT ?? undefined,
    hero: HERO,
    map: PROBE_MAP,
    badgeProbe: BADGE_PROBE,
    passFraction: PASS_FRACTION,
    stages: {},
  };
  let failed = false;
  try {
    if (!(await p.$(PLANE))) {
      report.error = "no tabletop (this viewport draws the flat board)";
    } else {
      // 1. Kong's setup: place the tail.
      const setupPicks = await pickIds(p);
      // Only Kong has a tail to place; any other hero's setup is the opening board.
      const tail = HERO !== "King Kong" ? null : TAIL && setupPicks.includes(TAIL) ? TAIL : setupPicks[0];
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
          p.evaluate(
            ([plane, own]) => {
              const c = (el) => {
                const r = el.getBoundingClientRect();
                return [r.x + r.width / 2, r.y + r.height / 2];
              };
              const ends = own
                .map((id) => document.querySelector(`${plane} [data-space-id="${id}"][title]`))
                .filter(Boolean)
                .map(c);
              if (ends.length < 2) return null;
              const m = [(ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2];
              const picks = [...document.querySelectorAll(`${plane} [data-pick][data-space-id][title]`)].filter(
                (e) => !own.includes(e.getAttribute("data-space-id"))
              );
              picks.sort((a, b) => Math.hypot(c(a)[0] - m[0], c(a)[1] - m[1]) - Math.hypot(c(b)[0] - m[0], c(b)[1] - m[1]));
              return picks[0]?.getAttribute("data-space-id") ?? null;
            },
            [PLANE, kongSpaces]
          );
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
  const pillsRequired = HERO === "King Kong";
  for (const s of Object.values(report.stages)) {
    if ((pillsRequired && !s.pills.length) || s.pills.some((x) => !x.passes)) failed = true;
    // Fighter badges: every one passes, and the icon-only reach glyph and the
    // HP heart are among them (an empty list would pass vacuously).
    const kinds = new Set(s.badges.filter((x) => !x.unmeasured).map((x) => x.badge));
    if (!kinds.has("hp") || !kinds.has("reach") || s.badges.some((x) => !x.passes)) failed = true;
    s.badgeSummary = {
      total: s.badges.length,
      failing: s.badges.filter((x) => !x.passes).map((x) => `${x.fighter}:${x.badge}`),
      unmeasured: s.badges.filter((x) => x.unmeasured).map((x) => `${x.fighter}:${x.badge}`),
    };
  }
  if (!Object.keys(report.stages).length) failed = true;
  console.log(JSON.stringify(report, null, 2));
  await b.close();
  process.exit(failed || report.error ? 1 : 0);
})();
