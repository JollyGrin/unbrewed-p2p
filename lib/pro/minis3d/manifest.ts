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
 * play-tier file per mini is committed; `defaultLod` picks it. `paint` is
 * reserved for a painted variant (same mesh + a texture); nothing reads it yet.
 *
 * `baseDiameter` (optional, model units, default 1.0): the width of the
 * model's VISIBLE base. The pipeline normalises a mini so its base's enclosing
 * circle is 1.0 across, which can be wider than the base itself; the renderer
 * maps `baseDiameter` — not 1.0 — onto the base disc.
 */
import { creditOf, isCleared, type FigureCredit } from "../figures";

export const MINIS3D_BASE_URL = "/minis3d";
export const MINIS3D_MANIFEST_URL = `${MINIS3D_BASE_URL}/manifest.json`;

export interface Mini3dEntry {
  files: Record<string, string>;
  /** The detail level used unless the dev switch names another. */
  defaultLod: string;
  /** Model units spanning the base disc (default 1.0). */
  baseDiameter: number;
  credit: FigureCredit;
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
  credit: FigureCredit;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** The pipeline's base footprint: 1 model unit (see the header). */
export const DEFAULT_BASE_DIAMETER = 1;
const baseDiameterOf = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10 ? v : DEFAULT_BASE_DIAMETER;

const isFileName = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._-]+\.glb$/.test(v) && !v.includes("..");

export const parseMini3dManifest = (raw: unknown): Mini3dManifest | null => {
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.minis)) return null;
  const minis: Record<string, Mini3dEntry> = {};
  for (const [id, entry] of Object.entries(raw.minis)) {
    if (!isRecord(entry) || !isCleared(entry) || !isRecord(entry.files)) continue;
    // Committed and shipped like the open sprite set: the credit is required.
    const credit = creditOf(entry);
    if (!credit?.licenseUrl) continue;
    const files = Object.fromEntries(Object.entries(entry.files).filter(([, f]) => isFileName(f))) as Record<string, string>;
    const defaultLod = typeof entry.defaultLod === "string" && files[entry.defaultLod] ? entry.defaultLod : Object.keys(files)[0];
    if (!defaultLod) continue;
    minis[id] = { files, defaultLod, baseDiameter: baseDiameterOf(entry.baseDiameter), credit };
  }
  return { version: 1, minis };
};

/** Seat tints: the same painted-metal pull on the seat colours the sprite
 *  renders use (scripts/figures/render.cjs SEAT_TINTS). */
export const MINI3D_SEAT_TINTS: Record<string, string> = { p1: "#b8893a", p2: "#5a7fae", p3: "#4f8f6a", p4: "#a0578a" };

export const mini3dFor = (
  manifest: Mini3dManifest | null,
  miniId: string | undefined,
  seat: string,
  lod?: string | null
): Mini3d | null => {
  const entry = miniId ? manifest?.minis[miniId] : undefined;
  if (!entry || !miniId) return null;
  const key = lod && entry.files[lod] ? lod : entry.defaultLod;
  return {
    id: `${miniId}@${key}`,
    url: `${MINIS3D_BASE_URL}/${entry.files[key]}`,
    baseDiameter: entry.baseDiameter,
    tint: MINI3D_SEAT_TINTS[seat] ?? MINI3D_SEAT_TINTS.p1,
    credit: entry.credit,
  };
};

/**
 * The dev switch — the ONLY way to turn 3D minis on until the figure-style
 * dropdown lands: `?minis3d=1`. Tooling extras: `?minis3dLod=` picks another
 * detail level (a local file the manifest names), `?minis3dDpr=` overrides the
 * canvas pixel-ratio cap. Read once from the URL, so nothing on a normal page
 * changes.
 */
export interface Minis3dSwitch {
  on: boolean;
  lod: string | null;
  maxPixelRatio: number | null;
}

export const readMinis3dSwitch = (search: string): Minis3dSwitch => {
  const q = new URLSearchParams(search);
  const dpr = Number(q.get("minis3dDpr"));
  return {
    on: q.get("minis3d") === "1",
    lod: q.get("minis3dLod"),
    maxPixelRatio: Number.isFinite(dpr) && dpr >= 1 && dpr <= 4 ? dpr : null,
  };
};
