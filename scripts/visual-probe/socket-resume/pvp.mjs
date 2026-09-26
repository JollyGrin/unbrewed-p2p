// PvP smoke vs the PROD engine (p2p #869): two separate Chrome instances (two
// profiles = two players) seated in ONE room; both connect, moves sync both
// ways, and a real >threshold tab switch on seat A recovers with one RECONNECT.
import fs from "fs";
import { sleep } from "./cdp.mjs";
import { shot, frames } from "./ui.mjs";
const ENGINE = "wss://engine.unbrewed.xyz";
const V = 34;
const BASE = process.env.BASE || "http://localhost:3869";
const OUT = process.env.OUT || (await import("os")).tmpdir() + "/socket-resume-probe"; fs.mkdirSync(OUT, { recursive: true });
const hook = fs.readFileSync(new URL("./hook.js", import.meta.url), "utf8");

// 1. Mint the room + both seat tokens over the wire, then drop those sockets.
const wsOpen = (url) => new Promise((r) => { const w = new WebSocket(url); const q = []; w.onmessage = (e) => q.push(JSON.parse(e.data)); w.onopen = () => r({ w, q }); });
const waitFor = async (q, type) => { for (let i = 0; i < 100; i++) { const m = q.find((x) => x.type === type || x.type === "ERROR"); if (m) return m; await sleep(100); } throw new Error("timeout " + type); };
const a = await wsOpen(ENGINE);
a.w.send(JSON.stringify({ v: V, type: "LIST_HEROES" }));
const heroes = (await waitFor(a.q, "HEROES")).heroes;
const hero = (heroes.find((h) => h.heroId === "king-kong") ?? heroes[0]).heroId;
a.w.send(JSON.stringify({ v: V, type: "CREATE_ROOM", heroId: hero, mulligan: false }));
const created = await waitFor(a.q, "ROOM_CREATED");
if (created.type === "ERROR") throw new Error(JSON.stringify(created));
const b = await wsOpen(ENGINE);
b.w.send(JSON.stringify({ v: V, type: "JOIN_ROOM", roomId: created.roomId, heroId: heroes.find((h) => h.heroId !== hero).heroId }));
const joined = await waitFor(b.q, "ROOM_JOINED");
const room = created.roomId;
await sleep(1000); a.w.close(); b.w.close();
console.log("room", room, "seats", created.you, joined.you);

// 2. Seat each browser over its own token (sessionStorage = this tab's seat).
const open = async (port, token) => {
  const B = `http://127.0.0.1:${port}`;
  const tab = await (await fetch(`${B}/json/new?about:blank`, { method: "PUT" })).json();
  await sleep(400);
  const { session } = await import("./cdp.mjs");
  const s = await session(tab);
  await s.send("Page.enable");
  await s.send("Emulation.setDeviceMetricsOverride", { width: 1456, height: 830, deviceScaleFactor: 1, mobile: false });
  await s.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `sessionStorage.setItem("unbrewed-pro-token-${room}", ${JSON.stringify(token)}); localStorage.setItem("unbrewed-pro-token-${room}", ${JSON.stringify(token)});\n` + hook,
  });
  await s.send("Page.navigate", { url: `${BASE}/pro/game?room=${room}` });
  return { s, tab, B };
};
const A = await open(9869, created.token);
const Bp = await open(9870, joined.token);
await sleep(12000);
const typesIn = async (p) => (await frames(p.s)).frames.filter((f) => f.dir === "in" && f.type).map((f) => f.type);
const result = { room };
result.connected = { A: (await typesIn(A)).includes("STATE"), B: (await typesIn(Bp)).includes("STATE") };

// 3. Moves sync: whichever seat has legal actions plays one through its OWN page socket.
const statesIn = async (p) => (await frames(p.s)).frames.filter((f) => f.dir === "in" && f.type === "STATE").length;
const turnKey = (p) => p.s.evaluate("JSON.stringify(window.__lastState && [window.__lastState.view.phase, window.__lastState.view.turnNumber, window.__lastState.view.activePlayer, window.__lastState.view.fighters.map(f=>f.space)])");
const playOne = async () => {
  for (const [me, other] of [[A, Bp], [Bp, A]]) {
    const acts = await me.s.evaluate("JSON.stringify(window.__lastState?.legalActions ?? [])").then(JSON.parse);
    const act = acts.find((x) => !/FORFEIT|CONCEDE/.test(x.type));
    if (!act) continue;
    const before = await statesIn(other);
    await me.s.evaluate(`window.__sockets.at(-1).send(JSON.stringify({v:${V},type:"ACTION",roomId:${JSON.stringify(room)},action:${JSON.stringify(act)}})); 1`);
    await sleep(2500);
    const same = (await turnKey(me)) === (await turnKey(other));
    return { by: me === A ? "A" : "B", action: act.type, otherGotState: (await statesIn(other)) > before, viewsAgree: same };
  }
  return { none: true };
};
result.moves = [await playOne(), await playOne(), await playOne()];
await shot(A.s, OUT + "/A-before-hide.png"); await shot(Bp.s, OUT + "/B-before-hide.png");

// 4. Seat A: a REAL tab switch longer than the threshold, then back.
const from = (await frames(A.s)).frames.at(-1)?.at ?? 0;
const other = await (await fetch(`${A.B}/json/new?about:blank`, { method: "PUT" })).json();
await fetch(`${A.B}/json/activate/${other.id}`);
await sleep(8000);
await fetch(`${A.B}/json/activate/${A.tab.id}`);
await fetch(`${A.B}/json/close/${other.id}`);
await sleep(4000);
const fa = await frames(A.s);
result.hide = {
  reconnects: fa.frames.filter((f) => f.at > from && f.dir === "out" && f.type === "RECONNECT").length,
  frames: fa.frames.filter((f) => f.at > from && f.type).map((f) => `${f.at} ${f.dir} ${f.type}${f.code ? ":" + f.code : ""}`),
  toasts: fa.toasts.filter((t) => t.at > from),
};
// …and the recovered socket still carries play both ways.
result.afterHide = [await playOne(), await playOne()];
await shot(A.s, OUT + "/A-after-hide.png"); await shot(Bp.s, OUT + "/B-after-hide.png");
console.log(JSON.stringify(result, null, 1));
fs.writeFileSync(OUT + "/pvp.json", JSON.stringify(result, null, 1));
for (const p of [A, Bp]) { p.s.close(); await fetch(`${p.B}/json/close/${p.tab.id}`); }
