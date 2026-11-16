#!/usr/bin/env node
/**
 * Headless check for the embeddable Pro game view (issue #1678).
 *
 *   node scripts/pro/embedCheck.mjs embed   # /pro/dev/embed: containment, host page untouched, keyboard focus
 *   node scripts/pro/embedCheck.mjs game    # /pro/game: one bot game, create → game over
 *
 * Needs a dev server (`next dev`) pointed at a LOCAL engine
 * (NEXT_PUBLIC_PRO_WS_URL=ws://localhost:<port>) and a Playwright Chromium.
 * Playwright is deliberately NOT a dependency of this repo: pass the module by
 * path, e.g. PLAYWRIGHT=/path/to/node_modules/playwright-core.
 *
 *   BASE_URL     default http://localhost:3000
 *   PLAYWRIGHT   module specifier or path (default "playwright-core")
 *   OUT          screenshot directory (default: none written)
 *   HERO / VS    fighter ids (default king-kong / the-mandalorian)
 *   PANELS       embed mode: a subset of desktop,tablet,phone,wide,puzzle,modal,keyboard
 *
 * How it plays: an init script spies on the page's own WebSockets (the last
 * STATE per socket) and can send an action down the same socket. Board picks
 * are made by CLICKING the highlighted space in the panel; dock rows by the
 * number hotkeys; anything else goes down the socket. The view under test does
 * all the rendering either way.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright-core");

const MODE = process.argv[2] ?? "embed";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.OUT ? resolve(process.env.OUT) : null;
const HERO = process.env.HERO ?? "king-kong";
const VS = process.env.VS ?? "the-mandalorian";
if (OUT) mkdirSync(OUT, { recursive: true });

const failures = [];
const notes = [];
const fail = (msg) => {
  failures.push(msg);
  console.log(`  FAIL ${msg}`);
};
const ok = (msg) => console.log(`  ok   ${msg}`);
const check = (cond, msg) => (cond ? ok(msg) : fail(msg));

/** Runs in the page before anything else: spy on every WebSocket it opens. */
const spy = () => {
  const Native = window.WebSocket;
  const socks = (window.__pro = []);
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      // Not the dev server's HMR socket.
      if (String(url).includes("_next")) return;
      const rec = { ws: this, url: String(url), room: null, state: null, seq: 0 };
      socks.push(rec);
      this.addEventListener("message", (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.roomId && (msg.type === "ROOM_CREATED" || msg.type === "ROOM_JOINED")) rec.room = msg.roomId;
        if (msg.type === "STATE") {
          rec.state = msg;
          rec.seq += 1;
        }
      });
    }
  };
};

const sockOf = (page, room) =>
  page.evaluate((room) => {
    const rec = (window.__pro ?? []).find((s) => (room ? s.room === room : s.state));
    if (!rec || !rec.state) return null;
    const { view, legalActions } = rec.state;
    const prompt = view.prompt;
    return {
      room: rec.room,
      seq: rec.seq,
      you: view.you,
      phase: view.phase,
      winner: view.winner ?? null,
      active: view.activePlayer,
      turn: view.turnNumber,
      combat: view.combat ? { stage: view.combat.stage } : null,
      prompt: prompt ? { promptId: prompt.promptId, player: prompt.player, kind: prompt.kind } : null,
      legal: legalActions ?? [],
    };
  }, room);

const sendAction = (page, room, action) =>
  page.evaluate(
    ({ room, action }) => {
      const rec = window.__pro.find((s) => s.room === room);
      rec.ws.send(JSON.stringify({ v: rec.state.v ?? 40, type: "ACTION", roomId: room, action }));
    },
    { room, action }
  );

const waitSeq = async (page, room, after, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await sockOf(page, room);
    if (s && s.seq > after) return s;
    await page.waitForTimeout(100);
  }
  return null;
};

/** What to do next. Never forfeits; attacks when it can, so the game ends. */
const PRIORITY = [
  "RESPOND_PROMPT",
  "COMMIT_DEFENSE_CARD",
  "DECLINE_DEFENSE",
  "COMMIT_ATTACK_CARD",
  "DECLARE_ATTACK",
  "MOVE_FIGHTER",
  "MANEUVER",
  "END_MANEUVER",
  "DISCARD_TO_LIMIT",
  "SCHEME",
];
const pick = (legal) => {
  for (const type of PRIORITY) {
    const hit = legal.find((a) => a.type === type);
    if (hit) return hit;
  }
  return legal.find((a) => a.type !== "FORFEIT") ?? null;
};

// ---------------------------------------------------------------------------
// embed mode
// ---------------------------------------------------------------------------

