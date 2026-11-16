#!/usr/bin/env node
/**
 * Headless check for the puzzle shown while you wait on /pro/game (issue #1681).
 *
 *   node scripts/pro/waitPuzzleCheck.mjs
 *
 * Needs a dev server (`next dev`) pointed at a LOCAL engine that serves puzzle
 * rooms (protocol v41: NEXT_PUBLIC_PRO_WS_URL=ws://localhost:<port>) and a
 * Playwright Chromium, passed by path like scripts/pro/puzzleCheck.mjs.
 *
 *   BASE_URL     default http://localhost:3000
 *   PLAYWRIGHT   module specifier or path (default "playwright-core")
 *   OUT          screenshot directory (default: none written)
 *   SIZE         desktop viewport, default "1440x900"
 *
 * Every seat is its own browser context (its own storage), logged out.
 *
 *  (a) Quick Play: A presses Quick Match and sits alone: the puzzle is playable
 *      over the roster, under the search bar. B presses Quick Match: A's bar
 *      turns gold, the puzzle pauses (cover up, inputs dead, progress kept),
 *      and after the countdown both are at the table. A second pair: "Go"
 *      enters at once.
 *  (b) Lobby: A creates a room, plays a puzzle action, B joins by the link:
 *      A sees the gold bar, then the table.
 *  (c) Cancel leaves a usable picker; the off switch is remembered; with every
 *      puzzle solved "Play them again" starts over; a small viewport keeps
 *      today's screens.
 *
 * Throughout: the game socket is the one the page opened first and stays open;
 * the puzzle has its own socket, closed when the table opens; the room's token,
 * the recent-rooms list and `?room=` are as on a page with no puzzle.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright-core");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ? resolve(process.env.OUT) : null;
const [W, H] = (process.env.SIZE ?? "1440x900").split("x").map(Number);
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
  const socks = (window.__ws = []);
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      if (String(url).includes("_next")) return; // the dev server's HMR socket
      const rec = { ws: this, room: null, state: null, seq: 0, hint: null, hints: 0, result: null, sent: [], got: [] };
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
        rec.got.push(msg.type);
        if (msg.type === "HEROES") window.__heroes = msg.heroes;
        if (msg.type === "PUZZLE_INFO") rec.room = msg.roomId;
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

/** Counts by kind. A puzzle socket is one that asked for a puzzle room; a game socket one that listed lobbies. */
const sockets = (page) =>
  page.evaluate(() => {
    const all = window.__ws ?? [];
    const puzzle = all.filter((r) => r.sent.includes("CREATE_PUZZLE_ROOM"));
    const game = all.filter((r) => r.sent.includes("LIST_LOBBIES") || r.sent.includes("CREATE_ROOM") || r.sent.includes("JOIN_ROOM"));
    return {
      puzzle: puzzle.length,
      puzzleOpen: puzzle.filter((r) => r.ws.readyState === 1).length,
      puzzleActions: puzzle.reduce((n, r) => n + r.sent.filter((t) => t === "ACTION" || t === "PROMPT_RESPONSE").length, 0),
      puzzleGotGameFrames: puzzle.some((r) => r.got.some((t) => t === "ROOM_CREATED" || t === "ROOM_JOINED" || t === "ROOM_STATUS")),
      game: game.length,
      gameOpen: game.filter((r) => r.ws.readyState === 1).length,
      gameActions: game.reduce((n, r) => n + r.sent.filter((t) => t === "ACTION" || t === "PROMPT_RESPONSE").length, 0),
      gameGotPuzzleFrames: game.some((r) => r.got.some((t) => t.startsWith("PUZZLE_"))),
    };
  });

/** The live puzzle socket's record. */
const puzzle = (page, pick) =>
  page.evaluate((body) => {
    const rec = [...window.__ws].reverse().find((r) => r.ws.readyState === 1 && r.room && r.sent.includes("CREATE_PUZZLE_ROOM"));
    return rec ? new Function("rec", `return (${body})(rec)`)(rec) : null;
  }, pick.toString());

const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: `${OUT}/${name}.png` });
};

const seat = async (browser, { width = W, height = H } = {}) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.addInitScript(spy);
  // Local services only: the account probe and the visit counter are the two
  // live services the page calls by default.
  await context.route(/api\.unbrewed\.xyz|counter\.dev/, (route) => route.abort());
  const page = await context.newPage();
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(String(e)));
  return page;
};

