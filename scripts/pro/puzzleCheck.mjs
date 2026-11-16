#!/usr/bin/env node
/**
 * Headless check for the puzzle panel on /puzzles (issue #1679).
 *
 *   node scripts/pro/puzzleCheck.mjs
 *
 * Needs a dev server (`next dev`) pointed at a LOCAL engine that serves puzzle
 * rooms (protocol v41: NEXT_PUBLIC_PRO_WS_URL=ws://localhost:<port>) and a
 * Playwright Chromium. Playwright is NOT a dependency of this repo: pass the
 * module by path, as scripts/pro/embedCheck.mjs does.
 *
 *   BASE_URL     default http://localhost:3000
 *   PLAYWRIGHT   module specifier or path (default "playwright-core")
 *   OUT          screenshot directory (default: none written)
 *   SIZES        viewports, default "1280x800,390x844"
 *
 * What it does, logged out, at each size: load /puzzles; fail the first puzzle;
 * "Try again"; solve it; "Next puzzle"; on the second puzzle fail and watch the
 * solution. Along the way: nothing of the panel leaves its box, the host title
 * and URL path are untouched, a wheel and a touch drag over the board scroll
 * the PAGE, no toast is raised, and leaving the page closes the socket.
 *
 * How it plays: the panel's own buttons are clicked (Hint, Reset, Try again,
 * Show the solution, Next puzzle). Game actions go down the page's own puzzle
 * socket, taken from what the server offered: the hint's action to win, a
 * maneuver that goes nowhere to lose. The check knows no rules either.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ? resolve(process.env.OUT) : null;
const SIZES = (process.env.SIZES ?? "1280x800,390x844").split(",").map((s) => s.split("x").map(Number));
if (OUT) mkdirSync(OUT, { recursive: true });

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

/** Runs in the page before anything else: spy on every WebSocket it opens. */
const spy = () => {
  const Native = window.WebSocket;
  const socks = (window.__pz = []);
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      if (String(url).includes("_next")) return; // the dev server's HMR socket
      const rec = { ws: this, room: null, state: null, seq: 0, hint: null, hints: 0, result: null, solution: null, sent: [] };
      socks.push(rec);
      const send = this.send.bind(this);
      this.send = (data) => {
        try {
          rec.sent.push(JSON.parse(data).type);
        } catch {
          /* not ours */
        }
        return send(data);
      };
      this.addEventListener("message", (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === "PUZZLE_INFO") {
          rec.room = msg.roomId;
          rec.result = null;
          rec.solution = null;
        }
        if (msg.type === "STATE") {
          rec.state = msg;
          rec.seq += 1;
        }
        if (msg.type === "PUZZLE_HINT") {
          rec.hint = msg;
          rec.hints += 1;
        }
        if (msg.type === "PUZZLE_RESULT") rec.result = msg;
        if (msg.type === "PUZZLE_SOLUTION") rec.solution = msg.status;
      });
    }
  };
};

/** The live puzzle socket's record (the last one opened that is still open). */
const live = (page, pick) =>
  page.evaluate((body) => {
    const rec = [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room);
    return rec ? new Function("rec", `return (${body})(rec)`)(rec) : null;
  }, pick.toString());

const sendAction = (page, action) =>
  live(page, `(rec) => rec.ws.send(JSON.stringify({ v: rec.state.v, type: "ACTION", roomId: rec.room, action: ${JSON.stringify(action)} }))`);

const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` });
};

const panel = (page) => page.locator('[data-testid="puzzle-panel"]');

/** Every visible element of the panel sits inside the panel's box. */
const contained = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('[data-testid="puzzle-panel"]');
    const box = root.getBoundingClientRect();
    const out = [];
    for (const el of root.querySelectorAll("*")) {
      if (el.closest("[data-pro-bleed]")) continue; // the board and its flourishes are clipped by the frame, by design
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue;
      // What is actually painted: the rect clipped by every clipping ancestor up to the panel.
      let { left, top, right, bottom } = r;
      for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/(hidden|clip|auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`)) {
          const c = a.getBoundingClientRect();
          left = Math.max(left, c.left);
          top = Math.max(top, c.top);
          right = Math.min(right, c.right);
          bottom = Math.min(bottom, c.bottom);
        }
      }
      if (right <= left || bottom <= top) continue;
      if (left < box.left - 1 || top < box.top - 1 || right > box.right + 1 || bottom > box.bottom + 1)
        out.push(`${el.tagName.toLowerCase()}[${el.getAttribute("data-testid") ?? el.className.toString().slice(0, 30)}]`);
    }
    // Portals: nothing the view opened may hang off <body>. (The page's own
    // Chakra toast regions live there; they are checked to be empty below.)
    const stray = [...document.body.querySelectorAll(".chakra-portal")].filter(
      (p) => !root.contains(p) && p.childElementCount > 0 && !p.querySelector('[id^="chakra-toast-manager"]')
    ).length;
    return { out: out.slice(0, 5), stray };
  });

