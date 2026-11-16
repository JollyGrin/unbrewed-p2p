#!/usr/bin/env node
/**
 * Headless check for the landing page's puzzle block (issue #1680).
 *
 *   node scripts/pro/landingPuzzleCheck.mjs
 *
 * Needs the site (a dev server, or the built `out/` behind any static server)
 * pointed at a LOCAL engine that serves puzzle rooms
 * (NEXT_PUBLIC_PRO_WS_URL=ws://localhost:<port>) and a Playwright Chromium.
 * Playwright (1.48 or later, for routeWebSocket) is NOT a dependency of this
 * repo: pass the module by path, as scripts/pro/puzzleCheck.mjs does.
 *
 *   BASE_URL     default http://localhost:3000
 *   PLAYWRIGHT   module specifier or path (default "playwright-core")
 *   OUT          screenshot directory (default: none written)
 *   SIZES        viewports, default "1280x800,390x844"
 *
 * At each size, logged out: load `/`, scroll down to the still and past it,
 * and check that nothing of the puzzle was fetched (no WebSocket, no request
 * to the engine, the still is an <img>); click; check that the click is what
 * fetched the panel's chunks and opened the socket, and that the box did not
 * move or resize; solve the puzzle with the panel's own hints; "Next puzzle"
 * in place. Then, with the engine cut off: the still stays and links to
 * /puzzles. The network log (before / after the click) is printed.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ? resolve(process.env.OUT) : null;
const SIZES = (process.env.SIZES ?? "1280x800,390x844").split(",").map((s) => s.split("x").map(Number));
if (OUT) mkdirSync(OUT, { recursive: true });

const STILL_JSON = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../public/puzzles/landing-still.json"), "utf8"));
/** What only the puzzle panel's code contains: the message that opens a puzzle room. */
const PANEL_MARK = "CREATE_PUZZLE_ROOM";

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
      const rec = { ws: this, url: String(url), room: null, state: null, seq: 0, hint: null, hints: 0, result: null, sent: [] };
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
          rec.info = { id: msg.puzzle.id, version: msg.puzzle.version };
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
      });
    }
  };
};

const live = (page, pick) =>
  page.evaluate((body) => {
    const rec = [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room);
    return rec ? new Function("rec", `return (${body})(rec)`)(rec) : null;
  }, pick.toString());

const waitPlaying = (page) =>
  page.waitForFunction(
    () => {
      const rec = [...(window.__pz ?? [])].reverse().find((r) => r.ws.readyState === 1 && r.room);
      return !!rec && rec.seq > 0 && !!document.querySelector('[data-testid="pro-game-view"]');
    },
    null,
    { timeout: 30_000 }
  );

/** Win by asking for a hint before every action (the Hint button) and playing it. */
const winByHints = async (page) => {
  for (let i = 0; i < 12; i += 1) {
    const s = await live(page, `(rec) => ({ seq: rec.seq, v: rec.state.v, room: rec.room, legal: rec.state.legalActions.length, result: rec.result, hints: rec.hints })`);
    if (s.result) return;
    if (s.legal === 0) {
      await page.waitForTimeout(200);
      continue;
    }
    await page.locator('[data-testid="puzzle-hint"]').click();
    await page.waitForFunction((n) => [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room)?.hints > n, s.hints, { timeout: 10_000 });
    const hint = await live(page, `(rec) => rec.hint`);
    if (!hint.action) throw new Error(`hint without an action: ${hint.text}`);
    await live(page, `(rec) => rec.ws.send(JSON.stringify({ v: rec.state.v, type: "ACTION", roomId: rec.room, action: ${JSON.stringify(hint.action)} }))`);
    await page.waitForFunction((seq) => [...window.__pz].reverse().find((r) => r.ws.readyState === 1 && r.room)?.seq > seq, s.seq, { timeout: 10_000 });
    await page.waitForTimeout(350);
  }
};

const BOX = '[data-testid="landing-puzzle"]';
const STILL = '[data-testid="landing-puzzle-still"]';