/**
 * Nothing the view renders may show outside its panel box:
 *
 *  - every element belongs to the frame's DOM subtree (no Chakra portal of the
 *    view sits outside it), and the frame clips;
 *  - every element's VISIBLE rect — its bounding rect cut down by the scroll
 *    containers it sits in (a long log scrolls inside its sheet) — lies inside
 *    the panel box. That is the half that catches chrome hanging off an edge:
 *    a menu opening past the panel, a sheet taller than it, a button pushed out.
 *
 * Two things are SUPPOSED to run past an edge, exactly as they run past the
 * viewport's on /pro/game, and are marked `data-pro-bleed`: the zoomable board
 * (it pans under the chrome) and the desktop hand fan (docked 0.75rem below
 * the bottom edge; a card lifts on hover).
 */
const containment = (page, id) =>
  page.evaluate((id) => {
    const boxEl = document.querySelector(`[data-testid=embed-box-${id}]`);
    const frame = boxEl.querySelector("[data-testid=pro-contained]");
    const root = frame.querySelector("[data-testid=pro-game-view]");
    const box = boxEl.getBoundingClientRect();
    const TOL = 1;
    const bleeds = [...frame.querySelectorAll("[data-pro-bleed]")];
    const clips = (el) => {
      const cs = getComputedStyle(el);
      return [cs.overflowX, cs.overflowY].some((v) => v !== "visible");
    };
    const offenders = [];
    let count = 0;
    for (const el of frame.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      if (bleeds.some((b) => b.contains(el))) continue;
      // Cut the rect down by every scroll container between it and the view root.
      let vis = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      for (let a = el.parentElement; a && a !== root && a !== frame; a = a.parentElement) {
        if (!clips(a)) continue;
        const ar = a.getBoundingClientRect();
        vis = { left: Math.max(vis.left, ar.left), top: Math.max(vis.top, ar.top), right: Math.min(vis.right, ar.right), bottom: Math.min(vis.bottom, ar.bottom) };
      }
      if (vis.right <= vis.left || vis.bottom <= vis.top) continue; // scrolled out of its container
      count += 1;
      if (vis.left < box.left - TOL || vis.top < box.top - TOL || vis.right > box.right + TOL || vis.bottom > box.bottom + TOL) {
        offenders.push(
          `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ""}.${String(el.className).slice(0, 40)} ` +
            `(${Math.round(vis.left - box.left)},${Math.round(vis.top - box.top)} ${Math.round(vis.right - vis.left)}x${Math.round(vis.bottom - vis.top)}) "${(el.textContent ?? "").slice(0, 30)}"`
        );
      }
    }
    // Anything portalled while the view is up must be inside a frame.
    const stray = [...document.querySelectorAll(".chakra-portal")]
      // (the host app's own, always-mounted toast regions are not the view's)
      .filter((p) => !p.closest("[data-testid=pro-contained]") && [...p.children].some((c) => !/^chakra-toast-manager/.test(c.id)))
      .map((p) => p.innerHTML.slice(0, 120));
    const frameRect = frame.getBoundingClientRect();
    const frameIsBox = Math.abs(frameRect.width - box.width) <= TOL && Math.abs(frameRect.height - box.height) <= TOL;
    return { count, offenders, stray, scrolled: frame.scrollLeft !== 0 || frame.scrollTop !== 0 || root.scrollLeft !== 0 || root.scrollTop !== 0, frameIsBox };
  }, id);

const hostFingerprint = (page) =>
  page.evaluate(() => ({
    href: location.href,
    title: document.title,
    recent: localStorage.getItem("unbrewed-pro-recent-rooms"),
    roomKeys: [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => /^unbrewed-pro-(token|resume|bots)-/.test(k)).sort(),
  }));

const roomOfPanel = async (page, id) => {
  const text = await page.textContent(`[data-testid=embed-status-${id}]`);
  return /room (\S+)/.exec(text ?? "")?.[1] ?? null;
};

let shotTag = null;
const assertContained = async (page, id, label) => {
  // let transitions settle: a sheet sliding in is "outside" for a frame or two
  await page.waitForTimeout(700);
  const res = await containment(page, id);
  check(
    res.offenders.length === 0 && res.stray.length === 0 && !res.scrolled && res.frameIsBox,
    `${id}: contained ${label} (${res.count} elements, ${res.offenders.length} outside, ${res.stray.length} stray portals${res.scrolled ? ", FRAME SCROLLED" : ""})`
  );
  for (const o of res.offenders.slice(0, 8)) console.log(`         ${o}`);
  for (const o of res.stray.slice(0, 3)) console.log(`         stray portal: ${o}`);
  if (OUT) await page.locator(`[data-testid=embed-panel-${id}]`).screenshot({ path: `${OUT}/embed-${shotTag ?? id}-${label.replace(/\W+/g, "-")}.png` });
};

