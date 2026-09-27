/**
 * WebGL minis spike (unbrewed-p2p-931) — which fighters have a 3D model, read
 * from `public/minis3d/manifest.json`.
 *
 * Keyed by a MINI id, not a hero id: the caller decides which mini a fighter
 * stands as (a hero's id today; a sidekick's own id later), so nothing here
 * assumes heroes only.
 *
 * Every entry passes the SAME licence gate as the sprite sets (`isCleared`,
 * `creditOf` in lib/pro/figures): a declared licence, `redistributable: true`,
 * `officialHero: false` and the full attribution, or the entry is dropped.
 *
 * `files` maps a variant — "<lod>.<codec>", e.g. "30k.meshopt" — to a GLB
 * beside the manifest, so the spike can switch detail level and compression
 * from the URL. `paint` is reserved for a painted variant (same mesh + a
 * texture); nothing reads it yet.
 */
import { creditOf, isCleared, type FigureCredit } from "../figures";

export const MINIS3D_BASE_URL = "/minis3d";
export const MINIS3D_MANIFEST_URL = `${MINIS3D_BASE_URL}/manifest.json`;

export type Mini3dCodec = "draco" | "meshopt";

export interface Mini3dEntry {
  files: Record<string, string>;
  /** The variant used when the URL names none. */
  defaultVariant: string;
  credit: FigureCredit;
}

export interface Mini3dManifest {
  version: 1;
  minis: Record<string, Mini3dEntry>;
}

/** What a standee draws: one model file, in one seat's tint. */
export interface Mini3d {
  id: string;
  url: string;
  codec: Mini3dCodec;
  /** sRGB hex. */
  tint: string;
  credit: FigureCredit;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
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
    const defaultVariant = typeof entry.defaultVariant === "string" && files[entry.defaultVariant] ? entry.defaultVariant : Object.keys(files)[0];
    if (!defaultVariant) continue;
    minis[id] = { files, defaultVariant, credit };
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
  variant?: string | null
): Mini3d | null => {
  const entry = miniId ? manifest?.minis[miniId] : undefined;
  if (!entry || !miniId) return null;
  const key = variant && entry.files[variant] ? variant : entry.defaultVariant;
  const file = entry.files[key];
  return {
    id: `${miniId}@${key}`,
    url: `${MINIS3D_BASE_URL}/${file}`,
    codec: /meshopt/.test(key) ? "meshopt" : "draco",
    tint: MINI3D_SEAT_TINTS[seat] ?? MINI3D_SEAT_TINTS.p1,
    credit: entry.credit,
  };
};

/**
 * The dev-only switch: `?minis3d=1` turns the WebGL path on, `?minis3dVariant=
 * 30k.meshopt` picks a file. Read once from the URL, so nothing on a normal
 * page changes.
 */
export interface Minis3dSwitch {
  on: boolean;
  variant: string | null;
}

export const readMinis3dSwitch = (search: string): Minis3dSwitch => {
  const q = new URLSearchParams(search);
  return { on: q.get("minis3d") === "1", variant: q.get("minis3dVariant") };
};