const waitPlaying = async (page, sinceSeq = 0) => {
  await page.waitForFunction(
    (seq) => {
      const rec = [...(window.__pz ?? [])].reverse().find((r) => r.ws.readyState === 1 && r.room);
      return !!rec && rec.seq > seq && !!document.querySelector('[data-testid="pro-game-view"]');
    },
    sinceSeq,
    { timeout: 30_000 }
  );
};

/** Spend the turn without a kill: maneuver and stand still, as often as offered. */
const loseTheTry = async (page) => {
  for (let i = 0; i < 12; i += 1) {
    const s = await live(page, `(rec) => ({ seq: rec.seq, legal: rec.state.legalActions, result: rec.result })`);
    if (!s || s.result) return;
    const pick = s.legal.find((a) => a.type === "END_MANEUVER") ?? s.legal.find((a) => a.type === "MANEUVER");
    if (!pick) {
      if (s.legal.length === 0) {
        await page.waitForTimeout(200);
        continue;
      }
      throw new Error(`no way to pass: ${s.legal.map((a) => a.type).join(",")}`);
    }
    await sendAction(page, pick);
    await page.waitForFunction((seq) => [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room)?.seq > seq, s.seq, { timeout: 10_000 });
  }
};

/** Win by asking for a hint before every action (the Hint button) and playing it. */
const winByHints = async (page, onStep) => {
  for (let i = 0; i < 12; i += 1) {
    const s = await live(page, `(rec) => ({ seq: rec.seq, legal: rec.state.legalActions.length, result: rec.result, hints: rec.hints })`);
    if (s.result) return;
    if (s.legal === 0) {
      await page.waitForTimeout(200);
      continue;
    }
    await page.locator('[data-testid="puzzle-hint"]').click();
    await page.waitForFunction((n) => [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room)?.hints > n, s.hints, { timeout: 10_000 });
    const hint = await live(page, `(rec) => rec.hint`);
    if (!hint.action) throw new Error(`hint without an action: ${hint.text}`);
    if (i === 0) {
      await page.waitForFunction((t) => document.querySelector('[data-testid="puzzle-status"]')?.textContent === t, hint.text, { timeout: 5_000 });
      ok(`hint text shown in the panel's status line ("${hint.text}")`);
    }
    await sendAction(page, hint.action);
    await page.waitForFunction((seq) => [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room)?.seq > seq, s.seq, { timeout: 10_000 });
    await page.waitForTimeout(350);
    await onStep?.(i);
  }
};

