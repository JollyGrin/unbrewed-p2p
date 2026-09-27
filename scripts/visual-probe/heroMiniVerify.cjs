/**
 * Hero-mini verify (unbrewed-p2p-965, STANDARD.md §5.4) — crops of a hero's
 * mini on the tabletop, for the canonical id AND one alias, in each figure
 * style (3D minis / Minis / Tokens). Not a test; it prints JSON and writes
 * crops. Reuses scripts/visual-probe/tableMini3d.cjs's launch/reference-space
 * patterns rather than inventing a new harness. Needs a DEV server.
 *
 *   PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright PROBE_URL=http://localhost:3107 \
 *     node scripts/visual-probe/heroMiniVerify.cjs <canonicalId> <aliasId> [heroName] [--out dir]
 *
 * `heroName` is the deck picker's display name (default: title-cased
 * canonicalId, e.g. "King Taranis"). The canonical id is only offered
 * server-side behind `?debug` (a "reflavored" tier, unbrewed-p2p memory
 * "Spice deck language & visibility"); the alias is the default pick. Under
 * `?debug` BOTH tiles share that same accessible name and the alias is
 * inserted first (top-decks.ts), so this script picks `.first()` for the
 * alias (no `?debug`) and `.last()` for the canonical id (`?debug=1`).
 *
 * "My" fighter (always seat p1 in a PLAY VS AI game) is found by sniffing the
 * live WS state frame for a HERO fighter owned by p1 and reading its space —
 * there is no heroId-bearing DOM attribute to query directly (same technique
 * as the "sandbox two-player dup check" probe: read ownership off the wire,
 * not off the DOM).
 *
 * Env: PROBE_ARGS = extra Chromium flags (see tableMini3d.cjs). PROBE_HEADED=1
 * shows the browser.
 */
const path = require("path");
const fs = require("fs");
const os = require("os");

const pw = require(process.env.PW_PATH);
const BASE = process.env.PROBE_URL || "http://localhost:3107";
const MAP = process.env.PROBE_MAP || "Secluded Temple";

const [canonicalId, aliasId, heroNameArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : path.join(os.tmpdir(), "hero-mini-verify");
if (!canonicalId || !aliasId) {
  console.error("usage: node scripts/visual-probe/heroMiniVerify.cjs <canonicalId> <aliasId> [heroName] [--out dir]");
  process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

const titleCase = (id) => id.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const HERO_NAME = heroNameArg || titleCase(canonicalId);

/** figureStyle value -> the crop file's style label. */
const STYLES = [
  ["3d", "3d-minis"],
  ["open", "minis"],
  ["token", "tokens"],
];

const launch = async (figureStyle) => {
  const browser = await pw.chromium.launch({ headless: !process.env.PROBE_HEADED, args: (process.env.PROBE_ARGS || "").split(" ").filter(Boolean) });
  const ctx = await browser.newContext({ ...pw.devices["iPhone 14 landscape"] });
  await ctx.addInitScript((style) => {
    try {
      localStorage.setItem("pro-board-view", "table");
      localStorage.setItem("pro-figure-style", style);
    } catch {}
  }, figureStyle);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  return { browser, page };
};

/** Sniffs the live WS traffic for p1's HERO fighter and its current space. */
const trackMySpace = (page) => {
  const state = { space: null };
  page.on("websocket", (ws) =>
    ws.on("framereceived", (f) => {
      const text = String(f.payload);
      if (!text.includes('"fighters"')) return;
      try {
        const msg = JSON.parse(text);
        const fighters = msg.fighters ?? msg.view?.fighters ?? msg.state?.fighters;
        if (!Array.isArray(fighters)) return;
        const mine = fighters.find((x) => x?.owner === "p1" && x?.kind === "HERO" && x?.space);
        if (mine) state.space = mine.space;
      } catch {}
    })
  );
  return state;
};

/** Lobby → chosen hero vs AI on one fixed map → tabletop, view reset. */
const startGame = async (page, { debug }) => {
  const query = debug ? "?debug=1" : "";
  await page.goto(`${BASE}/pro/game${query}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(5000);
  // Warm the manifest fetches (Next dev compiles routes on demand, which can
  // otherwise race effectiveFigureStyle's fallback past the intended style).
  await page
    .evaluate(() =>
      Promise.all([
        fetch("/figures-open/manifest.json").catch(() => {}),
        fetch("/minis3d/manifest.json").catch(() => {}),
      ])
    )
    .catch(() => {});
  await page.getByRole("button", { name: "AI·E", exact: true }).tap();
  const heroBtn = page.getByRole("button", { name: new RegExp(`^${HERO_NAME} by`) });
  await (debug ? heroBtn.last() : heroBtn.first()).tap();
  const stage = page.getByRole("button", { name: MAP, exact: true });
  if (!(await stage.count())) {
    const more = page.getByRole("button", { name: /^All \d+ boards$/ });
    if (await more.count()) await more.first().tap();
  }
  await stage.first().tap();
  await page.getByRole("button", { name: "PLAY VS AI" }).tap();
  await page.waitForSelector("[data-table-stage-plane]", { timeout: 60000 });
  await page.waitForTimeout(4000);
  const keep = page.getByRole("button", { name: /keep your opening hand/i });
  if (await keep.count()) await keep.first().tap().catch(() => {});
  await page.waitForTimeout(1500);
  const reset = page.getByRole("button", { name: /reset view/i });
  if (await reset.count()) await reset.first().evaluate((el) => el.click());
  await page.waitForTimeout(3000);
};

const cropMyFighter = async (page, spaceId, file) => {
  const box = await page.evaluate((id) => {
    const el = document.querySelector(`[data-fighter-base][data-space-id="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, spaceId);
  if (!box) throw new Error(`no [data-fighter-base] for space ${spaceId}`);
  const clip = {
    x: Math.max(0, box.x - box.w * 1.5),
    y: Math.max(0, box.y - box.w * 3.2),
    width: box.w * 4,
    height: box.w * 3.2 + box.h * 1.6,
  };
  await page.screenshot({ path: file, clip });
};

module.exports = async () => {
  const cases = [
    { id: aliasId, debug: false },
    { id: canonicalId, debug: true },
  ];
  const written = [];
  for (const [figureStyle, styleLabel] of STYLES) {
    for (const c of cases) {
      const { browser, page } = await launch(figureStyle);
      const mySpace = trackMySpace(page);
      await startGame(page, c);
      // A late STATE frame can arrive after the initial wait.
      for (let i = 0; i < 20 && !mySpace.space; i++) await page.waitForTimeout(300);
      if (!mySpace.space) {
        console.error(`${c.id}/${styleLabel}: never saw p1's hero space on the wire — skipped`);
        await browser.close();
        continue;
      }
      const file = path.join(OUT, `${c.id}-${styleLabel}.png`);
      await cropMyFighter(page, mySpace.space, file);
      written.push(file);
      console.log(`wrote ${file}`);
      await browser.close();
    }
  }
  console.log(JSON.stringify({ out: OUT, written }, null, 2));
};

if (require.main === module) {
  module.exports().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