/** Where the block sits in the document: its own box and the section after it. */
const geometry = (page) =>
  page.evaluate((sel) => {
    const box = document.querySelector(sel).getBoundingClientRect();
    const after = document.querySelector("#ways").getBoundingClientRect();
    const r = (n) => Math.round(n * 10) / 10;
    return { x: r(box.x), y: r(box.y + window.scrollY), w: r(box.width), h: r(box.height), next: r(after.y + window.scrollY), page: document.documentElement.scrollHeight };
  }, BOX);

const short = (url) => {
  const u = new URL(url);
  return u.origin === new URL(BASE).origin ? u.pathname : `${u.origin}${u.pathname}`;
};

const newContext = async (browser, width, height) => {
  const phone = width < 600;
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2 });
  await context.addInitScript(spy);
  // Local services only (the account probe and the visit counter).
  await context.route(/api\.unbrewed\.xyz|counter\.dev/, (route) => route.abort());
  return context;
};

const run = async (browser, width, height) => {
  const tag = `${width}`;
  console.log(`\n== ${width}×${height} ==`);
  const context = await newContext(browser, width, height);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // The network log: every request, in order, with what asked for it.
  const requests = [];
  page.on("request", (req) => requests.push({ url: req.url(), type: req.resourceType() }));
  /** Every WebSocket the page has opened so far, with what it sent. */
  const socketLog = () => page.evaluate(() => window.__pz.map((r) => ({ url: r.url, sent: [...new Set(r.sent)], puzzle: r.sent.includes("CREATE_PUZZLE_ROOM"), open: r.ws.readyState === 1 })));

  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.locator(BOX).scrollIntoViewIfNeeded();
  await page.waitForFunction((sel) => {
    const img = document.querySelector(`${sel} img`);
    return !!img && img.complete && img.naturalWidth > 0;
  }, STILL);
  await page.waitForTimeout(800);
  if (OUT) await page.screenshot({ path: `${OUT}/${tag}-1-still.png` });

  const goal = await page.locator('[data-testid="landing-puzzle-goal"]').textContent();
  const source = await page.locator('[data-testid="landing-puzzle-source"]').textContent();
  check(!!goal && !!source, `the still shows the goal and source lines as text ("${goal}" / "${source}")`);
  const img = await page.locator(`${STILL} img`).evaluate((el) => ({ src: el.getAttribute("src"), lazy: el.loading, w: el.getAttribute("width"), h: el.getAttribute("height"), bytes: performance.getEntriesByName(el.currentSrc)[0]?.encodedBodySize ?? null }));
  check(img.lazy === "lazy" && !!img.w && !!img.h, `the still is a lazy <img> with its size set (${img.src}, ${img.w}×${img.h}${img.bytes ? `, ${(img.bytes / 1024).toFixed(1)} KB` : ""})`);
  check(await page.locator('[data-testid="landing-puzzle-play"]').isVisible(), '"Play this puzzle" is visible');

  // A visitor who scrolls past: to the end of the page and back.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(1500);
  await page.locator(BOX).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  const before = requests.splice(0);
  const scriptsBefore = before.filter((r) => r.type === "script").map((r) => short(r.url));
  const engineBefore = before.filter((r) => /puzzles\.json|\/healthz/.test(r.url));
  const socketsBefore = await socketLog();
  console.log(`  -- network before the click: ${before.length} requests, ${scriptsBefore.length} scripts, ${socketsBefore.length} WebSockets`);
  for (const s of scriptsBefore) console.log(`     script ${s}`);
  for (const s of socketsBefore) console.log(`     websocket ${s.url} sent ${s.sent.join(",") || "nothing"}`);
  // The landing page has a socket of its own (the roster: LIST_HEROES), with or without this block.
  check(socketsBefore.every((s) => !s.puzzle && s.sent.every((t) => t === "LIST_HEROES")), `no puzzle WebSocket before the click (${socketsBefore.length} socket: the landing roster's LIST_HEROES)`);
  check(engineBefore.length === 0, "no puzzle catalogue request before the click");
  // Not by name: read every script the page had asked for and look for the panel's code in it.
  const sameOrigin = (r) => r.type === "script" && new URL(r.url).origin === new URL(BASE).origin;
  const holdsPanel = async (reqs) => {
    const hits = [];
    for (const r of reqs.filter(sameOrigin)) if ((await (await context.request.get(r.url)).text()).includes(PANEL_MARK)) hits.push(short(r.url));
    return hits;
  };
  const panelBefore = await holdsPanel(before);
  check(panelBefore.length === 0, `none of the ${before.filter(sameOrigin).length} scripts loaded or prefetched before the click holds the panel's code${panelBefore.length ? `: ${panelBefore.join(", ")}` : ""}`);
  check((await page.locator('[data-testid="puzzle-panel"], [data-testid="pro-game-view"]').count()) === 0, "no panel and no board in the page before the click");

  const g0 = await geometry(page);
  // Layout shifts from here on, whoever caused them.
  await page.evaluate(() => {
    window.__shifts = [];
    const box = document.querySelector('[data-testid="landing-puzzle"]');
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        window.__shifts.push({ value: Math.round(e.value * 1e4) / 1e4, inside: e.sources.length > 0 && e.sources.every((s) => !!s.node && box.contains(s.node)), nodes: e.sources.map((s) => s.node?.nodeName ?? "?") });
    }).observe({ type: "layout-shift", buffered: false });
  });

  // Not on the button: anywhere on the still plays (here, the board's picture).
  const picture = await page.locator(`${STILL} img`).boundingBox();
  await page.mouse.click(picture.x + picture.width / 2, picture.y + picture.height / 3);
  // The loading state is drawn over the still.
  const sawLoading = await page
    .locator('[data-testid="landing-puzzle-loading"]')
    .waitFor({ timeout: 5_000 })
    .then(() => true, () => false);
  if (sawLoading && OUT) await page.screenshot({ path: `${OUT}/${tag}-2-loading.png` });
  const g1 = sawLoading ? await geometry(page) : null;
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-stage") === "live", BOX, { timeout: 60_000 });
  check(sawLoading, "a loading state is drawn over the still while the panel loads");
  await waitPlaying(page);
  check((await page.locator(STILL).count()) === 0, "the still is replaced by the live panel");
  check(await page.evaluate(() => !!document.activeElement?.querySelector('[data-testid="puzzle-panel"]')), "focus is handed to the live panel");
  check(await page.evaluate(() => document.querySelector('[data-testid="pro-game-view"] img')?.complete === true), "the board's picture was in when the still gave way");
  check((await page.locator('[data-testid="puzzle-panel"]').getAttribute("data-context")) === "landing", 'the panel runs with context="landing"');
  await page.waitForTimeout(1500);
  if (OUT) await page.screenshot({ path: `${OUT}/${tag}-3-live.png` });

  const after = requests.splice(0);
  const scriptsAfter = after.filter((r) => r.type === "script").map((r) => short(r.url));
  const socketsAfter = (await socketLog()).slice(socketsBefore.length);
  console.log(`  -- network after the click: ${after.length} requests, ${scriptsAfter.length} scripts, ${socketsAfter.length} new WebSockets`);
  for (const s of scriptsAfter) console.log(`     script ${s}`);
  for (const s of socketsAfter) console.log(`     websocket ${s.url} sent ${s.sent.join(",") || "nothing"}${s.open ? "" : " (closed)"}`);
  for (const r of after.filter((r) => /puzzles\.json/.test(r.url))) console.log(`     fetch ${r.url}`);
  const panelAfter = await holdsPanel(after);
  check(panelAfter.length > 0 && scriptsAfter.every((s) => !scriptsBefore.includes(s)), `the click fetched the panel's code (${scriptsAfter.length} scripts, none of them requested before; the panel is in ${panelAfter.join(", ") || "none of them"})`);
  const onTable = await live(page, `(rec) => rec.info`);
  check(onTable?.id === STILL_JSON.puzzleId && onTable?.version === STILL_JSON.version, `the engine's puzzle is the one the still was taken from (${onTable?.id} v${onTable?.version}; still ${STILL_JSON.puzzleId} v${STILL_JSON.version})`);
  // (A dev server mounts twice under React strict mode: one more socket, opened and closed at once.)
  check(socketsAfter.filter((s) => s.open).length === 1 && socketsAfter.every((s) => s.puzzle || !s.open), "the click opened the puzzle's WebSocket: one open, with a puzzle room");

  const g2 = await geometry(page);
  const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.next === b.next && a.page === b.page;
  check((!g1 || same(g0, g1)) && same(g0, g2), `the box did not move or resize: still ${JSON.stringify(g0)}, live ${JSON.stringify(g2)}`);
  const panelBox = await page.locator('[data-testid="puzzle-panel"]').boundingBox();
  check(Math.abs(panelBox.width - g0.w) < 1 && Math.abs(panelBox.height - g0.h) < 1, `the panel fills the still's box (${Math.round(panelBox.width)}×${Math.round(panelBox.height)})`);
  // Shifts of anything OUTSIDE the block. (The view arranging its own parts inside the panel's box is not the page moving.)
  const shifts = await page.evaluate(() => window.__shifts);
  const outside = shifts.filter((s) => !s.inside);
  check(outside.length === 0, `no layout shift outside the block since the click (${shifts.length} entries inside it${shifts.length ? `, ${JSON.stringify(shifts)}` : ""})`);

  // Solve it.
  await winByHints(page);
  await page.locator('[data-testid="puzzle-result-solved"]').waitFor({ timeout: 10_000 });
  const solvedText = (await page.locator('[data-testid="puzzle-result-solved"]').innerText()).replace(/\s+/g, " ");
  check(/Solved/i.test(solvedText), `solved: "${solvedText.slice(0, 90)}"`);
  if (OUT) await page.screenshot({ path: `${OUT}/${tag}-4-solved.png` });

  // Next puzzle, in place.
  const first = await page.locator('[data-testid="puzzle-panel"]').getAttribute("data-puzzle");
  await page.locator('[data-testid="puzzle-next"]').click();
  await page.waitForFunction((id) => document.querySelector('[data-testid="puzzle-panel"]')?.getAttribute("data-puzzle") !== id, first, { timeout: 10_000 });
  await page.waitForFunction(() => window.__pz.filter((r) => r.room && r.ws.readyState === 1 && r.seq > 0).length === 1 && !!document.querySelector('[data-testid="pro-game-view"]'), null, { timeout: 20_000 });
  const second = await page.locator('[data-testid="puzzle-panel"]').getAttribute("data-puzzle");
  check(!!second && second !== first, `"Next puzzle" opens the next one in place (${first} → ${second})`);
  check(new URL(page.url()).pathname === "/" && !new URL(page.url()).search, "the landing URL is untouched");
  const g3 = await geometry(page);
  check(same(g0, g3), "the box is still where the still was");
  await page.waitForTimeout(1500);
  if (OUT) await page.screenshot({ path: `${OUT}/${tag}-5-next-puzzle.png` });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors[0].slice(0, 200)}` : ""}`);
  await context.close();
};

