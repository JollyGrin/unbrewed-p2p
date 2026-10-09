import type { ProMapDef } from "./protocol";

/** Neutral stand-in size when a map hosts no image and states no size either. */
const FALLBACK_W = 1600;
const FALLBACK_H = 1000;

/**
 * The board's ground image. A map without `meta.imageUrl` (e.g. an adventure
 * board whose art is not hosted yet) must not collapse the layout to 0×0, so it gets a
 * neutral SVG of the map's own stated `imageWidth`×`imageHeight`: the same
 * intrinsic size the real art would have, so every fraction-based layer lines up.
 */
export function mapImageSrc(meta: ProMapDef["meta"]): string {
  if (meta.imageUrl) return meta.imageUrl;
  const w = meta.imageWidth && meta.imageWidth > 0 ? meta.imageWidth : FALLBACK_W;
  const h = meta.imageHeight && meta.imageHeight > 0 ? meta.imageHeight : FALLBACK_H;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="#2b3a33"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
