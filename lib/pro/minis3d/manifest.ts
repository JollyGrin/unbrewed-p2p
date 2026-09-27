/**
 * 3D minis — MODEL LAYER: which fighters have a 3D model, read from
 * `public/minis3d/manifest.json` (#931 spike → #945 production).
 *
 * Keyed by a MINI id, not a hero id: the caller decides which mini a fighter
 * stands as (a hero's id today; a sidekick's own id later), so nothing here
 * assumes heroes only, and nothing here knows about the board or the DOM.
 *
 * Every entry passes the SAME licence gate as the sprite sets (`isCleared`,
 * `creditOf` in lib/pro/figures): a declared licence, `redistributable: true`,
 * `officialHero: false` and the full attribution, or the entry is dropped.
 *
 * `files` maps a detail level ("30k" = ~30K triangles) to a Meshopt GLB beside
 * the manifest (`EXT_meshopt_compression` + `KHR_mesh_quantization`). One
 * play-tier file per mini is committed; `defaultLod` picks it.
 *
 * VARIANTS (#953): the entry itself is the UNPAINTED mini. An optional `paint`
 * object declares the PAINTED one (same mesh + its own texture, e.g. a later
 * unlock): its own `files`/`defaultLod` and its own licence + attribution,
 * through the same gate — a malformed or uncleared `paint` is dropped and
 * the mini stays unpainted-only. No painted file is committed yet, so the
 * "Painted 3D minis" option (lib/pro/figures) never appears today.
 *
 * `baseDiameter` (optional, model units, default 1.0): the width of the
 * model's VISIBLE base. The pipeline normalises a mini so its base's enclosing
 * circle is 1.0 across, which can be wider than the base itself; the renderer
 * maps `baseDiameter` — not 1.0 — onto the base disc.
 */
import { creditOf, isCleared, type FigureCredit } from "../figures";

export const MINIS3D_BASE_URL = "/minis3d";
export const MINIS3D_MANIFEST_URL = `${MINIS3D_BASE_URL}/manifest.json`;

export type Mini3dVariant = "unpainted" | "painted";

/** One variant's model files and who made them. */
export interface Mini3dFiles {
  files: Record<string, string>;
  /** The detail level used unless the dev switch names another. */
  defaultLod: string;
  credit: FigureCredit;
}

export interface Mini3dEntry extends Mini3dFiles {
  /** Model units spanning the base disc (default 1.0). Shared by both
   *  variants: they are the same mesh. */
  baseDiameter: number;
  /** The painted variant, when one is declared and cleared. */
  paint?: Mini3dFiles;
}

export interface Mini3dManifest {
  version: 1;
  minis: Record<string, Mini3dEntry>;
}

/** What a piece draws: one model file, in one seat's tint. */
export interface Mini3d {
  id: string;
  url: string;
  /** Model units spanning the base disc (the entry's `baseDiameter`). */
  baseDiameter: number;
  /** sRGB hex. */
  tint: string;
  variant: Mini3dVariant;
  credit: FigureCredit;
}

/** An OWN key only: a mini id or detail level like "constructor" must never
 *  resolve to something inherited from Object.prototype. */
const own = <T>(o: Record<string, T> | undefined, k: string | null | undefined): T | undefined =>
  o && k != null && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** The pipeline's base footprint: 1 model unit (see the header). */
export const DEFAULT_BASE_DIAMETER = 1;
const baseDiameterOf = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10 ? v : DEFAULT_BASE_DIAMETER;

const isFileName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]+\.glb$/.test(v) && !v.includes("..");

/** A variant's files + clearance, or null (fail closed). Committed and
 *  shipped like the open sprite set: the credit, with its licence deed, is
 *  required. */
const parseFiles = (raw: unknown): Mini3dFiles | null => {
  if (!isRecord(raw) || !isCleared(raw) || !isRecord(raw.files)) return null;
  const credit = creditOf(raw);
  if (!credit?.licenseUrl) return null;
  const files = Object.fromEntries(Object.entries(raw.files).filter(([, f]) => isFileName(f))) as Record<string, string>;
  const defaultLod = typeof raw.defaultLod === "string" && own(files, raw.defaultLod) ? raw.defaultLod : Object.keys(files)[0];
  if (!defaultLod) return null;
  return { files, defaultLod, credit };
};

export const parseMini3dManifest = (raw: unknown): Mini3dManifest | null => {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.minis)) return null;
  const minis: Record<string, Mini3dEntry> = {};
  for (const [id, entry] of Object.entries(raw.minis)) {
    const unpainted = parseFiles(entry);
    if (!unpainted || !isRecord(entry)) continue;
    const paint = entry.paint === undefined ? null : parseFiles(entry.paint);
    minis[id] = { ...unpainted, baseDiameter: baseDiameterOf(entry.baseDiameter), ...(paint ? { paint } : {}) };
  }
  return { version: 1, minis };
};

/** Seat tints: the same painted-metal pull on the seat colours the sprite
 *  renders use (scripts/figures/render.cjs SEAT_TINTS). */
export const MINI3D_SEAT_TINTS: Record<string, string> = { p1: "#b8893a", p2: "#5a7fae", p3: "#4f8f6a", p4: "#a0578a" };

/** A mini for one seat, in one variant — null when the mini (or that
 *  variant of it) does not exist. No silent swap: asking for "painted" of an
 *  unpainted-only mini is null, and the caller decides the fallback. */
export const mini3dFor = (
  manifest: Mini3dManifest | null,
  miniId: string | undefined,
  seat: string,
  lod?: string | null,
  variant: Mini3dVariant = "unpainted"
): Mini3d | null => {
  const entry = own(manifest?.minis, miniId);
  if (!entry || !miniId) return null;
  const v = variant === "painted" ? entry.paint : entry;
  if (!v) return null;
  const key = own(v.files, lod) ? lod! : v.defaultLod;
  return {
    id: `${miniId}${variant === "painted" ? "+painted" : ""}@${key}`,
    url: `${MINIS3D_BASE_URL}/${v.files[key]}`,
    baseDiameter: entry.baseDiameter,
    tint: MINI3D_SEAT_TINTS[seat] ?? MINI3D_SEAT_TINTS.p1,
    variant,
    credit: v.credit,
  };
};

/**
 * Dev tooling for 3D minis (the figure-style dropdown turns them on; #953):
 * `?minis3dLod=` picks another detail level (a local file the manifest
 * names), `?minis3dDpr=` overrides the canvas pixel-ratio cap, and
 * `?minis3dProbe=1` mounts the measuring probe (TableMini3dProbe, dev builds
 * only). Read once from the URL, so nothing on a normal page changes.
 */
export interface Minis3dDevParams {
  probe: boolean;
  lod: string | null;
  maxPixelRatio: number | null;
}

export const readMinis3dDevParams = (search: string): Minis3dDevParams => {
  const q = new URLSearchParams(search);
  const dpr = Number(q.get("minis3dDpr"));
  return {
    probe: q.get("minis3dProbe") === "1",
    lod: q.get("minis3dLod"),
    maxPixelRatio: Number.isFinite(dpr) && dpr >= 1 && dpr <= 4 ? dpr : null,
  };
};
