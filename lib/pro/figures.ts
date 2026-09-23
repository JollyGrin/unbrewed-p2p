/**
 * Pre-rendered miniature figures for the tabletop view.
 *
 * WHERE THEY COME FROM. The owner supplies 3D models (STL/3MF) of heroes; they
 * live OUTSIDE this repo (~/Developer/unbrewed-figures) and are rendered by
 * `scripts/figures/render.cjs` into `public/figures/` — a folder that is
 * git-ignored but NOT vercel-ignored. That split is the whole point: the
 * figures ship with the owner's own Vercel deploy so friends see them live,
 * and never reach GitHub, the public PR fork, or the upstream author's game.
 * Many of the heroes are official Unmatched characters, and those must never
 * be committed anywhere.
 *
 * So the code here is generic — it knows nothing about any hero. It reads
 * `/figures/manifest.json` at runtime; a deploy or checkout without the
 * folder simply has no figures, and every standee falls back to its token
 * art exactly as before.
 *
 * WHY PER-SEAT RENDERS. A miniature is tinted in its seat's color (gold, blue,
 * green, magenta), so ownership reads from the whole figure, not only from the
 * ring under it. CSS cannot recolor a lit render faithfully, so the script
 * renders one image per seat and the manifest lists them.
 */

import { clampTilt } from "./tableProjection";

export const FIGURES_BASE_URL = "/figures";
export const FIGURES_MANIFEST_URL = `${FIGURES_BASE_URL}/manifest.json`;

export interface FigureEntry {
  /** Where the ground point under the model's centre lands in the image, as
   *  fractions of its width/height. The standee's feet go there. */
  anchor: { x: number; y: number };
  /** Model millimetres across the image's width. */
  imageWidthMm: number;
  /** Diameter of the model's own base, mm — what should cover the base disc. */
  footprintMm: number;
  /** Image height ÷ width. */
  aspect: number;
  /** Seat id → image file name inside FIGURES_BASE_URL. */
  seats: Record<string, string>;
}

export interface FigureManifest {
  version: 1;
  figures: Record<string, FigureEntry>;
}

/** One hero's figure, resolved for one seat — what a standee renders. */
export interface Figure extends Omit<FigureEntry, "seats"> {
  url: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isFraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
/** A bare file name: no slashes, no dot-dot. The manifest is a static file
 *  the owner generates, but it is still external data to the app. */
const isFileName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]+$/.test(v) && !v.includes("..");

const parseEntry = (raw: unknown): FigureEntry | null => {
  if (!isRecord(raw) || !isRecord(raw.anchor) || !isRecord(raw.seats)) return null;
  const { anchor, imageWidthMm, footprintMm, aspect, seats } = raw;
  if (!isFraction(anchor.x) || !isFraction(anchor.y)) return null;
  if (!isPositive(imageWidthMm) || !isPositive(footprintMm) || !isPositive(aspect)) return null;
  const goodSeats = Object.fromEntries(Object.entries(seats).filter(([, file]) => isFileName(file))) as Record<string, string>;
  if (Object.keys(goodSeats).length === 0) return null;
  return { anchor: { x: anchor.x, y: anchor.y }, imageWidthMm, footprintMm, aspect, seats: goodSeats };
};

/** Validate `/figures/manifest.json`. A bad entry is dropped, not fatal: one
 *  broken render must not take every other figure down with it. */
export const parseFigureManifest = (raw: unknown): FigureManifest | null => {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.figures)) return null;
  const figures: Record<string, FigureEntry> = {};
  for (const [heroId, entry] of Object.entries(raw.figures)) {
    const parsed = parseEntry(entry);
    if (parsed) figures[heroId] = parsed;
  }
  return { version: 1, figures };
};

