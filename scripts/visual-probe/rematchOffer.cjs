/**
 * Rematch offer/confirm, two players, live (p2p #880 / engine #607).
 *
 * Two separate headless Chromium contexts (two players, no shared storage).
 * Each scenario mints a fresh PvP room over the wire, seats one context per
 * seat by its token, ends the game with a FORFEIT from seat B's own page
 * socket, then drives the winner screen. Every engine frame both pages send
 * or receive is logged, so the JSON answers "what went on the wire" as well
 * as "what did the player see".
 *
 * Usage (a dev server on YOUR port, pointed at the engine under test):
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright \
 *   BASE=http://localhost:3880 ENGINE=ws://localhost:8880 OUT=/tmp/rematch \
 *     node scripts/visual-probe/rematchOffer.cjs [scenario ...]
 *
 * Scenarios: accept decline cancel refresh left both vsai v34
 * PHONE_B="iPhone 14" (or "iPhone 14 landscape") puts seat B on a phone.
 * (`v34` expects a v34 engine: PvP must show the one-tap link and send no
 * REMATCH_*; `left` waits out the engine's 30s disconnect grace.)
 */
const fs = require("fs");
const { chromium } = require(process.env.PW_PATH || "playwright");

const BASE = process.env.BASE || "http://localhost:3880";
const ENGINE = process.env.ENGINE || "ws://localhost:8880";
const OUT = process.env.OUT || "/tmp/rematch-probe";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOOK = `(() => {
  window.__frames = []; window.__sockets = [];
  const send = WebSocket.prototype.send;
  const engine = (ws) => !/_next/.test(ws.url); // skip the dev server's HMR socket
  WebSocket.prototype.send = function (d) {
    if (!engine(this)) return send.call(this, d);
    if (!window.__sockets.includes(this)) window.__sockets.push(this);
    try { const m = JSON.parse(d); if (/^REMATCH_/.test(m.type)) sessionStorage.setItem("__probeSent", (sessionStorage.getItem("__probeSent") || "") + m.type + ","); window.__frames.push({ dir: "out", type: m.type, v: m.v, roomId: m.roomId, accept: m.accept }); } catch {}
    return send.call(this, d);
  };
  const desc = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
  Object.defineProperty(WebSocket.prototype, "onmessage", {
    configurable: true, get: desc.get,
    set(fn) {
      desc.set.call(this, fn && function (e) {
        if (!engine(this)) return fn.call(this, e);
        try { const m = JSON.parse(e.data); window.__frames.push({ dir: "in", type: m.type, v: m.v, code: m.code, roomId: m.roomId, reason: m.reason, from: m.from, player: m.player });
          if (m.type === "STATE") window.__lastState = m; } catch {}
        return fn.call(this, e);
      });
    },
  });
})();`;

// ---- the wire: mint a room + both seat tokens, then drop the sockets ------
const wsOpen = (url) =>
  new Promise((resolve, reject) => {
    const w = new WebSocket(url);
    const q = [];
    w.onmessage = (e) => q.push(JSON.parse(e.data));
    w.onopen = () => resolve({ w, q });
    w.onerror = reject;
  });
const waitFor = async (q, type) => {
  for (let i = 0; i < 100; i++) {
    const m = q.find((x) => x.type === type || x.type === "ERROR");
    if (m) return m;
    await sleep(100);
  }
  throw new Error("timeout " + type);
};
async function mint({ bot = false } = {}) {
  const a = await wsOpen(ENGINE);
  a.w.send(JSON.stringify({ v: 34, type: "LIST_HEROES" }));
  const heroes = (await waitFor(a.q, "HEROES")).heroes;
  const engineV = a.q.find((m) => m.type === "HEROES").v;
  a.w.send(
    JSON.stringify({ v: 34, type: "CREATE_ROOM", heroId: "king-kong", mulligan: false, ...(bot ? { bot: { difficulty: "easy" } } : {}) })
  );
  const created = await waitFor(a.q, "ROOM_CREATED");
  if (created.type === "ERROR") throw new Error(JSON.stringify(created));
  let joined = null;
  if (!bot) {
    const b = await wsOpen(ENGINE);
    b.w.send(JSON.stringify({ v: 34, type: "JOIN_ROOM", roomId: created.roomId, heroId: heroes.find((h) => h.heroId !== "king-kong").heroId }));
    joined = await waitFor(b.q, "ROOM_JOINED");
    await sleep(500);
    b.w.close();
  }
  await sleep(500);
  a.w.close();
  return { room: created.roomId, tokA: created.token, seatA: created.you, tokB: joined?.token, seatB: joined?.you, engineV };
}