/** The engine cut off: the still stays, with a link to /puzzles. */
const runUnreachable = async (browser, width, height) => {
  console.log(`\n== ${width}×${height}, engine unreachable ==`);
  const context = await newContext(browser, width, height);
  await context.routeWebSocket(/^(?!.*_next)/, (ws) => ws.close());
  await context.route(/puzzles\.json/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.locator(BOX).scrollIntoViewIfNeeded();
  const g0 = await geometry(page);
  await page.locator('[data-testid="landing-puzzle-play"]').click();
  await page.locator('[data-testid="landing-puzzle-failed"]').waitFor({ timeout: 40_000 });
  check(await page.locator(`${STILL} img`).isVisible(), "the still is kept");
  check((await page.locator('[data-testid="landing-puzzle-failed"] a').getAttribute("href")) === "/puzzles", "it links to /puzzles");
  check((await page.locator('[data-testid="puzzle-panel"]').count()) === 0, "the dead panel is gone");
  const g1 = await geometry(page);
  check(g0.w === g1.w && g0.h === g1.h && g0.next === g1.next, "the box did not move or resize");
  await page.waitForTimeout(400);
  if (OUT) await page.screenshot({ path: `${OUT}/${width}-6-unreachable.png` });
  await context.close();
};

const browser = await chromium.launch();
try {
  for (const [w, h] of SIZES) await run(browser, w, h);
  await runUnreachable(browser, ...SIZES[0]);
} catch (e) {
  fail(`aborted: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(failures.length ? `\nFAIL (${failures.length})` : "\nPASS");
process.exit(failures.length ? 1 : 0);
