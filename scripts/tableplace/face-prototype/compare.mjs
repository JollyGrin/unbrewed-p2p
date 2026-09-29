#!/usr/bin/env node
/**
 * Pixel comparison for the D1 prototype (#1045): the server render against the
 * sandbox reference, both 504x704. Writes a side-by-side, zoomed crops of the
 * text panel and canton, and a diff heatmap; prints the numbers.
 *
 *   node compare.mjs out/DOPE-card-ambush.sandbox.png out/DOPE-card-ambush.server-chrome-linux.png
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [refPath, candPath] = process.argv.slice(2);
if (!candPath) {
  console.error("usage: node compare.mjs <sandbox.png> <server.png>");
  process.exit(2);
}
const W = 504;
const H = 704;
/** Composited on white; sharp allows one resize per pipeline, so materialise. */
const flatten = (p) =>
  sharp(p).flatten({ background: "#ffffff" }).resize(W, H, { fit: "fill" }).removeAlpha().png().toBuffer();
const refPng = await flatten(refPath);
const candPng = await flatten(candPath);
const raw = async (png) => (await sharp(png).raw().toBuffer({ resolveWithObject: true })).data;

const ref = await raw(refPng);
const cand = await raw(candPng);
/**
 * The art window (card units -> px, 8 px per unit), from the layout the
 * server wrote beside its render. Art is resampled by two different scalers
 * (Chrome's CSS `cover` vs resvg's `slice`), so it is scored apart from the
 * frame and text — the part the renderer actually draws.
 */
const layoutPath = candPath.replace(/\.png$/, ".layout.json");
const layout = fs.existsSync(layoutPath) ? JSON.parse(fs.readFileSync(layoutPath, "utf8")) : null;
const art = layout
  ? { x0: 3 * 8, y0: 3 * 8, x1: (3 + layout.topPanelWidth) * 8, y1: (3 + layout.topPanelHeight) * 8 }
  : null;
const inArt = (i) => {
  if (!art) return false;
  const x = i % W;
  const y = Math.floor(i / W);
  // the canton sits over the art's left edge; it is frame, not art
  return x >= art.x0 + 10 * 8 && x < art.x1 && y >= art.y0 && y < art.y1;
};
const heat = Buffer.alloc(W * H * 3);
const score = { art: [0, 0, 0, 0], frame: [0, 0, 0, 0] };
let sum = 0;
let over16 = 0;
let over64 = 0;
for (let i = 0; i < W * H; i++) {
  const d = Math.max(
    Math.abs(ref[i * 3] - cand[i * 3]),
    Math.abs(ref[i * 3 + 1] - cand[i * 3 + 1]),
    Math.abs(ref[i * 3 + 2] - cand[i * 3 + 2]),
  );
  sum += d;
  if (d > 16) over16++;
  if (d > 64) over64++;
  const s = score[inArt(i) ? "art" : "frame"];
  s[0] += d;
  s[1]++;
  if (d > 16) s[2]++;
  if (d > 64) s[3]++;
  const v = Math.min(255, d * 4);
  heat[i * 3] = 255;
  heat[i * 3 + 1] = 255 - v;
  heat[i * 3 + 2] = 255 - v;
}
const pct = (n) => `${((100 * n) / (W * H)).toFixed(2)}%`;
console.log(
  `whole card: mean |Δ| ${(sum / (W * H)).toFixed(2)}/255, pixels Δ>16: ${pct(over16)}, Δ>64: ${pct(over64)}`,
);
for (const [name, [d, n, o16, o64]] of Object.entries(score))
  if (n)
    console.log(
      `${`${name}:`.padEnd(11)} mean |Δ| ${(d / n).toFixed(2)}/255, pixels Δ>16: ${((100 * o16) / n).toFixed(2)}%, Δ>64: ${((100 * o64) / n).toFixed(2)}%`,
    );

const base = candPath.replace(/\.png$/, "");
const gap = 12;
const pair = async (region, scale, file) => {
  const crop = (png) =>
    sharp(png)
      .extract(region)
      .resize(region.width * scale, region.height * scale, { kernel: "nearest" })
      .png()
      .toBuffer();
  const w = region.width * scale;
  const h = region.height * scale;
  await sharp({ create: { width: w * 2 + gap, height: h, channels: 3, background: "#888" } })
    .composite([
      { input: await crop(refPng), left: 0, top: 0 },
      { input: await crop(candPng), left: w + gap, top: 0 },
    ])
    .png()
    .toFile(file);
  console.log(`  ${path.basename(file)}  (left: sandbox, right: server)`);
};
await pair({ left: 0, top: 0, width: W, height: H }, 1, `${base}.side-by-side.png`);
await pair({ left: 20, top: 440, width: 460, height: 190 }, 2, `${base}.zoom-text.png`);
await pair({ left: 20, top: 20, width: 100, height: 270 }, 2, `${base}.zoom-canton.png`);
await sharp(heat, { raw: { width: W, height: H, channels: 3 } }).png().toFile(`${base}.diff.png`);
console.log(`  ${path.basename(base)}.diff.png  (red = difference, x4)`);
