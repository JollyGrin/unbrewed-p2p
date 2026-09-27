#!/usr/bin/env node
/**
 * Where a figure's visible pixels are inside its render (unbrewed-p2p-928).
 *
 * A render is a fixed 2:3 frame the model is fitted into, so the model rarely
 * fills it: a low, wide one leaves most of the frame's height empty. The
 * tabletop hangs a miniature's badges off its SILHOUETTE, so the manifest
 * records it as `bounds` — fractions of the image, from its top-left corner
 * (lib/pro/figures.ts `FigureBounds`). render.cjs writes it with every
 * render; this script backfills a manifest whose images are already on disk:
 *
 *   node scripts/figures/bounds.cjs public/figures-open
 *
 * The seats' renders differ only in tint; the bounds are their union.
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/** Alpha at or below this is the render's soft edge / shadow, not the model. */
const ALPHA_FLOOR = 24;

const round = (v) => Math.round(v * 1e4) / 1e4;

/** One image's silhouette, or null when nothing in it is opaque enough. */
const imageBounds = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * channels + channels - 1] <= ALPHA_FLOOR) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return null;
  return { left: left / width, top: top / height, right: (right + 1) / width, bottom: (bottom + 1) / height };
};

/** The union of several images' silhouettes, rounded for the manifest. */
const figureBounds = async (files) => {
  const all = (await Promise.all(files.map(imageBounds))).filter(Boolean);
  if (all.length === 0) return null;
  return {
    left: round(Math.min(...all.map((b) => b.left))),
    top: round(Math.min(...all.map((b) => b.top))),
    right: round(Math.max(...all.map((b) => b.right))),
    bottom: round(Math.max(...all.map((b) => b.bottom))),
  };
};

module.exports = { imageBounds, figureBounds, ALPHA_FLOOR };

if (require.main === module) {
  (async () => {
    const dir = process.argv[2];
    if (!dir) throw new Error("usage: node scripts/figures/bounds.cjs <figures dir>");
    const file = path.join(dir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const [heroId, entry] of Object.entries(manifest.figures)) {
      const bounds = await figureBounds(Object.values(entry.seats).map((f) => path.join(dir, f)));
      if (!bounds) throw new Error(`${heroId}: no visible pixels in its renders`);
      const { anchor, imageWidthMm, footprintMm, aspect, bounds: _old, ...rest } = entry;
      manifest.figures[heroId] = { anchor, imageWidthMm, footprintMm, aspect, bounds, ...rest };
      console.log(`${heroId}: ${JSON.stringify(bounds)}`);
    }
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
