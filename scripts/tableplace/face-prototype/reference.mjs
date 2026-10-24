#!/usr/bin/env node
/**
 * Ground truth for the D1 prototype (#1045): the same card through the
 * sandbox's real `Card` component in headless Chromium, exactly as the removed
 * #1007 build script did (laid out 200 CSS px wide — the /bag deck grid's card
 * width — then device-scaled to 504x704). Dev-box only; this is what the
 * server path must match, not something that runs on Railway.
 *
 *   PW_PATH=<playwright install> node reference.mjs --deck DOPE --card AMBUSH
 *
 * --validate DOPE,lDOM,…  instead lays out EVERY face of each deck in Chrome
 * and in Node (render.mjs's measurer) and reports any face whose layout —
 * wraps, panel heights, canton shift, body size — differs.
 */
import { createRequire } from "node:module";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const require = createRequire(import.meta.url);
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const DECK = arg("deck", "DOPE");
const OUT = path.resolve(HERE, arg("out", "out"));
const W = 504;
const H = 704;
const LAYOUT_W = 200;
const DSF = W / LAYOUT_W;
const CSS_H = H / DSF;

const pw = (() => {
  for (const t of [process.env.PW_PATH, "playwright", "playwright-core"].filter(Boolean)) {
    try {
      return require(t);
    } catch {}
  }
  console.error("No playwright found; set PW_PATH.");
  process.exit(2);
})();

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="/__styles/fonts.css">
<link rel="stylesheet" href="/__styles/globals.css">
<style>html,body{margin:0;background:transparent}
html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"kern"}
#stage{width:${LAYOUT_W}px;height:${CSS_H}px;overflow:hidden}</style>
</head><body><div id="stage"></div><script src="/__ref.js"></script></body></html>`;

const validate = async (page, ids) => {
  const server = await import("./render.mjs");
  const entry = await server.loadEntry();
  const results = {};
  for (const mode of ["chrome-linux", "exact"]) results[mode] = { same: 0, differ: [] };
  let faces = 0;
  for (const id of ids) {
    let deck;
    try {
      deck = await server.fetchDeck(id);
    } catch (e) {
      console.warn(`skip ${id}: ${e.message}`);
      continue;
    }
    const chrome = await page.evaluate((d) => window.__ref.layouts(d), deck);
    for (const mode of Object.keys(results)) {
      const node = JSON.parse(JSON.stringify(entry.layoutsOf(deck, server.measureCanvas(mode))));
      for (const key of Object.keys(chrome)) {
        if (JSON.stringify(chrome[key]) === JSON.stringify(node[key])) results[mode].same++;
        else {
          results[mode].differ.push(`${id}/${key}`);
          if (process.env.SHOW_DIFF && mode === "chrome-linux")
            for (const f of Object.keys(chrome[key]))
              if (JSON.stringify(chrome[key][f]) !== JSON.stringify(node[key][f]))
                console.log(`  ${id}/${key}.${f}: chrome ${JSON.stringify(chrome[key][f])} node ${JSON.stringify(node[key][f])}`);
        }
      }
    }
    faces += Object.keys(chrome).length;
  }
  console.log(`${faces} faces across ${ids.length} decks, layout vs sandbox Chrome (Linux):`);
  for (const [mode, r] of Object.entries(results))
    console.log(
      `  ${mode.padEnd(13)} identical ${r.same}/${faces}` +
        (r.differ.length ? `; differ: ${r.differ.slice(0, 12).join(", ")}${r.differ.length > 12 ? " …" : ""}` : ""),
    );
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const js = (
    await esbuild.build({
      entryPoints: [path.join(HERE, "referenceEntry.tsx")],
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "warning",
    })
  ).outputFiles[0].contents;
  const server = await new Promise((resolve) => {
    const s = createServer((req, res) => {
      const p = new URL(req.url, "http://x").pathname;
      const send = (type, body) => {
        res.writeHead(200, { "content-type": type });
        res.end(body);
      };
      if (p === "/") return send("text/html", PAGE);
      if (p === "/__ref.js") return send("text/javascript", js);
      if (p.startsWith("/__styles/"))
        return send("text/css", fs.readFileSync(path.join(ROOT, "styles", path.basename(p))));
      if (p.startsWith("/fonts/"))
        return send("font/otf", fs.readFileSync(path.join(ROOT, "public/fonts", path.basename(p))));
      res.writeHead(404);
      res.end();
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });

  const deck = await (await fetch(`https://unmatched.cards/api/decks/${DECK}`)).json();
  const browser = await pw.chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  try {
    const page = await (
      await browser.newContext({
        viewport: { width: LAYOUT_W, height: Math.ceil(CSS_H) },
        deviceScaleFactor: DSF,
      })
    ).newPage();
    page.on("pageerror", (e) => console.error("page error:", e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!window.__ref);
    if (arg("validate")) return await validate(page, arg("validate").split(","));
    const jobs = await page.evaluate((d) => window.__ref.jobs(d), deck);
    const want = arg("key") ?? `card-${arg("card", "AMBUSH").toLowerCase()}`;
    const job = jobs.find((j) => j.key === want);
    if (!job) throw new Error(`no face ${want}`);
    const layout = await page.evaluate((j) => window.__ref.render(j), job);
    const shot = await page.locator("#stage").screenshot({ omitBackground: true, type: "png" });
    const base = path.join(OUT, `${DECK}-${job.key}.sandbox`);
    const png = sharp(shot).extract({ left: 0, top: 0, width: W, height: H });
    fs.writeFileSync(`${base}.png`, await png.clone().png().toBuffer());
    fs.writeFileSync(
      `${base}.webp`,
      await png.webp({ quality: 82, alphaQuality: 90, effort: 5 }).toBuffer(),
    );
    fs.writeFileSync(`${base}.layout.json`, JSON.stringify(layout, null, 1));
    console.log(`sandbox reference -> ${path.relative(ROOT, base)}.png`);
  } finally {
    await browser.close();
    server.close();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
