/**
 * Pre-rendered miniature figures for the tabletop view.
 *
 * WHERE THEY COME FROM. The owner supplies 3D models (STL/3MF) of heroes; they
 * live OUTSIDE this repo (~/Developer/unbrewed-figures) and are rendered by
 * `scripts/figures/render.cjs` into `public/figures/` — a folder that is both
 * git-ignored and vercel-ignored, so neither a commit nor an ordinary deploy
 * carries a render.
 *
 * The code here is generic — it knows nothing about any hero. It reads
 * `/figures/manifest.json` at runtime; a deploy or checkout without the
 * folder simply has no figures, and every standee falls back to its token
 * art exactly as before.
 *
 * THE LICENCE GATE (unbrewed-p2p-879). A figure is shown only when there is
 * no licence conflict: never for an official hero, never from a model whose
 * licence forbids redistribution. Each manifest entry declares `license`,
 * `redistributable: true` and `officialHero: false`; an entry missing any of
 * them, or declaring otherwise, is dropped and that hero keeps its token.
 * `scripts/figures/render.cjs` refuses the same entries at build time, and
 * `public/figures/` is in `.vercelignore`, so a local render never ships by
 * accident — serving figures on a deploy is an explicit opt-in (see
 * scripts/figures/README.md).
 *
 * TWO SETS (unbrewed-p2p-903). Beside that private set there is a second,
 * COMMITTED one: open-licence models (CC0 / CC-BY / CC-BY-SA) rendered into
 * `public/figures-open/`, which every checkout and deploy carries. It is a
 * separate tree with its own manifest, so the private tree's ignore rules stay
 * one plain path, and it passes the same gate PLUS attribution: an open entry
 * without `modelName`, `creator` and an https `sourceUrl` is dropped, because
 * CC-BY obliges us to show that credit (FigureCredits). The viewer picks which
 * set the tabletop draws — or plain tokens — with the figure-style toggle
 * (`figureStyleOptions`).
 *
 * WHY PER-SEAT RENDERS. A miniature is tinted in its seat's color (gold, blue,
 * green, magenta), so ownership reads from the whole figure, not only from the
 * ring under it. CSS cannot recolor a lit render faithfully, so the script
 * renders one image per seat and the manifest lists them.
 */

import { clampTilt } from "./tableProjection";

/** "private": the owner's local, never-shipped renders. "open": the
 *  committed open-licence set. */
export type FigureSet = "private" | "open";

export const FIGURE_SET_BASE_URL: Record<FigureSet, string> = { private: "/figures", open: "/figures-open" };
export const figureManifestUrl = (set: FigureSet): string => `${FIGURE_SET_BASE_URL[set]}/manifest.json`;
export const FIGURES_BASE_URL = FIGURE_SET_BASE_URL.private;
export const FIGURES_MANIFEST_URL = figureManifestUrl("private");

/**
 * The licence deeds the credit links to, by SPDX id. CC BY / BY-SA 4.0
 * s3(a)(1) require a link to (or the text of) the licence with the credit;
 * an OPEN-set entry whose licence is not listed here is dropped, because the
 * app could not meet that obligation. Mirrors OPEN_LICENSE_DEEDS in
 * scripts/figures/clearance.cjs (figures.open.test.ts keeps them equal).
 */
export const LICENSE_DEEDS: Record<string, string> = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

/** Licences under which our renders are NOT modifications we must declare:
 *  public domain. Every other licence gets the modification notice. */
const NO_NOTICE_LICENSES = new Set(["CC0-1.0"]);

/** Who made a model, under what licence, and where it came from — what the
 *  hero's info shows for the miniature on the table. */