// ---- the pages -------------------------------------------------------------
// `bots` = what the page that created/joined the room would have recorded
// (ROOM_STATUS writes `{}` for PvP) — a room minted over the wire has none.
async function seat(browser, room, token, label, bots = {}) {
  // PHONE_B="iPhone 14" (any Playwright device name) puts seat B on a phone.
  const phone = label === "B" && process.env.PHONE_B ? require(process.env.PW_PATH || "playwright").devices[process.env.PHONE_B] : null;
  const ctx = await browser.newContext(phone ?? { viewport: { width: 1456, height: 830 } });
  await ctx.addInitScript(
    `sessionStorage.setItem("unbrewed-pro-token-${room}", ${JSON.stringify(token)});` +
      `localStorage.setItem("unbrewed-pro-token-${room}", ${JSON.stringify(token)});` +
      `localStorage.setItem("unbrewed-pro-bots-${room}", ${JSON.stringify(JSON.stringify(bots))});` +
      HOOK
  );
  const page = await ctx.newPage();
  page.label = label;
  await page.goto(`${BASE}/pro/game?room=${room}`);
  await page.waitForFunction(() => !!window.__lastState, null, { timeout: 30000 });
  return { ctx, page };
}
const frames = (page) => page.evaluate(() => window.__frames);
const rematchFrames = async (page) =>
  (await frames(page)).filter((f) => /^REMATCH_/.test(f.type) || f.code === "REMATCH_UNAVAILABLE" || f.type === "RECONNECT");
const statusText = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid="rematch-offer"] [role=status]')].map((n) => n.textContent.trim()));
// FORFEIT is only legal for the seat on the clock, and only once SETUP is over:
// play the first legal setup action until one page holds a FORFEIT, then send it.
const forfeitFrom = async (pages, room) => {
  for (let round = 0; round < 30; round++) {
    for (const page of pages) {
      const sent = await page.evaluate((room) => {
        const acts = window.__lastState?.legalActions ?? [];
        const f = acts.find((a) => a.type === "FORFEIT");
        const act = f ?? (window.__lastState?.view.phase === "SETUP" ? acts[0] : null);
        if (!act) return null;
        window.__sockets.at(-1).send(JSON.stringify({ v: 34, type: "ACTION", roomId: room, action: act }));
        return act.type;
      }, room);
      if (sent === "FORFEIT") return page.label;
      if (sent) await sleep(700);
    }
    await sleep(300);
  }
  for (const page of pages) {
    const sent = await page.evaluate((room) => {
      const f = (window.__lastState?.legalActions ?? []).find((a) => a.type === "FORFEIT");
      if (!f) return false;
      window.__sockets.at(-1).send(JSON.stringify({ v: 34, type: "ACTION", roomId: room, action: f }));
      return true;
    }, room);
    if (sent) return page.label;
  }
  throw new Error("no seat can forfeit");
};
const button = (page, name) => page.getByRole("button", { name }).first();
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
async function waitText(page, re, ms = 10000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const t = (await statusText(page)).join(" | ");
    if (re.test(t)) return t;
    await sleep(200);
  }
  throw new Error(`${page.label}: never saw ${re} (saw "${(await statusText(page)).join(" | ")}")`);
}
async function waitRoomChange(page, from, ms = 20000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const room = new URL(page.url()).searchParams.get("room");
    const live = await page.evaluate(() => window.__lastState && !window.__lastState.view.winner).catch(() => false);
    if (room && room !== from && live) return room;
    await sleep(250);
  }
  throw new Error(`${page.label}: never moved off ${from} (url ${page.url()})`);
}

async function finished(browser, tag) {
  const m = await mint();
  const A = await seat(browser, m.room, m.tokA, "A");
  const B = await seat(browser, m.room, m.tokB, "B");
  await sleep(1500);
  await forfeitFrom([B.page, A.page], m.room);
  try {
    await A.page.waitForFunction(() => !!window.__lastState?.view.winner, null, { timeout: 15000 });
    await B.page.waitForFunction(() => !!window.__lastState?.view.winner, null, { timeout: 15000 });
    await A.page.getByRole("button", { name: /rematch — same setup/i }).first().waitFor({ timeout: 15000 });
  } catch (e) {
    await shot(A.page, `${tag}-FAIL-A`);
    throw new Error(`${e.message}; B frames ${JSON.stringify((await frames(B.page)).slice(-6))}; A frames ${JSON.stringify((await frames(A.page)).slice(-6))}`);
  }
  await shot(A.page, `${tag}-0-A-gameover`);
  return { m, A, B };
}