const run = async (browser, width, height) => {
  const tag = `${width}`;
  console.log(`\n== ${width}×${height} ==`);
  const phone = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1 });
  await context.addInitScript(spy);
  // Local services only: the account probe and the visit counter are the
  // requests the page makes to live services by default (static art aside).
  // Logged out is what this check is about anyway.
  await context.route(/api\.unbrewed\.xyz|counter\.dev/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/puzzles`, { waitUntil: "domcontentloaded" });
  await waitPlaying(page);
  await page.waitForTimeout(1500);
  const title = await page.title();
  const first = await panel(page).getAttribute("data-puzzle");
  const items = await page.locator('[data-testid="puzzle-strip-item"]').count();
  check(items > 0, `catalogue strip lists ${items} puzzles`);
  check(!!first, `logged out: the first puzzle is on the table (${first})`);
  check((await page.locator('[data-testid="puzzle-pip"][data-filled="true"]').count()) === (await page.locator('[data-testid="puzzle-pip"]').count()), "all action pips full at the start");
  check((await page.locator('[data-testid="revealed-hand-panel"]').innerText()).includes("Opponent's hand"), 'the face-up hand box reads "Opponent\'s hand · shown in puzzles"');
  await shot(page, `${tag}-1-playing`);
  let c = await contained(page);
  check(c.out.length === 0 && c.stray === 0, `nothing renders outside the panel box${c.out.length ? `: ${c.out.join(", ")}` : ""}${c.stray ? ` (${c.stray} stray portals)` : ""}`);

  // The page keeps its scroll over the board.
  const board = await page.locator('[data-testid="pro-game-view"]').boundingBox();
  const at = { x: board.x + Math.min(board.width * 0.35, 200), y: board.y + board.height * 0.5 };
  await page.evaluate(() => window.scrollTo(0, 0));
  // A viewport the page fits in has nothing to scroll: shorten it for this part.
  let maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const shortened = maxScroll <= 40;
  if (shortened) {
    await page.setViewportSize({ width, height: 520 });
    await page.waitForTimeout(600);
    maxScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  }
  const viewH = shortened ? 520 : height;
  if (maxScroll > 40) {
    const live = await page.locator('[data-testid="pro-game-view"]').boundingBox();
    await page.mouse.move(at.x, Math.max(live.y + 20, Math.min(live.y + live.height * 0.5, viewH - 20)));
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    const y1 = await page.evaluate(() => window.scrollY);
    check(y1 > 0, `a wheel over the board scrolls the page (scrollY ${y1})`);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (phone) {
      const cdp = await context.newCDPSession(page);
      const x = Math.round(at.x);
      const y0 = Math.round(Math.min(at.y, viewH - 60));
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= 8; i += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - i * 20 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(500);
      const y2 = await page.evaluate(() => window.scrollY);
      check(y2 > 0, `a vertical touch drag over the board scrolls the page (scrollY ${y2})`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      // …while a pinch still zooms the board (a phone auto-focuses small picks,
      // so the visitor needs a way to look around), without zooming the page.
      const frameWidth = () =>
        page.evaluate(() => document.querySelector('[data-testid="pro-game-view"] img[draggable="false"]').getBoundingClientRect().width);
      const w0 = await frameWidth();
      const b2 = await page.locator('[data-testid="pro-game-view"]').boundingBox();
      const cx = Math.round(b2.x + b2.width / 2);
      const cy = Math.round(Math.min(b2.y + b2.height * 0.45, viewH - 120));
      const two = (d) => [
        { x: cx - d, y: cy, id: 1 },
        { x: cx + d, y: cy, id: 2 },
      ];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: two(60) });
      for (const d of [55, 50, 45, 40, 35, 30]) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: two(d) });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(400);
      const w1 = await frameWidth();
      check(w1 < w0 - 2, `a pinch zooms the board, not the page (board ${Math.round(w0)}px → ${Math.round(w1)}px)`);
      check((await page.evaluate(() => window.visualViewport?.scale ?? 1)) === 1, "the page itself is not zoomed");
    }
  } else {
    fail("the page does not scroll at this size: scroll checks not run");
  }
  if (shortened) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(600);
  }

  // Fail the first try.
  await loseTheTry(page);
  await page.locator('[data-testid="puzzle-result-failed"]').waitFor({ timeout: 10_000 });
  const failedText = await page.locator('[data-testid="puzzle-result-failed"]').innerText();
  check(/survives/i.test(failedText) && /\d+ HP left/.test(failedText), `failed result: "${failedText.replace(/\s+/g, " ").slice(0, 80)}"`);
  check((await page.locator('[data-testid="puzzle-pip"][data-filled="true"]').count()) === 0, "pips empty after the turn");
  await shot(page, `${tag}-2-failed`);

  // Try again → try 2, then solve it with hints.
  const before = await live(page, `(rec) => rec.seq`);
  await page.locator('[data-testid="puzzle-try-again"]').click();
  await waitPlaying(page, before);
  check((await page.locator('[data-testid="puzzle-result-failed"]').count()) === 0, '"Try again" clears the result and resets the board');
  await winByHints(page, async (i) => {
    if (i === 0) {
      const filled = await page.locator('[data-testid="puzzle-pip"][data-filled="true"]').count();
      const all = await page.locator('[data-testid="puzzle-pip"]').count();
      check(filled === all - 1, `one pip empties after one action (${filled}/${all})`);
      await shot(page, `${tag}-3-one-action-spent`);
    }
  });
  await page.locator('[data-testid="puzzle-result-solved"]').waitFor({ timeout: 10_000 });
  const solvedText = (await page.locator('[data-testid="puzzle-result-solved"]').innerText()).replace(/\s+/g, " ");
  check(/Solved/i.test(solvedText) && /Try 2/.test(solvedText) && /seconds/.test(solvedText), `solved result: "${solvedText.slice(0, 110)}"`);
  check(!/xp/i.test(await panel(page).innerText()), "no XP anywhere in the panel");
  const href = await page.locator('[data-testid="puzzle-full-game"]').getAttribute("href");
  check(/^\/pro\/game\?vs=/.test(href ?? ""), `full-game link: ${href}`);
  await shot(page, `${tag}-4-solved`);
  c = await contained(page);
  check(c.out.length === 0 && c.stray === 0, `still nothing outside the panel box${c.out.length ? `: ${c.out.join(", ")}` : ""}`);
  check(await page.evaluate((id) => JSON.parse(localStorage.getItem("unbrewed-pro-puzzles-solved") || "[]").includes(id), first), "the solve is remembered in localStorage");
  check((await page.locator(`[data-testid="puzzle-strip-item"][data-puzzle="${first}"]`).getAttribute("data-solved")) === "true", "the strip ticks the solved puzzle");

  // Next puzzle.
  const firstSocket = await page.evaluate(() => window.__pz.filter((r) => r.room).length);
  await page.locator('[data-testid="puzzle-next"]').click();
  await page.waitForFunction((id) => document.querySelector('[data-testid="puzzle-panel"]')?.getAttribute("data-puzzle") !== id, first, { timeout: 10_000 });
  await page.waitForFunction((n) => window.__pz.filter((r) => r.room).length > n, firstSocket, { timeout: 15_000 });
  await waitPlaying(page);
  const second = await panel(page).getAttribute("data-puzzle");
  check(!!second && second !== first, `"Next puzzle" opens the next unsolved one (${second})`);
  check(new URL(page.url()).searchParams.get("p") === second, "the page mirrors it as ?p=<id>");
  check(await page.evaluate(() => window.__pz.filter((r) => r.room && r.ws.readyState === 1).length === 1), "the previous puzzle's socket is closed");
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-5-next-puzzle`);

  // Second puzzle: fail, then watch the solution.
  await loseTheTry(page);
  await page.locator('[data-testid="puzzle-show-solution"]').click({ timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="puzzle-status"]')?.textContent?.includes("Playing the solution"), null, { timeout: 10_000 });
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-6-solution-playing`);
  await page.locator('[data-testid="puzzle-solution-done"]').waitFor({ timeout: 30_000 });
  check(true, "the solution plays and ends on its own card");
  check(await page.evaluate((id) => !JSON.parse(localStorage.getItem("unbrewed-pro-puzzles-solved") || "[]").includes(id), second), "a watched solution does not mark the puzzle solved");
  await shot(page, `${tag}-7-solution-done`);
  // "Try again" after a shown solution opens a FRESH room.
  const rooms = await page.evaluate(() => window.__pz.filter((r) => r.room).length);
  await page.locator('[data-testid="puzzle-try-again"]').click();
  await page.waitForFunction((n) => window.__pz.filter((r) => r.room).length > n, rooms, { timeout: 15_000 });
  check(true, '"Try again" after the solution opens a fresh room');

  // The host page is untouched, and no toast was raised.
  check((await page.title()) === title, `page title unchanged ("${title}")`);
  check(new URL(page.url()).pathname === "/puzzles", "page path unchanged");
  check(
    (await page.evaluate(
      () => document.querySelectorAll('[role="status"]:not([data-testid="puzzle-status"]), [id^="chakra-toast-manager"] > *').length
    )) === 0,
    "no toast on the host page"
  );

  // A deep link.
  await page.goto(`${BASE}/puzzles?p=${encodeURIComponent(second)}`, { waitUntil: "domcontentloaded" });
  await waitPlaying(page);
  check((await panel(page).getAttribute("data-puzzle")) === second, `?p=${second} opens that puzzle`);

  // Leaving the page closes the socket.
  await page.locator('a[href="/privacy"], a[href="/leaderboard"]').first().evaluate((a) => a.click());
  await page.waitForFunction(() => !document.querySelector('[data-testid="puzzle-panel"]'), null, { timeout: 20_000 });
  await page.waitForTimeout(500);
  check(await page.evaluate(() => window.__pz.every((r) => r.ws.readyState >= 2)), "unmounting the panel closes its socket");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0].slice(0, 200)}` : ""}`);
  await context.close();
};

const browser = await chromium.launch();
try {
  for (const [w, h] of SIZES) await run(browser, w, h);
} catch (e) {
  fail(`aborted: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(failures.length ? `\nFAIL (${failures.length})` : "\nPASS");
process.exit(failures.length ? 1 : 0);