let HERO = null;
/** Open the picker with a fighter already locked. */
const openPicker = async (page, extra = "") => {
  if (!HERO) {
    await page.goto(`${BASE}/pro/game`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (window.__heroes ?? []).length > 0, null, { timeout: 60_000 });
    HERO = await page.evaluate(() => (window.__heroes.find((h) => !h.debugOnly) ?? window.__heroes[0]).heroId);
  }
  await page.goto(`${BASE}/pro/game?hero=${encodeURIComponent(HERO)}${extra}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window.__heroes ?? []).length > 0, null, { timeout: 60_000 });
};

const visible = (page, testId) => page.locator(`[data-testid="${testId}"]:visible`).first();
const count = (page, testId) => page.locator(`[data-testid="${testId}"]`).count();
const barGold = (page) => page.locator('[data-testid="wait-bar"]').getAttribute("data-gold");

/** The puzzle is on the table inside the panel. */
const waitPuzzlePlaying = (page) =>
  page.waitForFunction(
    () => !!document.querySelector('[data-testid="puzzle-panel"] [data-testid="pro-game-view"]') && !document.querySelector('[data-testid="puzzle-loading"]'),
    null,
    { timeout: 45_000 }
  );

/** Ask for a hint with the panel's own button, then play the hinted action down the puzzle socket. */
const playOnePuzzleAction = async (page) => {
  const before = await puzzle(page, `(rec) => ({ seq: rec.seq, hints: rec.hints })`);
  await page.locator('[data-testid="puzzle-hint"]').click();
  await page.waitForFunction(
    (n) => [...window.__ws].reverse().find((r) => r.ws.readyState === 1 && r.room && r.sent.includes("CREATE_PUZZLE_ROOM"))?.hints > n,
    before.hints,
    { timeout: 10_000 }
  );
  await puzzle(page, `(rec) => rec.ws.send(JSON.stringify({ v: rec.state.v, type: "ACTION", roomId: rec.room, action: rec.hint.action }))`);
  await page.waitForFunction(
    (seq) => [...window.__ws].reverse().find((r) => r.ws.readyState === 1 && r.room && r.sent.includes("CREATE_PUZZLE_ROOM"))?.seq > seq,
    before.seq,
    { timeout: 10_000 }
  );
  await page.waitForTimeout(400);
};
/** Solve the puzzle on the table: a hint before every action, then the hinted action. */
const solveByHints = async (page) => {
  for (let i = 0; i < 12; i += 1) {
    const s = await puzzle(page, `(rec) => ({ legal: rec.state.legalActions.length, result: rec.result })`);
    if (!s || s.result) return;
    if (s.legal === 0) {
      await page.waitForTimeout(200);
      continue;
    }
    await playOnePuzzleAction(page);
  }
};
const filledPips = (page) => page.locator('[data-testid="puzzle-pip"][data-filled="true"]').count();

/** The paused panel: cover up, the view inert, the footer off, and a click that reaches nothing. */
const assertPaused = async (page, label, pipsBefore) => {
  check((await count(page, "puzzle-paused")) === 1, `${label}: the paused cover is up`);
  check(
    ((await page.locator('[data-testid="puzzle-paused"]').innerText()) ?? "").includes("Puzzle paused. Your progress is kept."),
    `${label}: it reads "Puzzle paused. Your progress is kept."`
  );
  check(await page.evaluate(() => document.querySelector('[data-testid="puzzle-stage"]')?.hasAttribute("inert")), `${label}: the game view is inert`);
  check(
    await page.evaluate(() => ["puzzle-hint", "puzzle-reset", "puzzle-sound"].every((id) => document.querySelector(`[data-testid="${id}"]`)?.disabled)),
    `${label}: Hint, Reset and the mute control are disabled`
  );
  const before = await sockets(page);
  const box = await page.locator('[data-testid="puzzle-stage"]').boundingBox();
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid]")?.getAttribute("data-testid"),
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  const after = await sockets(page);
  check(hit === "puzzle-paused", `${label}: a point over the board hits the cover (${hit})`);
  check(
    after.puzzleActions === before.puzzleActions && after.gameActions === before.gameActions,
    `${label}: clicks and keys on the paused panel send nothing on either socket`
  );
  if (pipsBefore !== undefined) check((await filledPips(page)) === pipsBefore, `${label}: the try is kept (${pipsBefore} action pips still full)`);
};

/** At the table: the panel and its socket are gone, the game socket is the one that was always there. */
const assertAtTable = async (page, label) => {
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="puzzle-panel"]') && !document.querySelector('[data-testid="wait-bar"]') && !!document.querySelector('[data-testid="pro-game-view"]'),
    null,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(400);
  const s = await sockets(page);
  check(s.puzzleOpen === 0, `${label}: entering the table closed the puzzle socket (${s.puzzle} opened, ${s.puzzleOpen} open)`);
  check(s.game === 1 && s.gameOpen === 1, `${label}: one game socket, still open (${s.game} opened)`);
  check(!s.gameGotPuzzleFrames && !s.puzzleGotGameFrames, `${label}: no puzzle frame on the game socket, no room frame on the puzzle socket`);
  const room = new URL(page.url()).searchParams.get("room");
  check(!!room, `${label}: the URL carries ?room=${room}`);
  const stored = await page.evaluate((id) => {
    const keys = [...Object.keys(sessionStorage), ...Object.keys(localStorage)];
    return {
      token: keys.some((k) => k.includes("token") && k.endsWith(id)),
      recent: (localStorage.getItem("unbrewed-pro-recent-rooms") ?? "").includes(id),
      puzzleRoomKeys: keys.filter((k) => /PZ-|puzzle-room/i.test(k)).length,
    };
  }, room);
  check(stored.token, `${label}: the room's reconnect token is stored`);
  check(stored.recent, `${label}: the room is in the recent-rooms list`);
  check(stored.puzzleRoomKeys === 0, `${label}: the puzzle room left no token or room entry in storage`);
  return room;
};

const quickPlay = async (browser) => {
  console.log(`\n== (a) Quick Play, two seats, ${W}×${H} ==`);
  const a = await seat(browser);
  const b = await seat(browser);
  await openPicker(a);
  await openPicker(b);
  const title = await a.title();

  await visible(a, "quick-match").click();
  await a.locator('[data-testid="wait-bar"]').waitFor({ timeout: 20_000 });
  await waitPuzzlePlaying(a);
  await a.waitForTimeout(1200);
  check((await barGold(a)) === "false", "A alone: the search bar is up, not gold");
  check(/Finding a match/.test(await a.locator('[data-testid="wait-bar"]').innerText()), 'A alone: the bar reads "Finding a match" with the elapsed time');
  check((await a.locator('[data-testid="puzzle-panel"]').getAttribute("data-context")) === "quick_search", 'A alone: the panel is mounted with context "quick_search"');
  check((await count(a, "puzzle-full-game")) === 0, 'A alone: no "Play a full game vs a bot" button');
  check(await visible(a, "quick-match-searching").isVisible(), "A alone: the dock's searching panel (invite, chime, bot, cancel) is still there");
  check(!(await a.locator('[data-testid="pro-roster-scroll"]').isVisible()), "A alone: the roster gave its place to the puzzle");
  const pipsAll = await filledPips(a);
  await shot(a, "a1-quick-searching");

  await playOnePuzzleAction(a);
  const pips = await filledPips(a);
  check(pips === pipsAll - 1, `A alone: the puzzle is playable (a hint, then one action: ${pips}/${pipsAll} pips left)`);
  check(new URL(a.url()).pathname === "/pro/game" && (await a.title()) === title, "A alone: page path and title untouched by the puzzle");
  const elapsed1 = await a.locator('[data-testid="wait-bar-elapsed"]').innerText();
  await a.waitForTimeout(1300);
  check((await a.locator('[data-testid="wait-bar-elapsed"]').innerText()) !== elapsed1, "A alone: the elapsed time ticks");
  await shot(a, "a2-quick-one-action");

  // B presses Quick Match: it joins A's room at once.
  await visible(b, "quick-match").click();
  await a.waitForFunction(() => document.querySelector('[data-testid="wait-bar"]')?.getAttribute("data-gold") === "true", null, { timeout: 20_000 });
  const goldAt = Date.now();
  check(/Match found/.test(await a.locator('[data-testid="wait-bar"]').innerText()), 'match found: A\'s bar is gold and reads "Match found"');
  check((await count(a, "wait-go")) === 1 && /Entering table in/.test(await a.locator('[data-testid="wait-bar"]').innerText()), 'match found: countdown and "Go" in the gold bar');
  await shot(a, "a3-quick-match-found-paused");
  await assertPaused(a, "match found", pips);
  await assertAtTable(a, "A");
  const held = Date.now() - goldAt;
  check(held >= 2000 && held <= 6000, `the table opened ${held} ms after the match landed (3 s countdown)`);
  const sb = await sockets(b);
  check(sb.puzzle === 0, "B joined at once: it never opened a puzzle socket");
  await assertAtTable(b, "B");
  await a.waitForTimeout(800);
  await shot(a, "a4-quick-table");
  check(a.__errors.length === 0 && b.__errors.length === 0, `no page errors${a.__errors[0] ? `: ${a.__errors[0].slice(0, 200)}` : ""}${b.__errors[0] ? `: ${b.__errors[0].slice(0, 200)}` : ""}`);
  await a.context().close();
  await b.context().close();

  console.log("\n== (a2) Quick Play: Go ==");
  const c = await seat(browser);
  const d = await seat(browser);
  await openPicker(c);
  await openPicker(d);
  await visible(c, "quick-match").click();
  await waitPuzzlePlaying(c);
  await visible(d, "quick-match").click();
  await c.waitForFunction(() => document.querySelector('[data-testid="wait-bar"]')?.getAttribute("data-gold") === "true", null, { timeout: 20_000 });
  const t0 = Date.now();
  await c.locator('[data-testid="wait-go"]').click();
  await c.waitForFunction(() => !document.querySelector('[data-testid="puzzle-panel"]') && !!document.querySelector('[data-testid="pro-game-view"]'), null, { timeout: 20_000 });
  const went = Date.now() - t0;
  check(went < 2000, `"Go" enters the table at once (${went} ms, not the 3 s countdown)`);
  await assertAtTable(c, "C");
  await c.context().close();
  await d.context().close();
};

const lobby = async (browser) => {
  console.log(`\n== (b) Lobby, two seats, ${W}×${H} ==`);
  const a = await seat(browser);
  const b = await seat(browser);
  await openPicker(a);
  // #1687: from the click on, look at every frame: the classic waiting screen
  // until the puzzle is up, and never the one-bar layout over an empty box.
  await a.evaluate(() => {
    const seen = (window.__lobby = { classic: 0, emptyBar: 0, bar: 0 });
    const look = () => {
      const wrap = document.querySelector('[data-testid="lobby-wait-puzzle"]');
      const bar = document.querySelector('[data-testid="wait-bar"]');
      const title = document.querySelector('[data-testid="waiting-title"]');
      if (title && !bar) seen.classic += 1;
      if (bar) {
        seen.bar += 1;
        const filled = wrap?.querySelector('[data-testid="puzzle-panel"]')?.querySelector('[data-testid="pro-game-view"], [role="status"], [role="region"]');
        if (!filled) seen.emptyBar += 1;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await visible(a, "pro-create-button").click();
  await a.locator('[data-testid="lobby-wait-puzzle"][data-ready="true"]').waitFor({ timeout: 20_000 });
  await waitPuzzlePlaying(a);
  await a.waitForTimeout(1200);
  const frames = await a.evaluate(() => window.__lobby);
  check(frames.classic > 0 && frames.bar > 0, `A waits: the classic waiting screen stood until the puzzle was up (${frames.classic} frames), then the bar (${frames.bar})`);
  check(frames.emptyBar === 0, `A waits: the one-bar layout never stood over an empty box (${frames.emptyBar} such frames)`);
  const barText = (await a.locator('[data-testid="wait-bar"]').innerText()).replace(/\s+/g, " ");
  check(/playing on \S/.test(barText), "A waits: the bar still says which board the room plays on");
  const room = new URL(a.url()).searchParams.get("room");
  check((await barGold(a)) === "false" && barText.includes(`ROOM ${room}`), `A waits: the bar names the room (${barText.slice(0, 60)}…)`);
  check(
    (await count(a, "wait-copy")) === 1 && (await count(a, "wait-public")) === 1 && (await count(a, "lobby-sound-toggle")) === 1,
    "A waits: copy link, make public and the chime toggle are in the bar"
  );
  check((await a.locator('[data-testid="puzzle-panel"]').getAttribute("data-context")) === "lobby_wait", 'A waits: the panel is mounted with context "lobby_wait"');
  check((await count(a, "puzzle-full-game")) === 0, 'A waits: no "Play a full game vs a bot" button');
  const link = await a.locator('[data-testid="wait-bar-link"]').getAttribute("title");
  check(link === `${BASE}/pro/game?room=${room}`, `A waits: the bar's link is the room link (${link})`);
  await a.locator('[data-testid="wait-public"]').click();
  await a.waitForFunction(() => /Public/.test(document.querySelector('[data-testid="wait-public"]')?.textContent ?? "") && document.querySelector('[data-testid="wait-public"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 10_000 });
  check(true, "A waits: make public is acked by the server through the game socket");
  await a.locator('[data-testid="wait-public"]').click();
  const pipsAll = await filledPips(a);
  await shot(a, "b1-lobby-waiting");
  await playOnePuzzleAction(a);
  const pips = await filledPips(a);
  check(pips === pipsAll - 1, `A waits: plays a puzzle action (${pips}/${pipsAll} pips left)`);
  await shot(a, "b2-lobby-one-action");

  // B joins by the link.
  await b.goto(`${link}&hero=${encodeURIComponent(HERO)}`, { waitUntil: "domcontentloaded" });
  await b.waitForFunction(() => (window.__heroes ?? []).length > 0, null, { timeout: 60_000 });
  await visible(b, "pro-create-button").click();
  await a.waitForFunction(() => document.querySelector('[data-testid="wait-bar"]')?.getAttribute("data-gold") === "true", null, { timeout: 20_000 });
  const goldAt = Date.now();
  check(/Opponent joined/.test(await a.locator('[data-testid="wait-bar"]').innerText()), 'B joined: A\'s bar is gold and reads "Opponent joined"');
  check((await count(a, "wait-go")) === 1, 'B joined: "Go" and the countdown are in the gold bar');
  check(await a.evaluate(() => document.activeElement?.getAttribute("data-testid") === "wait-go"), 'B joined: keyboard focus is on "Go"');
  await shot(a, "b3-lobby-opponent-joined-paused");
  await assertPaused(a, "B joined", pips);
  const entered = await assertAtTable(a, "A");
  const held = Date.now() - goldAt;
  check(entered === room, "A: still the same room");
  check(held >= 2000 && held <= 6000, `the table opened ${held} ms after the game started (3 s hold)`);
  check((await sockets(b)).puzzle === 0, "B (the joiner) never opened a puzzle socket");
  await assertAtTable(b, "B");
  await a.waitForTimeout(800);
  await shot(a, "b4-lobby-table");
  check(a.__errors.length === 0 && b.__errors.length === 0, `no page errors${a.__errors[0] ? `: ${a.__errors[0].slice(0, 200)}` : ""}${b.__errors[0] ? `: ${b.__errors[0].slice(0, 200)}` : ""}`);
  await a.context().close();
  await b.context().close();
};

const switches = async (browser) => {
  console.log("\n== (c) cancel, the off switch, small viewports ==");
  const a = await seat(browser);
  await openPicker(a);
  await visible(a, "quick-match").click();
  await waitPuzzlePlaying(a);
  await Promise.all([a.waitForNavigation({ timeout: 20_000 }), a.locator('[data-testid="wait-cancel"]').click()]);
  await a.waitForFunction(() => (window.__heroes ?? []).length > 0, null, { timeout: 60_000 });
  await visible(a, "quick-match").waitFor({ timeout: 20_000 });
  check((await count(a, "wait-bar")) === 0 && (await count(a, "puzzle-panel")) === 0, "Cancel: the bar and the panel are gone");
  check(await a.locator('[data-testid="pro-roster-scroll"]').isVisible(), "Cancel: the picker is back, roster and all");
  check((await sockets(a)).puzzle === 0, "Cancel: the fresh picker holds no puzzle socket");
  await visible(a, "quick-match").click();
  await waitPuzzlePlaying(a);
  check(true, "Cancel: the lobby is usable (a second search starts, puzzle and all)");

  // The off switch.
  await a.locator('[data-testid="wait-hide"]').click();
  await a.waitForFunction(() => !document.querySelector('[data-testid="puzzle-panel"]'), null, { timeout: 10_000 });
  await a.waitForTimeout(400);
  check(await a.locator('[data-testid="pro-roster-scroll"]').isVisible(), '"Hide puzzles while waiting": the roster is back, the search goes on');
  check(await visible(a, "quick-match-searching").isVisible(), "…the dock still says it is searching");
  check((await sockets(a)).puzzleOpen === 0, "…and the puzzle socket is closed");
  await shot(a, "c1-quick-hidden");
  await a.context().storageState(); // (storage is per context: the next load reads the same localStorage)
  await openPicker(a);
  await visible(a, "quick-match").click();
  await visible(a, "quick-match-searching").waitFor({ timeout: 20_000 });
  await a.waitForTimeout(2500);
  check((await count(a, "puzzle-panel")) === 0 && (await count(a, "wait-bar")) === 0, "the off switch is remembered across a reload");
  await visible(a, "wait-show").click();
  await waitPuzzlePlaying(a);
  check(true, "the dock's Puzzle button brings it back");
  await a.context().close();

  // Every puzzle solved: a wait still has something to offer, and the record is kept.
  const l = await seat(browser);
  await openPicker(l);
  const engine = (await l.evaluate(() => window.__ws[0].ws.url)).replace(/^ws/, "http").replace(/\/+$/, "");
  const ids = (await (await fetch(`${engine}/puzzles.json`)).json()).puzzles.map((p) => p.id);
  await l.evaluate((rest) => localStorage.setItem("unbrewed-pro-puzzles-solved", JSON.stringify(rest)), ids.slice(1));
  await visible(l, "pro-create-button").click();
  await l.locator('[data-testid="lobby-wait-puzzle"]').waitFor({ timeout: 20_000 });
  await waitPuzzlePlaying(l);
  check((await l.locator('[data-testid="puzzle-panel"]').getAttribute("data-puzzle")) === ids[0], `one puzzle left unsolved: the wait opens it (${ids[0]})`);
  await solveByHints(l);
  await l.locator('[data-testid="puzzle-next"]').click({ timeout: 15_000 });
  await l.locator('[data-testid="puzzle-all-solved"]').waitFor({ timeout: 10_000 });
  check((await count(l, "puzzle-full-game")) === 0, '"You solved them all" in a wait: no full-game button');
  await shot(l, "c3-lobby-all-solved");
  await l.locator('[data-testid="puzzle-play-again"]').click({ timeout: 5_000 }); // a real click: fails if the card is inert
  await l.waitForFunction((id) => document.querySelector('[data-testid="puzzle-panel"]')?.getAttribute("data-puzzle") === id && !document.querySelector('[data-testid="puzzle-all-solved"]'), ids[0], { timeout: 15_000 });
  await waitPuzzlePlaying(l);
  check((await count(l, "puzzle-result-solved")) === 0 && (await filledPips(l)) > 0, '"Play them again" starts over from the first puzzle, on a clean board');
  check(await l.evaluate((all) => JSON.stringify(JSON.parse(localStorage.getItem("unbrewed-pro-puzzles-solved"))) === JSON.stringify([...all.slice(1), all[0]]), ids), "the solved record is kept (all of them, none cleared)");
  check(l.__errors.length === 0, `no page errors${l.__errors[0] ? `: ${l.__errors[0].slice(0, 200)}` : ""}`);
  await l.context().close();

  // The picker's column needs more height than the lobby screen does.
  const q = await seat(browser, { width: 1280, height: 660 });
  await openPicker(q);
  await visible(q, "quick-match").click();
  await visible(q, "quick-match-searching").waitFor({ timeout: 20_000 });
  await q.waitForTimeout(2500);
  check((await count(q, "puzzle-panel")) === 0 && (await sockets(q)).puzzle === 0, "1280×660: a Quick Match search keeps today's picker (no panel, no puzzle socket)");
  check(await q.locator('[data-testid="pro-roster-scroll"]').isVisible(), "…with the roster in place");
  await q.context().close();

  // Small viewports keep today's screens.
  for (const [w, h, name] of [
    [390, 844, "phone"],
    [900, 800, "narrow"],
    [1280, 600, "short"],
  ]) {
    const p = await seat(browser, { width: w, height: h });
    await openPicker(p);
    await visible(p, "pro-create-button").click();
    await p.locator('[data-testid="waiting-title"]').waitFor({ timeout: 20_000 });
    await p.waitForTimeout(2500);
    const s = await sockets(p);
    check((await count(p, "puzzle-panel")) === 0 && (await count(p, "wait-bar")) === 0 && s.puzzle === 0, `${w}×${h} (${name}): today's waiting screen, no panel, no puzzle socket`);
    if (name === "phone") await shot(p, "c2-phone-lobby-unchanged");
    await p.context().close();
  }
};

const browser = await chromium.launch();
try {
  await quickPlay(browser);
  await lobby(browser);
  await switches(browser);
} catch (e) {
  fail(`aborted: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}
console.log(failures.length ? `\nFAIL (${failures.length})` : "\nPASS");
process.exit(failures.length ? 1 : 0);
