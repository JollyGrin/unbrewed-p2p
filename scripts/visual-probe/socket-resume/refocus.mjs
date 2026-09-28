// Desktop refocus probe (p2p #869) vs the PROD engine: focus, short tab switch, long tab switch.
import fs from "fs";
import { newTab, activate, closeTab, session, sleep } from "./cdp.mjs";
import { click, shot, frames } from "./ui.mjs";
const BASE = process.env.BASE || "http://localhost:3869";
const OUT = process.env.OUT || (await import("os")).tmpdir() + "/socket-resume-probe"; fs.mkdirSync(OUT, { recursive: true });
const hook = fs.readFileSync(new URL("./hook.js", import.meta.url), "utf8");

const tab = await newTab("about:blank"); await sleep(500);
const s = await session(tab);
await s.send("Page.enable"); await s.send("Runtime.enable");
await s.send("Emulation.setDeviceMetricsOverride", { width: 1456, height: 830, deviceScaleFactor: 1, mobile: false });
await s.send("Page.addScriptToEvaluateOnNewDocument", { source: hook });
await s.send("Page.navigate", { url: BASE + "/pro/game" });
await sleep(6000);
await click(s, "^\\s*Bot·E\\s*$");
await click(s, "^\\s*King Kong by");
try { await click(s, "^\\s*Secluded Temple\\s*$", { timeout: 3000 }); }
catch { await click(s, "^\\s*All \\d+ boards"); await click(s, "^\\s*Secluded Temple\\s*$"); }
await click(s, "PLAY VS BOT");
await sleep(10000);
try { await click(s, "keep your opening hand|^\\s*keep", { timeout: 8000 }); } catch { console.log("no mulligan prompt"); }
await sleep(3000);
if (await s.evaluate("!document.querySelector('[data-table-stage-plane]')")) await click(s, "Board view: Flat board");
await sleep(3000);
await shot(s, OUT + "/0-tabletop.png");

const count = (f, from) => f.frames.filter((x) => x.at >= from && x.dir === "out" && x.type === "RECONNECT").length;
const mark = async () => s.evaluate("Math.round(performance.now())");
const result = {};
const step = async (name, fn, settle) => {
  const from = (await frames(s)).frames.at(-1)?.at ?? 0;
  await fn(); await sleep(settle);
  const f = await frames(s);
  result[name] = {
    reconnects: count(f, from + 1),
    toasts: f.toasts.filter((t) => t.at > from).map((t) => t.text),
    frames: f.frames.filter((x) => x.at > from).map((x) => `${x.at} ${x.dir} ${x.type}${x.code ? ":" + x.code : ""}`),
  };
};
// Let the #848 cooldown lapse so every trigger below is judged on its own.
await sleep(11000);
await step("focus", () => s.evaluate("window.dispatchEvent(new Event('focus')); 1"), 3000);
await sleep(11000);
await step("tabSwitch2s", async () => { const t = await newTab(); await activate(t.id); await sleep(2000); await activate(tab.id); await closeTab(t.id); }, 3000);
await sleep(11000);
await step("tabSwitch8s", async () => { const t = await newTab(); await activate(t.id); await sleep(8000); await activate(tab.id); await closeTab(t.id); }, 4000);
await shot(s, OUT + "/1-after-long-hide.png");
result.boardMounted = await s.evaluate("!!document.querySelector('[data-table-stage-plane]')");
result.status = await s.evaluate("window.__sockets.at(-1)?.readyState");
console.log(JSON.stringify(result, null, 1));
fs.writeFileSync(OUT + "/result.json", JSON.stringify(result, null, 1));
s.close(); await closeTab(tab.id);