export interface FigureCredit {
  modelName: string;
  creator: string;
  license: string;
  /** The licence deed (LICENSE_DEEDS), or null for a licence not listed there
   *  (private set only: the open set requires one). */
  licenseUrl: string | null;
  /** Always https (checked when the manifest is read). */
  sourceUrl: string;
  /** The renders modify the model (lit, recoloured, flattened to images) and
   *  its licence asks that to be indicated — true for everything but CC0. */
  modified: boolean;
}

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
  /** The model's licence: an SPDX id or a named licence. */
  license: string;
  /** The licence allows redistributing the model's renders. Always true here. */
  redistributable: true;
  /** The hero is an official character. Always false here: those get no figure. */
  officialHero: false;
  /** Attribution. Required in the open set; optional in the private one. */
  credit?: FigureCredit;
}

export interface FigureManifest {
  version: 1;
  figures: Record<string, FigureEntry>;
}

/** One hero's figure, resolved for one seat — what a standee renders. */
export interface Figure extends Omit<FigureEntry, "seats" | "license" | "redistributable" | "officialHero" | "credit"> {
  url: string;
  /** Which set it came from (absent in hand-built test figures). */
  set?: FigureSet;
  /** The model's attribution, when its entry declares one. */
  credit?: FigureCredit | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isFraction = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
/** A bare file name: no slashes, no dot-dot. The manifest is a static file
 *  the owner generates, but it is still external data to the app. */
const isFileName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]+$/.test(v) && !v.includes("..");

/** The licence gate. Fail closed: only an explicit, complete clearance passes
 *  — a missing field means no figure. Mirrors scripts/figures/clearance.cjs. */
export const isCleared = (raw: Record<string, unknown>): raw is Record<string, unknown> & { license: string } =>
  typeof raw.license === "string" && raw.license.trim() !== "" && raw.redistributable === true && raw.officialHero === false;

const isFilled = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The credit an entry declares, or null when any part of it is missing.
 *  Mirrors `attributionBlockers` in scripts/figures/clearance.cjs. */
export const creditOf = (raw: Record<string, unknown>): FigureCredit | null => {
  const { modelName, creator, license, sourceUrl } = raw;
  if (!isFilled(modelName) || !isFilled(creator) || !isFilled(license)) return null;
  if (typeof sourceUrl !== "string" || !/^https:\/\/\S+$/.test(sourceUrl)) return null;
  const id = license.trim();
  return {
    modelName: modelName.trim(),
    creator: creator.trim(),
    license: id,
    licenseUrl: LICENSE_DEEDS[id] ?? null,
    sourceUrl,
    modified: !NO_NOTICE_LICENSES.has(id),
  };
};

const parseEntry = (raw: unknown, set: FigureSet): FigureEntry | null => {
  if (!isRecord(raw) || !isRecord(raw.anchor) || !isRecord(raw.seats)) return null;
  if (!isCleared(raw)) return null;
  const credit = creditOf(raw);
  // The committed set ships to everyone: its licences oblige the credit,
  // including a link to the licence itself.
  if (set === "open" && !credit?.licenseUrl) return null;
  const { anchor, imageWidthMm, footprintMm, aspect, seats, license } = raw;
  if (!isFraction(anchor.x) || !isFraction(anchor.y)) return null;
  if (!isPositive(imageWidthMm) || !isPositive(footprintMm) || !isPositive(aspect)) return null;
  const goodSeats = Object.fromEntries(Object.entries(seats).filter(([, file]) => isFileName(file))) as Record<string, string>;
  if (Object.keys(goodSeats).length === 0) return null;
  return {
    anchor: { x: anchor.x, y: anchor.y },
    imageWidthMm,
    footprintMm,
    aspect,
    seats: goodSeats,
    license,
    redistributable: true,
    officialHero: false,
    ...(credit ? { credit } : {}),
  };
};

/** Validate a set's manifest.json. A bad entry is dropped, not fatal: one
 *  broken render must not take every other figure down with it. */
export const parseFigureManifest = (raw: unknown, set: FigureSet): FigureManifest | null => {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.figures)) return null;
  const figures: Record<string, FigureEntry> = {};
  for (const [heroId, entry] of Object.entries(raw.figures)) {
    const parsed = parseEntry(entry, set);
    if (parsed) figures[heroId] = parsed;
  }
  return { version: 1, figures };
};

