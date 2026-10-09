#!/usr/bin/env node
/**
 * D1 prototype (#1045): render ONE unmatched.cards card face server-side,
 * without Chromium — the shape `POST /tableplace/faces` would run on Railway.
 *
 *   1. fetch the deck from unmatched.cards itself (never from the client)
 *   2. lay the card out with the sandbox's own CardSvg / calculateProps,
 *      measuring text on a Skia canvas (@napi-rs/canvas) with the card fonts
 *   3. rasterise the SVG with resvg (Rust, no browser), art fetched server-side
 *   4. encode 504x704 webp (the size the #1007 build script shipped)
 *
 * Usage (from this folder, after `npm install` here and in the repo root):
 *   node render.mjs --deck DOPE --card AMBUSH [--out out]
 *   node render.mjs --deck DOPE --key hero        # any faceJobs key
 *   node render.mjs --deck DOPE --card AMBUSH --measure exact
 *   node render.mjs --deck DOPE --all             # every face, timed
 *
 * --measure picks how layout measures text (see the design doc, "Fidelity"):
 *   chrome-linux  (default) whole-pixel glyph advances, which is what Chrome's
 *                 canvas returns on Linux at the card's 3-6px sizes — matches
 *                 the #1007 headless-Chromium renders line for line
 *   exact         Skia's fractional advances (fuller lines)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import sharp from "sharp";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { Resvg } from "@resvg/resvg-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const DECK = arg("deck", "DOPE");
const MEASURE = arg("measure", "chrome-linux");
const OUT = path.resolve(HERE, arg("out", "out"));
const W = 504;
const H = 704;

/** CSS family (styles/fonts.css) -> file, and the family name inside it. */
const FONTS = {
  BebasNeueRegular: { file: "BebasNeueRegular.otf", family: "Bebas Neue" },
  ArchivoNarrow: { file: "ArchivoNarrow-Regular.otf", family: "Archivo Narrow" },
  LeagueGothic: { file: "LeagueGothic-Regular.otf", family: "League Gothic" },
};
const fontPath = (f) => path.join(ROOT, "public/fonts", f.file);

const t0 = performance.now();
const lap = (label, since) =>
  console.log(`  ${label.padEnd(22)} ${(performance.now() - since).toFixed(0)} ms`);

/** The components, bundled for Node. esbuild picks up the root tsconfig paths. */
export const loadEntry = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, ".serverEntry.mjs");
  await esbuild.build({
    entryPoints: [path.join(HERE, "serverEntry.tsx")],
    bundle: true,
    outfile: out,
    format: "esm",
    platform: "node",
    jsx: "automatic",
    // React is CJS with dynamic requires; let Node load it natively.
    external: ["react", "react-dom", "react/*", "react-dom/*"],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "warning",
  });
  return import(out);
};

/**
 * measureText on Skia with the card fonts under their CSS names. Chrome's
 * canvas on Linux rounds every glyph advance to a whole pixel at these tiny
 * sizes (3.3px body text measures ~24% wider than the font's metrics), and the
 * sandbox wraps on those numbers — so `chrome-linux` sums rounded per-glyph
 * advances, which reproduces Chrome's widths exactly at the card's sizes.
 */
export const measureCanvas = (mode = MEASURE) => {
  for (const [css, f] of Object.entries(FONTS))
    GlobalFonts.registerFromPath(fontPath(f), css);
  const skia = createCanvas(1, 1).getContext("2d");
  if (mode === "exact") return { getContext: () => skia };
  const advance = new Map();
  const ctx = {
    set font(f) {
      skia.font = f;
    },
    get font() {
      return skia.font;
    },
    measureText(text) {
      let width = 0;
      // Canvas text preparation: ASCII whitespace measures as a space
      // (a "KONG\n" character name is one pixel wider than "KONG").
      for (const ch of text.replace(/[\t\n\f\r]/g, " ")) {
        const key = `${skia.font}|${ch}`;
        if (!advance.has(key)) advance.set(key, Math.round(skia.measureText(ch).width));
        width += advance.get(key);
      }
      return { width };
    },
  };
  return { getContext: () => ctx };
};

/** `.attack{fill:…}` and friends, lifted from the sandbox's global sheet. */
const cardTypeCss = () =>
  (fs.readFileSync(path.join(ROOT, "styles/globals.css"), "utf8").match(
    /\.(attack|defence|versatile|scheme)\s*\{[^}]*\}/g,
  ) ?? []).join("");

/** Server-side fetch of the deck: the client only ever sends an id. */
export const fetchDeck = async (id) => {
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(id)) throw new Error(`bad deck id ${id}`);
  const res = await fetch(`https://unmatched.cards/api/decks/${id}`, {
    headers: { accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`unmatched.cards ${res.status} for ${id}`);
  return res.json();
};

/** The SVG-unit box an <image> is drawn into, by its href. */
const imageBox = (svg, href) => {
  for (const tag of svg.match(/<image\b[^>]*>/g) ?? []) {
    if (!tag.includes(`href="${href.replaceAll("&", "&amp;")}"`)) continue;
    const num = (a) => Number(tag.match(new RegExp(`\\b${a}="([\\d.]+)"`))?.[1]);
    return { w: num("width"), h: num("height") };
  }
  return null;
};

/**
 * Art pre-scaled with sharp (lanczos3, cover, centred — the same framing as
 * `xMidYMid slice` and the sandbox's CSS `cover`) to exactly the pixels it
 * fills, so resvg draws it 1:1 instead of resampling it itself. Also caps
 * what an oversized upload costs to decode downstream.
 */
const presize = async (buf, box) => {
  if (!box || !box.w || !box.h) return buf;
  const px = W / 63;
  try {
    return await sharp(buf)
      .resize(Math.round(box.w * px), Math.round(box.h * px), {
        fit: "cover",
        position: "centre",
        kernel: "lanczos3",
      })
      .png()
      .toBuffer();
  } catch {
    return buf;
  }
};

const fetchImage = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
};