const SCENARIOS = {
  async accept(browser) {
    const { m, A, B } = await finished(browser, "accept");
    await button(A.page, /rematch — same setup/i).click();
    const aWait = await waitText(A.page, /Waiting for .* to accept/);
    const bSees = await waitText(B.page, /wants a rematch, same setup/);
    await shot(A.page, "accept-1-A-waiting");
    await shot(B.page, "accept-1-B-prompt");
    // Is Accept really on screen and uncovered where it sits (not scrolled/clipped away)?
    const acceptHittable = await B.page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Accept");
      if (!b) return false;
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const copy = document.querySelector('[data-testid="rematch-offer"] [role=status]');
      return { ok: r.bottom <= window.innerHeight && !!hit && b.contains(hit), copyPx: copy && getComputedStyle(copy).fontSize, top: Math.round(r.top), bottom: Math.round(r.bottom), hitTag: hit && hit.tagName + "." + hit.className.toString().slice(0, 40) };
    });
    await button(B.page, /^accept$/i).click();
    const [ra, rb] = await Promise.all([waitRoomChange(A.page, m.room), waitRoomChange(B.page, m.room)]);
    await sleep(1500);
    await shot(A.page, "accept-2-A-newroom");
    await shot(B.page, "accept-2-B-newroom");
    const fa = await frames(A.page);
    return {
      aWait, bSees, acceptHittable, newRoomA: ra, newRoomB: rb, sameRoom: ra === rb,
      noCreateRoom: !fa.some((f) => f.type === "CREATE_ROOM"),
      aFirstBindV: fa.find((f) => f.type === "RECONNECT")?.v,
    };
  },
  async decline(browser) {
    const { A, B } = await finished(browser, "decline");
    await button(A.page, /rematch — same setup/i).click();
    await waitText(B.page, /wants a rematch/);
    await button(B.page, /^decline$/i).click();
    const aSees = await waitText(A.page, /declined the rematch/);
    await shot(A.page, "decline-1-A-declined");
    const buttonBack = await button(A.page, /rematch — same setup/i).isVisible();
    return { aSees, buttonBack, aFrames: await rematchFrames(A.page), bFrames: await rematchFrames(B.page) };
  },
  async cancel(browser) {
    const { A, B } = await finished(browser, "cancel");
    await button(A.page, /rematch — same setup/i).click();
    await waitText(B.page, /wants a rematch/);
    await button(A.page, /^cancel$/i).click();
    const bSees = await waitText(B.page, /withdrew the rematch offer/);
    await shot(B.page, "cancel-1-B-withdrawn");
    return {
      bSees,
      aButtonBack: await button(A.page, /rematch — same setup/i).isVisible(),
      bButtonBack: await button(B.page, /rematch — same setup/i).isVisible(),
    };
  },
  async refresh(browser) {
    const { m, A, B } = await finished(browser, "refresh");
    await button(A.page, /rematch — same setup/i).click();
    await waitText(B.page, /wants a rematch/);
    await A.page.reload();
    await A.page.waitForFunction(() => !!window.__lastState?.view.winner, null, { timeout: 20000 });
    const aAfter = await waitText(A.page, /Waiting for .* to accept/, 20000);
    await shot(A.page, "refresh-1-A-after-reload");
    const reloadBindV = (await frames(A.page)).find((f) => f.type === "RECONNECT")?.v;
    const bStill = (await statusText(B.page)).join(" | ");
    await button(B.page, /^accept$/i).click();
    const [ra, rb] = await Promise.all([waitRoomChange(A.page, m.room), waitRoomChange(B.page, m.room)]);
    return { aAfter, reloadBindV, bStill, sameRoom: ra === rb, newRoom: ra };
  },
  async left(browser) {
    const { A, B } = await finished(browser, "left");
    await button(A.page, /rematch — same setup/i).click();
    await waitText(B.page, /wants a rematch/);
    await B.ctx.close();
    const t0 = Date.now();
    const aSees = await waitText(A.page, /left — no rematch/, 45000);
    await shot(A.page, "left-1-A-opponent-left");
    return { aSees, afterMs: Date.now() - t0, buttonBack: await button(A.page, /rematch — same setup/i).isVisible() };
  },
  async both(browser) {
    const { m, A, B } = await finished(browser, "both");
    await B.page.getByRole("button", { name: /rematch — same setup/i }).first().waitFor();
    // Press both in the same instant, in-page (a retrying locator click can't).
    const press = (page) =>
      page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Rematch — same setup/.test(b.textContent)).click());
    await Promise.all([press(A.page), press(B.page)]);
    const [ra, rb] = await Promise.all([waitRoomChange(A.page, m.room), waitRoomChange(B.page, m.room)]);
    await sleep(1000);
    await shot(A.page, "both-1-A-newroom");
    return {
      newRoomA: ra, newRoomB: rb, sameRoom: ra === rb,
      // what each tab sent before it moved (kept in sessionStorage across the navigation)
      rematchSent: await Promise.all([A.page, B.page].map((p) => p.evaluate(() => sessionStorage.getItem("__probeSent")))),
    };
  },
  async vsai(browser) {
    const m = await mint({ bot: true });
    // The bot takes whichever seat the creator didn't (seat order is random).
    const A = await seat(browser, m.room, m.tokA, "A", { [m.seatA === "p1" ? "p2" : "p1"]: "easy" });
    await sleep(1500);
    await forfeitFrom([A.page], m.room);
    await A.page.waitForFunction(() => !!window.__lastState?.view.winner, null, { timeout: 15000 });
    const link = A.page.getByRole("link", { name: /rematch/i }).first();
    await link.waitFor({ timeout: 15000 }).catch(async (e) => {
      await shot(A.page, "vsai-FAIL");
      throw new Error(e.message.split("\n")[0] + " frames " + JSON.stringify((await frames(A.page)).filter((f) => f.dir === "in").map((f) => f.type)));
    });
    await shot(A.page, "vsai-0-gameover");
    const noOfferButton = (await A.page.getByRole("button", { name: /rematch — same setup/i }).count()) === 0;
    await link.click();
    const newRoom = await waitRoomChange(A.page, m.room);
    await sleep(1500);
    await shot(A.page, "vsai-1-newroom");
    const f = await frames(A.page);
    return { noOfferButton, newRoom, createRoomSent: f.some((x) => x.type === "CREATE_ROOM"), rematchFrames: f.filter((x) => /^REMATCH_/.test(x.type)).length };
  },
};