/** Click a highlighted board space inside the panel. True if the game advanced. */
const clickPick = async (page, id, room, seq) => {
  const picks = page.locator(`[data-testid=embed-box-${id}] [data-pick]`);
  if ((await picks.count()) === 0) return false;
  await picks.first().click({ force: true, timeout: 2000 }).catch(() => {});
  return !!(await waitSeq(page, room, seq, 2500));
};

const playPanel = async (page, id, { puzzle = false } = {}) => {
  console.log(`\n[embed] ${id}${puzzle ? " (puzzle switches)" : ""}`);
  shotTag = puzzle ? `${id}-puzzle` : id;
  await page.goto(`${BASE}/pro/dev/embed?panel=${id}&hero=${HERO}&vs=${VS}${puzzle ? "&puzzle=1" : ""}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const before = await hostFingerprint(page);
  await page.waitForSelector(`[data-testid=embed-box-${id}] [data-testid=pro-game-view]`, { timeout: 120000 });
  const room = await roomOfPanel(page, id);
  check(!!room, `${id}: bot room opened (${room})`);
  await assertContained(page, id, "first state");

  const seen = { move: false, combat: false, prompt: false };
  let uiClicks = 0;
  for (let step = 0; step < 160 && !(seen.move && seen.combat && seen.prompt); step++) {
    const s = await sockOf(page, room);
    if (!s || s.winner) break;
    if (s.prompt && s.prompt.player === s.you && !seen.prompt) {
      seen.prompt = true;
      await assertContained(page, id, "prompt open");
    }
    if (s.combat && !seen.combat) {
      seen.combat = true;
      await assertContained(page, id, "during combat");
    }
    const mine = s.legal.filter((a) => a.type !== "FORFEIT");
    if (mine.length === 0) {
      // the bot's move: wait for it
      if (!(await waitSeq(page, room, s.seq, 20000))) break;
      continue;
    }
    // A board pick (setup placement, a move step, an effect's space prompt) is
    // made through the panel itself.
    if (await clickPick(page, id, room, s.seq)) {
      uiClicks += 1;
      if (!seen.move && s.phase === "PLAY") {
        seen.move = true;
        await assertContained(page, id, "after a move");
      }
      continue;
    }
    const action = pick(s.legal);
    if (!action) break;
    await sendAction(page, room, action);
    const next = await waitSeq(page, room, s.seq, 8000);
    if (!next) {
      notes.push(`${id}: no STATE after ${action.type}`);
      break;
    }
    if (action.type === "MOVE_FIGHTER" && !seen.move) {
      seen.move = true;
      await assertContained(page, id, "after a move");
    }
  }
  check(seen.move, `${id}: reached "after a move"`);
  check(seen.combat, `${id}: reached "during combat"`);
  check(seen.prompt, `${id}: reached "prompt open"`);
  check(uiClicks > 0, `${id}: board picks made by clicking inside the panel (${uiClicks})`);

  // Open what can be opened: the log, the menu, the hand.
  for (const label of ["Activity log", "Discard piles", "Game menu"]) {
    const btn = page.locator(`[data-testid=embed-box-${id}] [aria-label="${label}"]`).first();
    if ((await btn.count()) === 0) continue;
    await btn.click({ timeout: 2000 }).catch(() => {});
    await assertContained(page, id, `${label} open`);
    await page.keyboard.press("Escape");
    const scrim = page.locator(`[data-testid=embed-box-${id}] [data-testid$=scrim]`).first();
    if (await scrim.count()) await scrim.click({ force: true, timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  const after = await hostFingerprint(page);
  check(after.href === before.href, `${id}: host URL untouched (${after.href.replace(BASE, "")})`);
  check(after.title === before.title, `${id}: host title untouched ("${after.title}")`);
  check(after.recent === before.recent, `${id}: localStorage recent-rooms untouched (${after.recent})`);
  check(after.roomKeys.length === before.roomKeys.length, `${id}: no room token/resume/bots keys written (${after.roomKeys.length})`);
};

/** A modal opened by the view (the mulligan) stays in the panel and leaves the page be. */
const modalInPanel = async (page, id) => {
  console.log(`\n[embed] ${id}: a modal (the opening-hand mulligan)`);
  shotTag = `${id}-mulligan`;
  await page.goto(`${BASE}/pro/dev/embed?panel=${id}&hero=${HERO}&vs=${VS}&mulligan=1`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const dialog = page.locator(`[data-testid=embed-box-${id}] [role=alertdialog]`);
  await dialog.waitFor({ timeout: 120000 });
  await assertContained(page, id, "mulligan dialog");
  const dr = await dialog.boundingBox();
  const br = await page.locator(`[data-testid=embed-box-${id}]`).boundingBox();
  check(
    dr.x >= br.x - 1 && dr.y >= br.y - 1 && dr.x + dr.width <= br.x + br.width + 1 && dr.y + dr.height <= br.y + br.height + 1,
    `${id}: the dialog box is inside the panel box`
  );
  const host = await page.evaluate(() => ({
    bodyOverflow: getComputedStyle(document.body).overflow,
    hidden: [...document.querySelectorAll("[aria-hidden=true],[inert]")].filter((el) => !el.closest("[data-testid=pro-contained]") && el.tagName !== "svg" && !el.closest("svg")).length,
    dialogsOutside: [...document.querySelectorAll("[role=alertdialog],[role=dialog]")].filter((el) => !el.closest("[data-testid=pro-contained]")).length,
  }));
  check(host.bodyOverflow !== "hidden", `${id}: the host page's scroll is not locked (body overflow: ${host.bodyOverflow})`);
  check(host.hidden === 0, `${id}: nothing on the host page is aria-hidden / inert (${host.hidden})`);
  check(host.dialogsOutside === 0, `${id}: the dialog is inside the panel`);
};

/** Advance a panel until its seat is on turn with dock rows to press. */
const toMyTurn = async (page, id, room) => {
  for (let step = 0; step < 80; step++) {
    const s = await sockOf(page, room);
    if (!s || s.winner) return null;
    const mine = s.legal.filter((a) => a.type !== "FORFEIT");
    const idle = s.phase === "PLAY" && s.active === s.you && !s.prompt && !s.combat && mine.length >= 2 && mine.every((a) => a.type !== "MOVE_FIGHTER" && a.type !== "END_MANEUVER");
    if (idle) return s;
    if (mine.length === 0) {
      if (!(await waitSeq(page, room, s.seq, 20000))) return null;
      continue;
    }
    if (await clickPick(page, id, room, s.seq)) continue;
    await sendAction(page, room, pick(s.legal));
    if (!(await waitSeq(page, room, s.seq, 8000))) return null;
  }
  return null;
};

const keyboardIsolation = async (page) => {
  console.log("\n[embed] keyboard: two panels on one page");
  await page.goto(`${BASE}/pro/dev/embed?hero=${HERO}&vs=${VS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const ids = ["desktop", "tablet"];
  const rooms = {};
  for (const id of ids) {
    await page.waitForSelector(`[data-testid=embed-box-${id}] [data-testid=pro-game-view]`, { timeout: 120000 });
    rooms[id] = await roomOfPanel(page, id);
  }
  const ready = {};
  for (const id of ids) ready[id] = await toMyTurn(page, id, rooms[id]);
  check(!!ready.desktop && !!ready.tablet, "both panels are on their own turn with dock rows");
  if (!ready.desktop || !ready.tablet) return;
  const seqs = async () => ({ desktop: (await sockOf(page, rooms.desktop)).seq, tablet: (await sockOf(page, rooms.tablet)).seq });

  // 1. focus outside both panels: the key belongs to the host page
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  let a = await seqs();
  await page.keyboard.press("1");
  await page.waitForTimeout(1500);
  let b = await seqs();
  check(b.desktop === a.desktop && b.tablet === a.tablet, 'no panel focused: "1" acts on neither');

  // 2. focus the tablet panel: only it acts
  await page.locator("[data-testid=embed-box-tablet] [data-testid=pro-contained]").focus();
  a = await seqs();
  await page.keyboard.press("1");
  await waitSeq(page, rooms.tablet, a.tablet, 5000);
  await page.waitForTimeout(1200);
  b = await seqs();
  check(b.tablet > a.tablet, 'tablet focused: "1" fires the tablet panel\'s first dock row');
  check(b.desktop === a.desktop, 'tablet focused: the desktop panel ignores "1"');
  if (OUT) await page.screenshot({ path: `${OUT}/embed-all-panels.png`, fullPage: true });
};

// ---------------------------------------------------------------------------
// game mode: /pro/game, one bot game end to end
// ---------------------------------------------------------------------------

const playGame = async (page) => {
  console.log("\n[game] /pro/game vs bot");
  const shot = async (name) => OUT && (await page.screenshot({ path: `${OUT}/game-${name}.png` }));
  await page.goto(`${BASE}/pro/game?vs=ai-easy&hero=${HERO}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const create = page.getByRole("button", { name: /^(create|play|start|fight)/i }).first();
  await create.waitFor({ timeout: 120000 });
  await shot("0-picker");
  await create.click();
  await page.waitForFunction(() => (window.__pro ?? []).some((s) => s.state), null, { timeout: 60000 });
  const room = (await sockOf(page, null)).room;
  check(!!room, `room created (${room})`);
  await page.waitForFunction((room) => new URL(location.href).searchParams.get("room") === room, room, { timeout: 10000 }).catch(() => {});
  check(new URL(page.url()).searchParams.get("room") === room, "the room id is written to the URL, as before");
  const stored = await page.evaluate((room) => ({ token: !!localStorage.getItem(`unbrewed-pro-token-${room}`), recent: localStorage.getItem("unbrewed-pro-recent-rooms") ?? "" }), room);
  check(stored.token && stored.recent.includes(room), "the reconnect token and recent-rooms entry are stored, as before");

  const seen = { move: false, attack: false, defend: false, prompt: false };
  let steps = 0;
  for (; steps < 900; steps++) {
    const s = await sockOf(page, room);
    if (!s) break;
    if (s.winner) break;
    const mine = s.legal.filter((a) => a.type !== "FORFEIT");
    if (mine.length === 0) {
      if (!(await waitSeq(page, room, s.seq, 30000))) break;
      continue;
    }
    if (s.prompt && s.prompt.player === s.you && !seen.prompt) {
      seen.prompt = true;
      await page.waitForTimeout(500);
      await shot("3-prompt");
    }
    const action = pick(s.legal);
    if (action.type === "COMMIT_DEFENSE_CARD" || action.type === "DECLINE_DEFENSE") {
      if (!seen.defend) {
        seen.defend = true;
        await page.waitForTimeout(500);
        await shot("2b-defend");
      }
    }
    // The first move is made on the board itself.
    if (!seen.move && s.phase === "PLAY" && mine.some((a) => a.type === "MOVE_FIGHTER")) {
      const picks = page.locator("[data-pick]");
      if (await picks.count()) {
        await picks.first().click({ force: true }).catch(() => {});
        if (await waitSeq(page, room, s.seq, 2500)) {
          seen.move = true;
          await page.waitForTimeout(900);
          await shot("1-move");
          continue;
        }
      }
    }
    await sendAction(page, room, action);
    const next = await waitSeq(page, room, s.seq, 10000);
    if (!next) {
      notes.push(`game: no STATE after ${action.type}`);
      break;
    }
    if (action.type === "MOVE_FIGHTER") seen.move = true;
    if (action.type === "COMMIT_ATTACK_CARD" && !seen.attack) {
      seen.attack = true;
      await page.waitForTimeout(400);
      await shot("2a-attack");
    }
  }
  const end = await sockOf(page, room);
  check(seen.move, "moved a fighter");
  check(seen.attack, "attacked (committed an attack card)");
  check(seen.defend, "defended (answered an attack)");
  check(seen.prompt, "answered a prompt");
  check(!!end?.winner, `game over after ${steps} steps (winner ${end?.winner})`);
  await page.waitForTimeout(2500);
  const rematch = page.getByText(/rematch/i).first();
  check((await rematch.count()) > 0 && (await rematch.isVisible()), "Rematch is offered on the end screen");
  await shot("4-game-over");
};

// ---------------------------------------------------------------------------

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(spy);
// No analytics from a test browser.
await context.route(/posthog|t\.unbrewed\.xyz/, (route) => route.abort());
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));

try {
  if (MODE === "game") {
    await playGame(page);
  } else {
    const only = process.env.PANELS ? process.env.PANELS.split(",") : null;
    for (const id of ["desktop", "tablet", "phone", "wide"]) if (!only || only.includes(id)) await playPanel(page, id);
    if (!only || only.includes("puzzle")) await playPanel(page, "phone", { puzzle: true });
    // Not the 360px phone panel: before the fighters are placed its two seat
    // chips carry an "OFF BOARD" tag each and are 387px wide together — the
    // same on a 360px phone on /pro/game today, and not a state a puzzle has.
    for (const id of ["desktop", "tablet"]) if (!only || only.includes("modal")) await modalInPanel(page, id);
    if (!only || only.includes("keyboard")) await keyboardIsolation(page);
  }
} finally {
  await browser.close();
}

check(pageErrors.length === 0, `no uncaught page errors (${pageErrors.length})`);
for (const e of pageErrors.slice(0, 5)) console.log(`         ${e}`);
for (const n of notes) console.log(`  note ${n}`);
console.log(failures.length === 0 ? "\nPASS" : `\nFAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);
