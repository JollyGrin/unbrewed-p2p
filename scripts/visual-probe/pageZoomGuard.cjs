/**
 * Page-zoom guard scope + board pinch/pan (#893), real WebKit device emulation.
 *
 * Reads, on the lobby, after a hero pick, and in a match (flat, then tabletop
 * on a landscape device): the computed `touch-action` on html/body, whether the
 * guard's <style> is in the head, and whether a cancelable `gesturestart` got
 * prevented. In-match it drives a synthetic two-finger pinch and a one-finger
 * pan (touch PointerEvents on the useZoomPan frame) and reports the frame's
 * transform before/after each. Also logs which JS chunks load and when — the
 * tabletop's chunk must arrive only on the switch.
 *
 * Usage (a dev server must already be running):
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:<port> \
 *     DEVICE="iPhone 14 landscape" OUT=<dir> node scripts/visual-probe/pageZoomGuard.cjs
 */
const path = require("path");
const pw = require(process.env.PW_PATH);
const BASE = process.env.PROBE_URL || "http://localhost:3893";
const OUT = process.env.OUT || __dirname;
const DEVICE = process.env.DEVICE || "iPhone 14 landscape";

// Runs in the page: is the guard up?
const guard = () => {
  const ev = new Event("gesturestart", { bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
  return {
    htmlTouchAction: getComputedStyle(document.documentElement).touchAction,
    bodyTouchAction: getComputedStyle(document.body).touchAction,
    guardStyle: !!document.getElementById("pro-page-zoom-guard"),
    gesturestartPrevented: ev.defaultPrevented,
  };
};

// Runs in the page: synthetic two-finger pinch then one-finger pan over the
// board centre; returns the zoom frame's transform before/after each.
const gesture = async () => {
  // The useZoomPan frame: transform-origin 0 0 with a live transform; the
  // largest such box is the board frame (flat or tabletop).
  const frame = [...document.querySelectorAll("div")]
    .filter((el) => {
      const cs = getComputedStyle(el);
      return cs.transformOrigin === "0px 0px" && cs.transform !== "none";
    })
    .sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
  if (!frame) return { error: "no zoom frame" };
  const tf = () => getComputedStyle(frame).transform;
  const r = frame.parentElement.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const target = frame;
  const pe = (type, id, x, y, el) =>
    (el || target).dispatchEvent(
      new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: "touch", isPrimary: id === 11, clientX: x, clientY: y })
    );
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  const before = tf();
  pe("pointerdown", 11, cx - 20, cy);
  pe("pointerdown", 12, cx + 20, cy);
  for (let i = 1; i <= 8; i++) {
    pe("pointermove", 11, cx - 20 - i * 10, cy, window.document);
    pe("pointermove", 12, cx + 20 + i * 10, cy, window.document);
    await wait(16);
  }
  pe("pointerup", 11, cx - 100, cy, window.document);
  pe("pointerup", 12, cx + 100, cy, window.document);
  await wait(200);
  const afterPinch = tf();
  pe("pointerdown", 13, cx, cy);
  for (let i = 1; i <= 8; i++) {
    pe("pointermove", 13, cx + i * 8, cy + i * 4, window.document);
    await wait(16);
  }
  pe("pointerup", 13, cx + 64, cy + 32, window.document);
  await wait(200);
  const afterPan = tf();
  return {
    target: target && (target.tagName + (target.getAttribute("data-space-id") ? `#${target.getAttribute("data-space-id")}` : "")),
    before,
    afterPinch,
    afterPan,
    pinchChanged: before !== afterPinch,
    panChanged: afterPinch !== afterPan,
  };
};

(async () => {
  const b = await pw.webkit.launch();
  const ctx = await b.newContext({ ...pw.devices[DEVICE] });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.error("[page error]", e.message));
  const chunks = [];
  p.on("request", (r) => {
    if (/\/_next\/static\/chunks\/.*\.js/.test(r.url()) && !/pages\//.test(r.url())) chunks.push(r.url().split("/").pop());
  });
  const out = { device: DEVICE };

  await p.goto(`${BASE}/pro/game`);
  await p.waitForTimeout(8000);
  out.lobby = await p.evaluate(guard);
  await p.screenshot({ path: path.join(OUT, `${DEVICE.replace(/ /g, "_")}-lobby.png`) });

  await p.getByRole("button", { name: "Bot·E", exact: true }).tap();
  await p.getByRole("button", { name: /^King Kong by/ }).first().tap();
  out.heroPicked = await p.evaluate(guard);
  const stage = p.getByRole("button", { name: "Secluded Temple", exact: true });
  if (!(await stage.count())) {
    const more = p.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await more.first().tap();
  }
  await stage.first().tap();
  await p.getByRole("button", { name: "PLAY VS BOT" }).tap();
  await p.waitForTimeout(12000);
  const keep = p.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await keep.tap();
  await p.waitForTimeout(3000);

  out.inMatchFlat = await p.evaluate(guard);
  out.tableChunkRequestedBeforeSwitch = chunks.slice();
  out.flatGesture = await p.evaluate(gesture);
  await p.screenshot({ path: path.join(OUT, `${DEVICE.replace(/ /g, "_")}-flat.png`) });

  if (DEVICE.includes("landscape")) {
    const n = chunks.length;
    await p.locator('[aria-label="Game menu"]').first().tap();
    await p.waitForTimeout(500);
    await p.getByRole("menuitem", { name: /Board — /i }).evaluate((el) => el.click());
    await p.waitForTimeout(3000);
    out.chunksLoadedOnSwitch = chunks.slice(n);
    out.tableMounted = await p.evaluate(() => !!document.querySelector("[data-table-stage-plane]"));
    out.inMatchTable = await p.evaluate(guard);
    const reset = p.getByRole("button", { name: /reset view/i });
    if (await reset.count()) {
      await reset.first().evaluate((el) => el.click());
      await p.waitForTimeout(1200);
    }
    out.tableGesture = await p.evaluate(gesture);
    await p.screenshot({ path: path.join(OUT, `${DEVICE.replace(/ /g, "_")}-table.png`) });
  }
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})();
