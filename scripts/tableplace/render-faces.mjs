#!/usr/bin/env node
/**
 * Finished card faces for the balanced (evergreen) decks — issue #1007.
 *
 * table.place needs one finished image per card face; an unbrewed card's
 * `imageUrl` is only its art. This renders every card in
 * public/evergreen-decks/*.json through the sandbox's own card components in
 * headless Chromium (so external art loads and text is measured with the real
 * fonts), and writes
 *
 *   <out>/<deckDir>/<key>.webp     one face per action card, hero, sidekick,
 *                                  rule card and extra character
 *   <out>/index.json               deck id -> key -> { path, hash }
 *
 * Keys and hashes come from lib/tableplace/faces.ts, bundled into the render
 * page, so the resolver the converter uses can never disagree with this.
 *
 * Generated in the Pages workflow after `next export`; never committed.
 *
 * Usage:
 *   PW_PATH=<dir of a playwright or playwright-core install> \
 *     node scripts/tableplace/render-faces.mjs [--out out/tableplace-faces]
 *       [--scale 8] [--layout-width 200] [--quality 82] [--only hollow-oak,DOPE] [--jobs 4]
 *
 * CHROME_PATH points playwright at an existing Chrome (the Pages runner ships
 * one) instead of a playwright-downloaded Chromium.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const OUT = path.resolve(ROOT, arg("out", "out/tableplace-faces"));
/** Card units are 63x88; scale 8 = 504x704 px, readable in the hand tray. */
const SCALE = Number(arg("scale", "8"));
/**
 * CSS width the card is LAID OUT at; the device scale factor then takes it to
 * the output size. Chrome rounds glyph advances at the CSS font size, so the
 * same card set 143 px wide (the hand) and 504 px wide has visibly different
 * word spacing. 200 is the /bag deck grid's card width
 * (components/Bag/Deck/DeckCards.tsx), so a face is that sandbox render, only
 * sharper — verified by a side-by-side crop in PR #1007's body.
 */
const LAYOUT_W = Number(arg("layout-width", "200"));
const QUALITY = Number(arg("quality", "82"));
const JOBS = Number(arg("jobs", "4"));
const ONLY = arg("only", "")?.split(",").filter(Boolean) ?? [];
const W = 63 * SCALE;
const H = 88 * SCALE;
const DSF = W / LAYOUT_W;
const CSS_H = H / DSF;

