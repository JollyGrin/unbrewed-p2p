/**
 * Tabletop board view — a MEASURING device, not a screenshot tool.
 *
 * Every visual round on this view so far was lost the same way: a change was
 * made, a screenshot was taken, everyone agreed it looked better, and the
 * numbers said otherwise. The tilt in particular failed silently for two whole
 * rounds — a `rotateX` whose `perspective` never reaches the element is
 * mathematically identical to a plain vertical squash, so the spaces still
 * turn into convincing ellipses while the board flattens completely. No
 * screenshot tells you that. A ratio does.
 *
 * So this script answers the questions a render can't be trusted on:
 *
 *   edgeRatio         the board's near edge ÷ its far edge, read off four
 *                     marker dots the probe pins to the plane's corners. 1.0
 *                     means NO perspective, whatever the DOM says. The
 *                     official app measures 1.25 — that is the target.
 *   meanSpaceWidth    the average on-screen width of a space, px. This is
 *                     what a thumb has to hit; bigger is better.
 *   depthRatio        near-rank space height ÷ far-rank space height. Kept
 *                     for continuity, but NOT a perspective gauge: far spaces
 *                     get deliberately padded hit areas, so this mixes the
 *                     camera with the padding. It once rewarded a fisheye
 *                     camera (target ≥2.0) that shrank the playable board.
 *   boardFillFraction how much of the pane's width the board actually occupies.
 *   offscreenPicks    prompt targets the player cannot see or tap (off the
 *                     pane, or under the landscape rail).
 *   hiddenFighters    fighters the player cannot see, by the same rule — the
 *                     focus zoom must never push a piece out of view.
 *   baseConcentricity how far a fighter's base disc sits from its space centre,
 *                     as a fraction of the space's own width (0 = seated dead
 *                     centre).
 *
 * Usage (a dev server on :3000 must already be running — start it with the
 * Browser pane's preview tools, never with a bare `yarn dev`):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *     node scripts/visual-probe/tableBoard.cjs [--out <dir>]
 *
 * It prints one JSON object and writes two screenshots (at rest, mid-prompt).
 * The at-rest shot is taken only AFTER "reset view" is clicked: a capture taken
 * straight after switching views lands mid-prompt, where the focus zoom is
 * active, and is not the resting board — that mistake has been made here too.
 */
const path = require("path");
const fs = require("fs");

const PW_PATH = process.env.PW_PATH;
if (!PW_PATH) {
  console.error("Set PW_PATH to a playwright install, e.g.\n  PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright node scripts/visual-probe/tableBoard.cjs");
  process.exit(2);
}
const pw = require(PW_PATH);

const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : path.join(require("os").tmpdir(), "table-probe");
fs.mkdirSync(OUT, { recursive: true });

const BASE = process.env.PROBE_URL || "http://localhost:3000";
/** The board every run measures (override with PROBE_MAP to compare maps). */
const PROBE_MAP = process.env.PROBE_MAP || "Secluded Temple";
/**
 * Optional viewport override, "WxH" in CSS px (the device profile stays
 * iPhone 14 landscape). Playwright cannot emulate env(safe-area-inset-*), so
 * a phone's notch is simulated by its USABLE area: every piece of chrome and
 * the fit are positioned from the safe edges. An iPhone 15 Pro in full-screen
 * landscape (852x393, 59px cut-out each side, 21px home bar) is 734x372.
 */
const PROBE_VIEWPORT = process.env.PROBE_VIEWPORT
  ? (([width, height]) => ({ width, height }))(process.env.PROBE_VIEWPORT.split("x").map(Number))
  : null;