export const figureFor = (
  manifest: FigureManifest | null,
  heroId: string | undefined,
  seat: string,
  set: FigureSet
): Figure | null => {
  const entry = heroId ? manifest?.figures[heroId] : undefined;
  const file = entry?.seats[seat];
  if (!entry || !file) return null;
  const { anchor, imageWidthMm, footprintMm, aspect } = entry;
  return { anchor, imageWidthMm, footprintMm, aspect, url: `${FIGURE_SET_BASE_URL[set]}/${file}`, set, credit: entry.credit ?? null };
};

/**
 * How the tabletop shows heroes (unbrewed-p2p-903): one of the two figure
 * sets, or every hero as its flat token. A per-viewer display preference.
 * A style draws ONLY its own set — a hero without a figure in it lies as its
 * token — so the choice never shows one set's model under the other's name.
 */
export type FigureStyle = FigureSet | "token";

/** Preference order when the viewer has not chosen, or chose a style this
 *  board cannot show: the owner's own renders first where they are loaded. */
const FIGURE_STYLE_ORDER: FigureStyle[] = ["private", "open", "token"];

export const isFigureStyle = (v: unknown): v is FigureStyle => FIGURE_STYLE_ORDER.includes(v as FigureStyle);

export type FigureManifests = Record<FigureSet, FigureManifest | null>;

/** The seats' heroes on this board. */
export interface HeroSeat {
  heroId: string | undefined;
  seat: string;
}

export const figureForStyle = (
  manifests: FigureManifests,
  style: FigureStyle,
  heroId: string | undefined,
  seat: string
): Figure | null => (style === "token" ? null : figureFor(manifests[style], heroId, seat, style));

/**
 * The styles worth offering on THIS board: each one must draw something
 * different from every style before it. A set with no figure for any hero
 * here looks exactly like tokens, so it is not offered; when nothing but
 * tokens is possible the answer is empty and no toggle is shown at all.
 */
export const figureStyleOptions = (manifests: FigureManifests, heroes: HeroSeat[]): FigureStyle[] => {
  const outcomeOf = (style: FigureStyle) =>
    heroes.map((h) => figureForStyle(manifests, style, h.heroId, h.seat)?.url ?? "").join("|");
  // Tokens are the baseline every set is measured against, offered last.
  const seen = new Set<string>([outcomeOf("token")]);
  const options: FigureStyle[] = [];
  for (const style of FIGURE_STYLE_ORDER) {
    if (style === "token") continue;
    const outcome = outcomeOf(style);
    if (seen.has(outcome)) continue;
    seen.add(outcome);
    options.push(style);
  }
  return options.length > 0 ? [...options, "token"] : [];
};

/** The style actually drawn: the viewer's choice when this board offers it,
 *  else the first option (else tokens). */
export const effectiveFigureStyle = (preferred: FigureStyle | null, options: FigureStyle[]): FigureStyle =>
  preferred && options.includes(preferred) ? preferred : options[0] ?? "token";

/** The next style a tap on the toggle switches to. */
export const nextFigureStyle = (current: FigureStyle, options: FigureStyle[]): FigureStyle => {
  const i = options.indexOf(current);
  return options[(i + 1) % options.length] ?? current;
};

export const FIGURE_STYLE_LABEL: Record<FigureStyle, string> = {
  open: "Open-licence minis",
  private: "Private minis",
  token: "Tokens",
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

/**
 * The figurine a hero-view surface (the hero preview) shows: the owner's own
 * render where it is loaded, else the open set's, in the first seat's tint.
 * Null — no figurine, no credit — for a hero with neither.
 */
export const heroViewFigure = (manifests: FigureManifests, heroId: string | undefined): Figure | null =>
  figureForStyle(manifests, "private", heroId, "p1") ?? figureForStyle(manifests, "open", heroId, "p1");