/**
 * One face -> { svg, png, webp }. `art` memoises fetched art by url, the way
 * a deck render would: most of a deck's cards share a handful of images.
 */
export const renderFace = async (entry, job, deck, canvas, art = new Map(), laps = false) => {
  let t = performance.now();
  let svg = entry.faceSvg(job, deck, canvas, W, H);
  // The card-type colours (canton, boost circle) are CSS classes in
  // styles/globals.css, not SVG attributes: carry those rules into the file.
  svg = svg.replace(/(<svg[^>]*>)/, `$1<style>${cardTypeCss()}</style>`);
  // resvg matches a font by the family INSIDE the file, not the @font-face
  // alias the components style with.
  for (const [css, f] of Object.entries(FONTS))
    svg = svg.replaceAll(`font-family:${css}`, `font-family:'${f.family}'`);
  // Deck art urls arrive with stray whitespace (" https://i.imgur.com/…");
  // a browser's URL parser strips it, resvg treats the href as unloadable.
  svg = svg.replace(/href="\s*([^"]*?)\s*"/g, 'href="$1"');
  if (laps) lap("layout + svg", t);

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: W },
    font: {
      fontFiles: Object.values(FONTS).map(fontPath),
      loadSystemFonts: false,
      defaultFontFamily: "Archivo Narrow",
    },
    shapeRendering: 2,
    textRendering: 1,
    imageRendering: 0,
  });
  t = performance.now();
  const hrefs = resvg.imagesToResolve();
  const failed = [];
  for (const href of hrefs) {
    if (!art.has(href)) art.set(href, fetchImage(href));
    const buf = await art.get(href);
    if (buf) resvg.resolveImage(href, await presize(buf, imageBox(svg, href)));
    else failed.push(href);
  }
  if (laps) lap(`fetch art (${hrefs.length})`, t);

  t = performance.now();
  const png = await sharp(resvg.render().asPng()).resize(W, H, { fit: "fill" }).png().toBuffer();
  if (laps) lap("rasterise (resvg)", t);
  t = performance.now();
  const webp = await sharp(png).webp({ quality: 82, alphaQuality: 90, effort: 5 }).toBuffer();
  if (laps) lap("encode webp", t);
  return { svg, png, webp, failed };
};

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let t = performance.now();
  const entry = await loadEntry();
  lap("bundle components", t);

  t = performance.now();
  const deck = await fetchDeck(DECK);
  lap("fetch deck", t);

  const jobs = entry.faceJobs(deck);
  const canvas = measureCanvas();

  if (process.argv.includes("--all")) {
    // The whole deck, as `POST /tableplace/faces` would: art fetched once
    // per url, faces rendered one after another on one core.
    t = performance.now();
    // Every art url up front, in parallel: fetching is most of a deck's time.
    const art = new Map();
    for (const job of jobs) {
      const url = (job.kind === "card" ? job.card.imageUrl : entry.characterArt(job, deck))?.trim();
      if (url && !art.has(url)) art.set(url, fetchImage(url));
    }
    let bytes = 0;
    const failed = new Set();
    fs.mkdirSync(path.join(OUT, DECK), { recursive: true });
    for (const job of jobs) {
      const face = await renderFace(entry, job, deck, canvas, art);
      fs.writeFileSync(path.join(OUT, DECK, `${job.key}.${job.hash}.webp`), face.webp);
      bytes += face.webp.length;
      face.failed.forEach((u) => failed.add(u));
    }
    const ms = performance.now() - t;
    console.log(
      `${DECK}: ${jobs.length} faces, ${art.size} art urls, ${(bytes / 1024).toFixed(0)} KB ` +
        `(${(bytes / 1024 / jobs.length).toFixed(1)} KB avg), ${ms.toFixed(0)} ms ` +
        `(${(ms / jobs.length).toFixed(0)} ms/face) -> ${path.relative(ROOT, path.join(OUT, DECK))}/`,
    );
    if (failed.size) console.warn(`art failed to load: ${[...failed].join(", ")}`);
    return;
  }

  const want = arg("key") ?? `card-${(arg("card", "AMBUSH")).toLowerCase()}`;
  const job = jobs.find((j) => j.key === want);
  if (!job) {
    console.error(`no face ${want}; have: ${jobs.map((j) => j.key).join(", ")}`);
    process.exit(2);
  }
  const face = await renderFace(entry, job, deck, canvas, new Map(), true);
  const base = path.join(OUT, `${DECK}-${job.key}.server-${MEASURE}`);
  fs.writeFileSync(`${base}.svg`, face.svg);
  fs.writeFileSync(`${base}.png`, face.png);
  fs.writeFileSync(`${base}.webp`, face.webp);
  fs.writeFileSync(
    `${base}.layout.json`,
    JSON.stringify(entry.faceLayout(job, canvas), null, 1),
  );
  console.log(
    `${DECK}/${job.key} hash ${job.hash}: ${W}x${H} webp ${(face.webp.length / 1024).toFixed(1)} KB, ` +
      `total ${(performance.now() - t0).toFixed(0)} ms -> ${path.relative(ROOT, base)}.webp`,
  );
  if (face.failed.length) console.warn(`art failed to load: ${face.failed.join(", ")}`);
};

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
