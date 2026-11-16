#!/usr/bin/env node
/**
 * The landing page's puzzle still (issue #1680): a picture of one puzzle's
 * start position, taken from the real board, plus the text shown beside it.
 *
 *   npm run puzzles:still -- <puzzleId>
 *
 * A PUBLISH step, run by hand when the puzzle set is published (or the landing
 * puzzle changes). The build never runs it: it needs a browser and an engine.
 *
 * Needs a dev server (`next dev`) pointed at a LOCAL engine that serves puzzle
 * rooms (NEXT_PUBLIC_PRO_WS_URL=ws://localhost:<port>) and a Playwright
 * Chromium. Playwright is NOT a dependency of this repo: pass the module by
 * path, as scripts/pro/puzzleCheck.mjs does. `sharp` is a devDependency.
 *
 *   BASE_URL     default http://localhost:3000
 *   PLAYWRIGHT   module specifier or path (default "playwright-core")
 *
 * It opens /puzzles?p=<puzzleId>, waits for the first position, and writes:
 *
 *   public/puzzles/landing-still.webp   the board, at most 1200 px wide, under 120 KB
 *   public/puzzles/landing-still.json   puzzle id + version, goal line, source
 *                                       line, hero names, the image's size
 *
 * The goal and source lines are read off the panel (the server's words, as the
 * visitor will see them); id, version and hero names come from the room's
 * PUZZLE_INFO. Afterwards set LANDING_PUZZLE in
 * components/LandingPage/landingPuzzle.ts to the same id and version: a test
 * fails while the two disagree.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const puzzleId = process.argv[2];
if (!puzzleId || puzzleId.startsWith("-")) {
  console.error("usage: npm run puzzles:still -- <puzzleId>");
  process.exit(2);
}

const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright-core");
const sharp = require("sharp");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../public/puzzles");
const NAME = "landing-still";
const MAX_WIDTH = 1200; // 600 CSS px at 2x: wider than the landing ever draws it
const MAX_BYTES = 120 * 1024;

/** Runs in the page before anything else: keep the puzzle room's PUZZLE_INFO. */
const spy = () => {
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener("message", (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "PUZZLE_INFO") window.__puzzleInfo = msg;
          if (msg.type === "STATE") window.__puzzleState = true;
        } catch {
          /* not ours */
        }
      });
    }
  };
};

const browser = await chromium.launch();
try {
  // A tall, wide window so the board is drawn large; 2x for a sharp picture.
  // Reduced motion: the pulsing targets and the entry flourishes hold still.
  const context = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await context.addInitScript(spy);
  // Local services only (the account probe and the visit counter).
  await context.route(/api\.unbrewed\.xyz|counter\.dev/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(`${BASE}/puzzles?p=${encodeURIComponent(puzzleId)}`, { waitUntil: "domcontentloaded" });

  const MAP = '[data-testid="pro-game-view"] img[draggable="false"]';
  await page.waitForFunction(
    (sel) => {
      const map = document.querySelector(sel);
      return !!window.__puzzleInfo && !!window.__puzzleState && !!map && map.complete && map.naturalWidth > 0;
    },
    MAP,
    { timeout: 90_000 }
  );
  const info = await page.evaluate(() => window.__puzzleInfo);
  const onTable = await page.locator('[data-testid="puzzle-panel"]').getAttribute("data-puzzle");
  if (info.puzzle.id !== puzzleId || onTable !== puzzleId) {
    throw new Error(`asked for "${puzzleId}" but "${onTable}" is on the table: is the id in this engine's catalogue?`);
  }
  // Every token's art in, then a beat for the board to settle into its fit.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="pro-game-view"] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 30_000 });
  await page.waitForTimeout(2500);

  const goal = (await page.locator('[data-testid="puzzle-goal"]').textContent()).trim();
  const source = (await page.locator('[data-testid="puzzle-source"]').textContent()).trim();
  // The board alone: the map picture (the first picture in the view) and what
  // stands on it. Everything else the view draws near or over the board (the
  // HUD, the face-up hand, the rail) is hidden for the picture.
  await page.evaluate((sel) => {
    const view = document.querySelector('[data-testid="pro-game-view"]');
    const map = view.querySelector(sel);
    const pieces = [...view.querySelectorAll("img")].filter((img) => img !== map && img.closest("[title]"));
    let board = map.parentElement;
    while (board !== view && !pieces.every((img) => board.contains(img))) board = board.parentElement;
    if (board === view) throw new Error("no element holds the map and its pieces: has the board's markup changed?");
    for (let el = board; el !== view; el = el.parentElement) {
      for (const sibling of el.parentElement.children) if (sibling !== el) sibling.style.visibility = "hidden";
    }
  }, MAP);
  await page.waitForTimeout(300);
  const clip = await page.locator(MAP).first().boundingBox();
  const png = await page.screenshot({ clip, type: "png" });

  // Largest quality that fits the budget.
  let webp = null;
  let quality = 82;
  for (; quality >= 40; quality -= 6) {
    webp = await sharp(png).resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality, effort: 6 }).toBuffer();
    if (webp.length <= MAX_BYTES) break;
  }
  if (!webp || webp.length > MAX_BYTES) throw new Error(`the still does not fit ${MAX_BYTES} bytes even at quality ${quality + 6}`);
  const meta = await sharp(webp).metadata();

  const still = {
    puzzleId: info.puzzle.id,
    version: info.puzzle.version,
    goal,
    source,
    heroes: { solver: info.puzzle.heroes.solver.name, enemy: info.puzzle.heroes.enemy.name },
    image: { src: `/puzzles/${NAME}.webp`, width: meta.width, height: meta.height },
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/${NAME}.webp`, webp);
  writeFileSync(`${OUT_DIR}/${NAME}.json`, `${JSON.stringify(still, null, 2)}\n`);
  console.log(`${NAME}.webp  ${meta.width}×${meta.height}  ${(webp.length / 1024).toFixed(1)} KB  (quality ${quality})`);
  console.log(`${NAME}.json  ${still.puzzleId} v${still.version}: "${still.goal}" / "${still.source}"`);
  console.log(`Now set LANDING_PUZZLE in components/LandingPage/landingPuzzle.ts to { id: "${still.puzzleId}", version: ${still.version} }.`);
} finally {
  await browser.close();
}