/** Runs in the page: everything we want to know, read off the real DOM. */
const collect = () => {
  const plane = document.querySelector("[data-table-stage-plane]");
  if (!plane) return { error: "tabletop view not mounted (no [data-table-stage-plane])" };
  const wrap = plane.parentElement;
  const pane = document.body.getBoundingClientRect();

  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  };

  const spaces = [...plane.querySelectorAll("[data-space-id]")]
    .map((el) => ({ id: el.getAttribute("data-space-id"), ...rect(el) }))
    .filter((s) => s.w > 2)
    .sort((a, b) => a.cy - b.cy);

  // Depth: compare the THREE farthest against the three nearest, so one odd
  // space (a region inset, a clipped edge) can't decide the answer alone.
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const far = mean(spaces.slice(0, 3).map((s) => s.h));
  const near = mean(spaces.slice(-3).map((s) => s.h));

  // Four zero-size markers at the plane's corners: their on-screen positions
  // ARE the projected trapezoid, which no bounding box can give you.
  const corner = (x, y) => {
    const m = document.createElement("div");
    m.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:1px;height:1px;pointer-events:none`;
    plane.appendChild(m);
    const r = m.getBoundingClientRect();
    m.remove();
    return { x: r.left, y: r.top };
  };
  const [tl, tr, bl, br] = [corner(0, 0), corner(100, 0), corner(0, 100), corner(100, 100)];
  const edgeRatio = Math.hypot(br.x - bl.x, br.y - bl.y) / (Math.hypot(tr.x - tl.x, tr.y - tl.y) || 1);
  const meanSpaceWidth = mean(spaces.map((s) => s.w));

  const boardRect = plane.getBoundingClientRect();
  // The playable area is the pane MINUS the landscape rail: the rail is a
  // translucent fixed panel over the board, so a piece that slides under it is
  // still "on screen" by the pane's numbers while the player cannot read or
  // tap it. That exact case (the focus zoom pushing the opponent under the
  // rail) passed `offscreenPicks` for as long as it measured against the pane.
  const railEl = document.querySelector('[data-testid="pro-mobile-rail"]');
  const visibleRight = railEl ? railEl.getBoundingClientRect().left : pane.width;
  // The tabletop HUD has no rail; its chrome floats OVER the board instead —
  // plates, banner, hexagons, the fanned hand, the side buttons and, while a
  // decision needs it, the side sheet. A point under any of them is as
  // unreachable as one under the rail. Bounding boxes, so a tilted fan card
  // counts a little more than it covers: the error is on the safe side.
  const HUD_OCCLUDERS = [
    "[data-table-hud-plate]",
    "[data-table-hud-banner]",
    "[data-hud-hex]",
    "[data-hud-fan-card]",
    "[data-table-hud-side] > *",
    '[data-testid="table-hud-sheet"]',
  ].join(",");
  const occluders = [...document.querySelectorAll(HUD_OCCLUDERS)].map((el) => el.getBoundingClientRect());
  const underHud = (x, y) => occluders.some((o) => x >= o.left && x <= o.right && y >= o.top && y <= o.bottom);
  const hidden = (r) => r.cy < 0 || r.cx < 0 || r.cy > pane.height || r.cx > visibleRight || underHud(r.cx, r.cy);
  const picks = [...document.querySelectorAll("[data-pick]")].map(rect);
  const offscreen = picks.filter(hidden).length;
  const fighters = [...plane.querySelectorAll("[data-fighter-id]")].map((el) => ({
    id: el.getAttribute("data-fighter-id"),
    ...rect(el),
  }));
  // A fighter is judged by its WHOLE box, not its centre: a standee whose HP
  // badge is under the rail is a standee whose health the player cannot read.
  const clipped = (r) =>
    r.cx - r.w / 2 < 0 || r.cy - r.h / 2 < 0 || r.cx + r.w / 2 > visibleRight || r.cy + r.h / 2 > pane.height;
  // Against the HUD a fighter is judged by its whole box too: a standee whose
  // HP badge peeks out from under the banner is one whose health is hidden.
  const overlapsHud = (r) =>
    occluders.some(
      (o) => r.cx - r.w / 2 < o.right && r.cx + r.w / 2 > o.left && r.cy - r.h / 2 < o.bottom && r.cy + r.h / 2 > o.top
    );
  const hiddenFighters = fighters.filter((f) => clipped(f) || overlapsHud(f)).map((f) => f.id);
  // Spaces whose centre sits under the HUD. At rest this must be 0: the HUD
  // may cover table and frame, never the board's printed spaces.
  const hudCoveredSpaces = spaces.filter((sp) => underHud(sp.cx, sp.cy)).map((sp) => sp.id);

  // Seating: a fighter's base disc should sit concentric with the space it
  // occupies. Measured as centre-to-centre distance over the space's width, so
  // it is comparable across the board's depth gradient.
  const baseEls = [...plane.querySelectorAll("[data-fighter-base][data-space-id]")];
  const seating = baseEls.map((baseEl) => {
    const id = baseEl.getAttribute("data-space-id");
    const space = spaces.find((s) => s.id === id);
    if (!space) return { id, offset: null, note: "no space for this base" };
    const b = rect(baseEl);
    const d = Math.hypot(b.cx - space.cx, b.cy - space.cy);
    return {
      id,
      offset: +(d / (space.w || 1)).toFixed(3),
      baseOverSpaceWidth: +(b.w / (space.w || 1)).toFixed(3),
    };
  });

  // Where the drawn board (plane + its edge) actually lands, in viewport px —
  // to tell "the fit is height-bound" from "something else is in the box".
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom].map(Math.round);
  };

  return {
    viewport: [Math.round(pane.width), Math.round(pane.height)],
    boardBox: box("[data-table-stage-plane]"),
    boardEdgeBox: box("[data-table-board-edge]"),
    perspective: getComputedStyle(wrap).perspective,
    planeTransform: getComputedStyle(plane).transform,
    spaceCount: spaces.length,
    farSpaceHeight: +far.toFixed(1),
    nearSpaceHeight: +near.toFixed(1),
    edgeRatio: +edgeRatio.toFixed(2),
    meanSpaceWidth: +meanSpaceWidth.toFixed(1),
    depthRatio: +(near / (far || 1)).toFixed(2),
    boardFillFraction: +(boardRect.width / (pane.width || 1)).toFixed(2),
    pickCount: picks.length,
    offscreenPicks: offscreen,
    fighterCount: fighters.length,
    hiddenFighters,
    hudCoveredSpaces,
    // An empty list means the renderer does not expose the contract this probe
    // needs, NOT that the pieces are seated perfectly — say so out loud rather
    // than reporting a silent pass.
    seating: baseEls.length
      ? seating
      : [{ note: "no [data-fighter-base][data-space-id] elements — the standee anchor must tag its base disc with the space it stands on for seating to be measurable" }],
  };
};

(async () => {
  const b = await pw.webkit.launch();
  const ctx = await b.newContext({
    ...pw.devices["iPhone 14 landscape"],
    ...(PROBE_VIEWPORT ? { viewport: PROBE_VIEWPORT } : {}),
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));

  await p.goto(`${BASE}/pro/game`);
  await p.waitForTimeout(6000);
  await p.getByRole("button", { name: "AI·E", exact: true }).tap();
  await p.getByRole("button", { name: /^King Kong by/ }).first().tap();
  // ONE fixed board. The lobby defaults to "Random", and every metric here is
  // a property of the map as much as of the renderer — the same build measured
  // depthRatio 1.4, 1.86 and 2.16 on three random boards. A number that moves
  // when nothing changed can't tell you whether a change helped.
  const stage = p.getByRole("button", { name: PROBE_MAP, exact: true });
  if (!(await stage.count())) {
    const more = p.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await more.first().tap();
  }
  if (!(await stage.count())) {
    console.error(`could not find the "${PROBE_MAP}" stage tile — was it renamed?`);
    await b.close();
    process.exit(1);
  }
  await stage.first().tap();
  await p.getByRole("button", { name: "PLAY VS AI" }).tap();
  await p.waitForTimeout(12000);
  const keep = p.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await keep.tap();
  await p.waitForTimeout(3000);

  // Switch to the tabletop view. The landscape viewport is shorter than the
  // menu, so the item is clicked through the DOM — diagnostic only, this does
  // not stand in for a real tap-target test.
  await p.locator('[aria-label="Game menu"]').first().tap();
  await p.waitForTimeout(500);
  const item = p.getByRole("menuitem", { name: /Board — /i });
  if (!(await item.count())) {
    console.error("could not find the board-view menu item — has the chip been renamed?");
    await b.close();
    process.exit(1);
  }
  await item.evaluate((el) => el.click());
  await p.waitForTimeout(2000);

  const midPrompt = await p.evaluate(collect);
  await p.screenshot({ path: path.join(OUT, "mid-prompt.png") });

  const reset = p.getByRole("button", { name: /reset view/i });
  if (await reset.count()) {
    await reset.first().evaluate((el) => el.click());
    await p.waitForTimeout(1200);
  }
  const atRest = await p.evaluate(collect);
  await p.screenshot({ path: path.join(OUT, "at-rest.png") });

  console.log(JSON.stringify({ out: OUT, atRest, midPrompt }, null, 2));
  await b.close();
})();