const loadPlaywright = () => {
  const tries = [process.env.PW_PATH, "playwright", "playwright-core"].filter(Boolean);
  for (const t of tries) {
    try {
      return require(t);
    } catch {}
  }
  console.error(
    "No playwright found. Set PW_PATH to a playwright(-core) install, e.g.\n" +
      "  PW_PATH=~/.npm/_npx/<hash>/node_modules/playwright node scripts/tableplace/render-faces.mjs",
  );
  process.exit(2);
};

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".otf": "font/otf",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".css": "text/css",
  ".json": "application/json",
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/__styles/fonts.css">
<link rel="stylesheet" href="/__styles/globals.css">
<style>html,body{margin:0;background:transparent}
/* Chakra's CSS reset, which every sandbox page carries: it changes kerning. */
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"kern"}
#stage{width:${LAYOUT_W}px;height:${CSS_H}px;overflow:hidden}</style>
</head><body><div id="stage"></div><script src="/__faces.js"></script></body></html>`;

/** A file under public/ for a site path, or null. */
const publicFile = (urlPath) => {
  const file = path.join(ROOT, "public", decodeURIComponent(urlPath));
  if (!file.startsWith(path.join(ROOT, "public"))) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
};

const bundle = async () => {
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, "scripts/tableplace/faceEntry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  return result.outputFiles[0].contents;
};

const serve = (js) =>
  new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      const send = (type, body) => {
        res.writeHead(200, { "content-type": type });
        res.end(body);
      };
      if (url.pathname === "/") return send("text/html", PAGE);
      if (url.pathname === "/__faces.js") return send("text/javascript", js);
      if (url.pathname.startsWith("/__styles/")) {
        const name = path.basename(url.pathname);
        return send("text/css", fs.readFileSync(path.join(ROOT, "styles", name)));
      }
      const file = publicFile(url.pathname);
      if (!file) {
        res.writeHead(404);
        return res.end();
      }
      send(MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream", fs.readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });

const deckFiles = () =>
  fs
    .readdirSync(path.join(ROOT, "public/evergreen-decks"))
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .sort()
    .map((f) => ({
      dir: f.replace(/\.json$/, ""),
      deck: JSON.parse(fs.readFileSync(path.join(ROOT, "public/evergreen-decks", f), "utf8")),
    }))
    .filter(({ dir, deck }) => !ONLY.length || ONLY.includes(dir) || ONLY.includes(deck.id));

const main = async () => {
  const started = Date.now();
  const pw = loadPlaywright();
  const server = await serve(await bundle());
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await pw.chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const context = await browser.newContext({
    viewport: { width: Math.ceil(LAYOUT_W), height: Math.ceil(CSS_H) },
    deviceScaleFactor: DSF,
  });
  // Snapshot art is referenced both as /evergreen-decks/… and as
  // https://unbrewed.xyz/evergreen-decks/…; serve the latter from the checkout
  // too, so a build renders what it ships rather than what's live.
  await context.route("https://unbrewed.xyz/**", (route) => {
    const file = publicFile(new URL(route.request().url()).pathname);
    if (!file) return route.continue();
    return route.fulfill({
      path: file,
      contentType: MIME[path.extname(file).toLowerCase()],
    });
  });

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const decks = deckFiles();
  const pages = await Promise.all(
    Array.from({ length: Math.max(1, JOBS) }, async () => {
      const page = await context.newPage();
      page.on("pageerror", (e) => console.error("page error:", e.message));
      await page.goto(base);
      await page.waitForFunction(() => !!window.__faces);
      return page;
    }),
  );

  const index = { version: 1, decks: {} };
  const failed = [];
  let faces = 0;
  let bytes = 0;

  const queue = [];
  for (const { dir, deck } of decks) {
    const jobs = await pages[0].evaluate((d) => window.__faces.jobs(d), deck);
    const entries = {};
    index.decks[deck.id] = entries;
    if (dir !== deck.id) index.decks[dir] = entries;
    fs.mkdirSync(path.join(OUT, dir), { recursive: true });
    for (const job of jobs) queue.push({ dir, deck, job, entries });
  }

  await Promise.all(
    pages.map(async (page) => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const { dir, deck, job, entries } = item;
        const res = await page.evaluate(([j, d]) => window.__faces.render(j, d), [job, deck]);
        for (const url of res.failed) failed.push(`${dir}/${job.key}: ${url}`);
        const png = await page.locator("#stage").screenshot({ omitBackground: true, type: "png" });
        // The element clip can land a device pixel over at a fractional DSF;
        // everything past W x H is the transparent page.
        const webp = await sharp(png)
          .extract({ left: 0, top: 0, width: W, height: H })
          .webp({ quality: QUALITY, alphaQuality: 90, effort: 5 }).toBuffer();
        const rel = `${dir}/${job.key}.webp`;
        fs.writeFileSync(path.join(OUT, rel), webp);
        entries[job.key] = { path: rel, hash: job.hash };
        faces++;
        bytes += webp.length;
      }
    }),
  );

  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index));
  await browser.close();
  server.close();

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `tableplace faces: ${faces} faces from ${decks.length} decks, ${W}x${H}px, ` +
      `${(bytes / 1024 / 1024).toFixed(2)} MB total, ${kb(bytes / Math.max(1, faces))} avg, ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s -> ${path.relative(ROOT, OUT)}`,
  );
  if (failed.length) {
    // Not fatal: a dead art link still renders the frame and text, exactly
    // as the sandbox does. Listed so a broken snapshot doesn't go unnoticed.
    console.warn(`${failed.length} art image(s) failed to load:\n  ${failed.join("\n  ")}`);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
