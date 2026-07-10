/**
 * Built-in board catalog for the Pro create flow (issue #94).
 *
 * A client-side list of the boards a room creator can pick before sending
 * `CREATE_ROOM`. No engine or protocol change: a catalog board is just a
 * `ProMapDef` (optionally carrying an authored `supportedFormats` block) that
 * rides along in `CREATE_ROOM.customMap`, exactly like a pasted custom map. The
 * server still validates the graph and answers `BAD_MAP` on anything bad.
 *
 * Eligibility mirrors `server/rooms.ts` `mapSupportForFormat` EXACTLY: a map
 * supports a format iff it has an authored `supportedFormats` entry for that
 * format, OR the format is `duel` and the printed board has start slots 1 and 2.
 * Keep this in lockstep with the server so a card we render as eligible never
 * bounces with `BAD_MAP`.
 */
import type { ProMapDef } from "./protocol";
import { MULTIPLAYER_PLAYTEST_MAP, PRO_FORMATS, ProFormatId } from "./multiplayerPlaytest";
import mendedDrumJson from "./fixtures/mended-drum.map.json";
import islandOfDespairJson from "./fixtures/island-of-despair.map.json";

/** A board's authored per-format seat mapping (present on multiplayer boards). */
interface MapFormatSupport {
  formatId: ProFormatId;
  seats: Record<string, { startSlot: number; label?: string }>;
}

/** A `ProMapDef` that may carry an authored `supportedFormats` block. */
export type CatalogMap = ProMapDef & { supportedFormats?: MapFormatSupport[] };

export interface MapCatalogEntry {
  id: string;
  title: string;
  /** thumbnail shown in the board picker (board image, or the arena's data-URI svg) */
  thumbnailUrl: string;
  /** the full board sent as `customMap` when this entry is chosen */
  map: CatalogMap;
  /**
   * When true, choosing this board sends NO `customMap` — the server falls back
   * to its own built-in default board (byte-identical to today's duel default).
   */
  serverDefault?: boolean;
}

const mendedDrum = mendedDrumJson as unknown as CatalogMap;
const islandOfDespair = islandOfDespairJson as unknown as CatalogMap;

/**
 * Ordered built-in boards. The Mended Drum is the duel default (server board,
 * sends no customMap); Island of Despair is the >2p default.
 */
export const MAP_CATALOG: MapCatalogEntry[] = [
  {
    id: mendedDrum.id,
    title: mendedDrum.meta.title,
    thumbnailUrl: mendedDrum.meta.imageUrl ?? "",
    map: mendedDrum,
    serverDefault: true,
  },
  {
    id: islandOfDespair.id,
    title: islandOfDespair.meta.title,
    thumbnailUrl: islandOfDespair.meta.imageUrl ?? "",
    map: islandOfDespair,
  },
  {
    id: MULTIPLAYER_PLAYTEST_MAP.id,
    title: "Playtest Arena (synthetic)",
    thumbnailUrl: MULTIPLAYER_PLAYTEST_MAP.meta.imageUrl ?? "",
    map: MULTIPLAYER_PLAYTEST_MAP,
  },
];

/** Sentinel id for the "paste your own JSON" option in the board picker. */
export const CUSTOM_MAP_ID = "custom" as const;

const printedSlots = (map: CatalogMap): Set<number> =>
  new Set(map.spaces.flatMap((s) => (s.start ? [s.start.slot] : [])));

const authoredFormats = (map: CatalogMap): ProFormatId[] =>
  (map.supportedFormats ?? []).map((f) => f.formatId);

/**
 * Whether a board supports a format — mirrors the server's `mapSupportForFormat`
 * fallback exactly: authored `supportedFormats` entry, OR duel with printed
 * start slots 1 and 2.
 */
export function mapEligibleForFormat(map: CatalogMap, formatId: ProFormatId): boolean {
  if (authoredFormats(map).includes(formatId)) return true;
  if (formatId === "duel") {
    const slots = printedSlots(map);
    return slots.has(1) && slots.has(2);
  }
  return false;
}

const SLOTS_NEEDED: Record<ProFormatId, number> = { duel: 2, "ffa-3": 3, "team-2v2": 4 };

/** Human-readable reason a board can't host a format, or null if it can. */
export function ineligibleReason(map: CatalogMap, formatId: ProFormatId): string | null {
  if (mapEligibleForFormat(map, formatId)) return null;
  return `needs ${SLOTS_NEEDED[formatId]} start slots`;
}

/** Formats this board can host, in canonical PRO_FORMATS order (for badges). */
export function eligibleFormats(map: CatalogMap): ProFormatId[] {
  return PRO_FORMATS.map((f) => f.id).filter((id) => mapEligibleForFormat(map, id));
}

/** Short badge label per format shown on a board card. */
export const FORMAT_BADGE: Record<ProFormatId, string> = {
  duel: "1v1",
  "ffa-3": "3P",
  "team-2v2": "2v2",
};

export function catalogEntry(id: string): MapCatalogEntry | undefined {
  return MAP_CATALOG.find((e) => e.id === id);
}

/** The default board id for a format: Mended Drum for duel, Island of Despair otherwise. */
export function defaultMapIdForFormat(formatId: ProFormatId): string {
  return formatId === "duel" ? mendedDrum.id : islandOfDespair.id;
}

/**
 * The `customMap` to send for a chosen catalog entry: `undefined` for a
 * server-default board (so duel stays byte-identical), else the full board.
 */
export function customMapForEntry(entry: MapCatalogEntry): ProMapDef | undefined {
  return entry.serverDefault ? undefined : entry.map;
}
