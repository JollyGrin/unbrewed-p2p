// Build-output check (#1303): every Adventure component must ship in a lazy chunk, never in
// /pro/game's initial bundle. Run after `next build`: `node scripts/adventure-chunk-check.mjs`.
import fs from "fs"; import path from "path";
const root = process.argv[2] ?? "."; const next = path.join(root, ".next");
const manifest = JSON.parse(fs.readFileSync(path.join(next, "build-manifest.json"), "utf8"));
const initial = new Set([...(manifest.pages["/pro/game"] ?? []), ...(manifest.pages["/_app"] ?? [])]);
const MARKERS = {
  AdventureBoard: "adventure-board-scroll",
  AdventureEndScreen: "adventure-end-screen",
  AdventureLobby: "adventure-scenario-name",
  LobbyBriefing: "adventure-lobby-briefing",
  AdventureWaitingRoom: "adventure-waiting-roster",
  BreakoutMoment: "breakout-moment",
  EnemyTurnCard: "adv-enemy-turn-title",
};
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } };
walk(path.join(next, "static", "chunks"));
let bad = 0;
for (const [name, marker] of Object.entries(MARKERS)) {
  const hits = files.filter((f) => fs.readFileSync(f, "utf8").includes(marker)).map((f) => path.relative(next, f).replace(/^static\//, "static/"));
  const inInitial = hits.filter((h) => initial.has(h));
  if (inInitial.length || !hits.length) bad++;
  console.log(`${name.padEnd(22)} ${hits.length ? hits.join(", ") : "NOT FOUND"}${inInitial.length ? "  <-- IN /pro/game INITIAL BUNDLE" : ""}`);
}
console.log(`/pro/game initial chunks: ${initial.size}; ${bad ? "FAIL" : "OK: every adventure component is in a lazy chunk"}`);
process.exit(bad ? 1 : 0);