export const figureFor = (
  manifest: FigureManifest | null,
  heroId: string | undefined,
  seat: string
): Figure | null => {
  const entry = heroId ? manifest?.figures[heroId] : undefined;
  const file = entry?.seats[seat];
  if (!entry || !file) return null;
  const { seats: _seats, ...geometry } = entry;
  return { ...geometry, url: `${FIGURES_BASE_URL}/${file}` };
};

export interface SpriteBox {
  width: number;
  height: number;
  /** Offsets of the image's top-left corner from the fighter's feet. */
  left: number;
  top: number;
}

/**
 * Size and place the figure image so the model's own base spans the standee's
 * base disc (`baseDiamPx`) and the model's ground point sits on the feet.
 * Owner feedback (2026-09-23): a figure whose base overhung its space read as
 * too big; matching the base disc — itself 0.9 of a space — keeps every
 * figure inside the circle it stands on, like the reference app.
 */
export const figureSpriteBox = (figure: Figure, baseDiamPx: number): SpriteBox => {
  const width = figure.imageWidthMm * (baseDiamPx / figure.footprintMm);
  const height = width * figure.aspect;
  return { width, height, left: -figure.anchor.x * width, top: -figure.anchor.y * height };
};

/** The strip of a figure image that lies below its feet, laid in the board plane. */
export interface GroundSlice {
  /** The strip, in board-plane px from the feet: it starts on the feet line. */
  left: number;
  width: number;
  height: number;
  /** The whole image inside the strip, stretched along the board's depth. */
  imageTop: number;
  imageHeight: number;
}

/**
 * Where the part of a figure's render BELOW its ground point goes.
 *
 * WHY. The render shows the miniature from the table camera's angle, so the
 * front half of its base sits below the ground point in the image. On the
 * table the image stands upright (billboarded) about that point, and in a
 * `preserve-3d` scene everything of it below the feet is behind the board's
 * surface: the owner saw every base sliced off flat at its centre line
 * (2026-09-23, again after the LARGE fix). That strip is therefore drawn
 * lying IN the board plane instead, starting at the feet line. The board
 * shows an in-plane length at cos(tilt) of its size, so the strip is laid out
 * 1/cos(tilt) deeper and looks, on screen, exactly like the image it
 * continues.
 */
export const figureGroundSlice = (box: SpriteBox, tiltDeg: number): GroundSlice | null => {
  const belowFeet = box.top + box.height;
  if (belowFeet <= 0) return null;
  const stretch = 1 / Math.cos((clampTilt(tiltDeg) * Math.PI) / 180);
  return {
    left: box.left,
    width: box.width,
    height: belowFeet * stretch,
    imageTop: box.top * stretch,
    imageHeight: box.height * stretch,
  };
};

/**
 * How much larger a LARGE (two-space) fighter's miniature is drawn than a
 * one-space one. Its base is sized off one space's base disc like every other
 * figure, then scaled by this so the model reaches across onto both spaces it
 * occupies, the way a big miniature straddles two spaces on a real table.
 */
export const LARGE_FIGURE_SCALE = 1.5;

/** A tween through board points, in the tabletop's normalized 0–1 coordinates. */
export interface BoardPathAnim {
  xs: number[];
  ys: number[];
  durationSec: number;
}

/**
 * The glide of a figure that stands BETWEEN a LARGE fighter's two spaces: the
 * midpoint of the head's and the tail's paths, step by step. The two paths of
 * a snake-step move are equally long (the tail follows the head); when they
 * are not — or one is missing — the figure snaps, like the pieces do, rather
 * than inventing a route between spaces nobody walked.
 */
export const straddleAnim = (head: BoardPathAnim | null, tail: BoardPathAnim | null): BoardPathAnim | null => {
  if (!head || !tail || head.xs.length !== tail.xs.length || head.xs.length < 2) return null;
  return {
    xs: head.xs.map((x, i) => (x + tail.xs[i]) / 2),
    ys: head.ys.map((y, i) => (y + tail.ys[i]) / 2),
    durationSec: head.durationSec,
  };
};