// v34: the offer button must NOT appear — PvP keeps the link.
SCENARIOS.v34 = async (browser) => {
  const m = await mint();
  const A = await seat(browser, m.room, m.tokA, "A");
  const B = await seat(browser, m.room, m.tokB, "B");
  await sleep(1500);
  await forfeitFrom([B.page, A.page], m.room);
  await A.page.waitForFunction(() => !!window.__lastState?.view.winner, null, { timeout: 15000 });
  const link = A.page.getByRole("link", { name: /rematch/i }).first();
  await link.waitFor({ timeout: 15000 });
  await shot(A.page, "v34-0-A-gameover");
  const fa = await frames(A.page);
  const href = await link.getAttribute("href");
  const offerButtons = await A.page.getByRole("button", { name: /rematch — same setup/i }).count();
  await link.click();
  const newRoom = await waitRoomChange(A.page, m.room).catch(() => null);
  const inWaiting = await A.page.evaluate(() => window.__frames.filter((f) => f.type === "ROOM_CREATED").length);
  await shot(A.page, "v34-1-A-after-link");
  return {
    engineV: m.engineV,
    allSentV: [...new Set(fa.filter((f) => f.dir === "out").map((f) => f.v))],
    rematchFrames: fa.filter((f) => /^REMATCH_/.test(f.type)).length,
    offerButtons, href, roomCreatedAfterTap: inWaiting, newRoom,
  };
};

(async () => {
  const which = process.argv.slice(2);
  const names = which.length ? which : ["accept", "decline", "cancel", "refresh", "both", "vsai", "left"];
  const browser = await chromium.launch(process.env.PW_CHANNEL === "bundled" ? {} : { channel: "chrome" });
  const result = {};
  for (const name of names) {
    try {
      result[name] = await SCENARIOS[name](browser);
    } catch (e) {
      result[name] = { error: String(e.message || e) };
    }
    console.error(name, JSON.stringify(result[name]));
  }
  await browser.close();
  fs.writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
