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
import { normalizeMap } from "./normalizeMap";
import mendedDrumJson from "./fixtures/mended-drum.map.json";
import islandOfDespairJson from "./fixtures/island-of-despair.map.json";
import cityDocksJson from "./fixtures/city-docks.map.json";
import polusJson from "./fixtures/polus.map.json";
import weathertopJson from "./fixtures/weathertop.map.json";
import countsCastleJson from "./fixtures/counts-castle.map.json";
import uscssNostromoJson from "./fixtures/uscss-nostromo.map.json";
import theBogJson from "./fixtures/the-bog.map.json";
import weddingCrashersJson from "./fixtures/wedding-crashers.map.json";
import pyramidsJson from "./fixtures/pyramids.map.json";
import secludedTempleJson from "./fixtures/secluded-temple.map.json";
import unseenUniversityJson from "./fixtures/unseen-university.map.json";
import riverCruiseJson from "./fixtures/river-cruise.map.json";
import theAltarJson from "./fixtures/the-altar.map.json";

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
  /**
   * When true, this entry stays in `MAP_CATALOG` (so tests, fixtures, and
   * `catalogEntry()` keep resolving it) but is filtered out of the user-facing
   * board picker. Used for synthetic/dev-only boards like the playtest arena.
   */
  hidden?: boolean;
}

const mendedDrum = mendedDrumJson as unknown as CatalogMap;
const islandOfDespair = islandOfDespairJson as unknown as CatalogMap;
const cityDocks = cityDocksJson as unknown as CatalogMap;
const polus = polusJson as unknown as CatalogMap;
const weathertop = weathertopJson as unknown as CatalogMap;
const countsCastle = countsCastleJson as unknown as CatalogMap;
const uscssNostromo = uscssNostromoJson as unknown as CatalogMap;
const theBog = theBogJson as unknown as CatalogMap;
const weddingCrashers = weddingCrashersJson as unknown as CatalogMap;
const pyramids = pyramidsJson as unknown as CatalogMap;
const secludedTemple = secludedTempleJson as unknown as CatalogMap;
const unseenUniversity = unseenUniversityJson as unknown as CatalogMap;
const riverCruise = riverCruiseJson as unknown as CatalogMap;
const theAltar = theAltarJson as unknown as CatalogMap;

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
    id: cityDocks.id,
    title: cityDocks.meta.title,
    thumbnailUrl: cityDocks.meta.imageUrl ?? "",
    map: cityDocks,
  },
  {
    id: polus.id,
    title: polus.meta.title,
    thumbnailUrl: polus.meta.imageUrl ?? "",
    map: polus,
  },
  {
    id: weathertop.id,
    title: weathertop.meta.title,
    thumbnailUrl: weathertop.meta.imageUrl ?? "",
    map: weathertop,
  },
  {
    id: countsCastle.id,
    title: countsCastle.meta.title,
    thumbnailUrl: countsCastle.meta.imageUrl ?? "",
    map: countsCastle,
  },
  {
    id: uscssNostromo.id,
    title: uscssNostromo.meta.title,
    thumbnailUrl: uscssNostromo.meta.imageUrl ?? "",
    map: uscssNostromo,
  },
  {
    id: theBog.id,
    title: theBog.meta.title,
    thumbnailUrl: theBog.meta.imageUrl ?? "",
    map: theBog,
  },
  {
    id: weddingCrashers.id,
    title: weddingCrashers.meta.title,
    thumbnailUrl: weddingCrashers.meta.imageUrl ?? "",
    map: weddingCrashers,
  },
  {
    id: pyramids.id,
    title: pyramids.meta.title,
    thumbnailUrl: pyramids.meta.imageUrl ?? "",
    map: pyramids,
  },
  {
    id: secludedTemple.id,
    title: secludedTemple.meta.title,
    thumbnailUrl: secludedTemple.meta.imageUrl ?? "",
    map: secludedTemple,
  },
  {
    id: unseenUniversity.id,
    title: unseenUniversity.meta.title,
    thumbnailUrl: unseenUniversity.meta.imageUrl ?? "",
    map: unseenUniversity,
  },
  {
    id: riverCruise.id,
    title: riverCruise.meta.title,
    thumbnailUrl: riverCruise.meta.imageUrl ?? "",
    map: riverCruise,
  },
  {
    id: theAltar.id,
    title: theAltar.meta.title,
    thumbnailUrl: theAltar.meta.imageUrl ?? "",
    map: theAltar,
  },
  {
    id: MULTIPLAYER_PLAYTEST_MAP.id,
    title: "Playtest Arena (synthetic)",
    thumbnailUrl: MULTIPLAYER_PLAYTEST_MAP.meta.imageUrl ?? "",
    map: MULTIPLAYER_PLAYTEST_MAP,
    hidden: true,
  },
];

/** Sentinel id for the "paste your own JSON" option in the board picker. */
export const CUSTOM_MAP_ID = "custom" as const;

/**
 * Sentinel id for the "Random" option in the board picker (issue #685).
 *
 * Selecting it does NOT pick a board — resolution is deferred to room-create
 * time, where `rollRandomMap` draws from the format's pool and the create path
 * then proceeds exactly as if that board's tile had been clicked (`serverDefault`
 * / `customMapForEntry` semantics intact).
 */
export const RANDOM_MAP_ID = "random" as const;

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
 * Largest board — by the board's own `meta.maxPlayers` — the Random tile will
 * roll for a 1v1 (issue #685).
 *
 * A duel on a board authored for more than four players is a long walk to the
 * first attack, so such a board stays hand-pickable but is never rolled onto
 * anyone. Every board in the catalog today is 2/2 or 2/4, so ALL of them are in
 * the 1v1 pool right now: the bound is here so a future big board excludes
 * itself by its own metadata, with no catalog edit and nothing to remember.
 */
export const DUEL_RANDOM_MAX_PLAYERS = 4;

/** Whether the Random tile may roll this board for a `duel`. */
export function duelRandomEligible(map: CatalogMap): boolean {
  return mapEligibleForFormat(map, "duel") && map.meta.maxPlayers <= DUEL_RANDOM_MAX_PLAYERS;
}

/**
 * The boards the Random tile can roll for a format.
 *
 * `duel` draws from every visible duel board small enough to duel on
 * (`duelRandomEligible`); the multiplayer formats draw uniformly over every
 * visible board eligible for that format.
 */
export function randomMapPool(formatId: ProFormatId): MapCatalogEntry[] {
  const visible = MAP_CATALOG.filter((e) => !e.hidden && mapEligibleForFormat(e.map, formatId));
  return formatId === "duel" ? visible.filter((e) => duelRandomEligible(e.map)) : visible;
}

/**
 * Roll a board for a format. Uniform over `randomMapPool`; falls back to the
 * format's default board if a pool is ever empty (so the create path can never
 * be left without a board).
 */
export function rollRandomMap(
  formatId: ProFormatId,
  rng: () => number = Math.random,
): MapCatalogEntry {
  const pool = randomMapPool(formatId);
  if (pool.length === 0) return catalogEntry(defaultMapIdForFormat(formatId))!;
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rng() * pool.length)));
  return pool[i];
}

/**
 * The `customMap` to send for a chosen catalog entry: `undefined` for a
 * server-default board (so duel stays byte-identical), else the full board.
 */
export function customMapForEntry(entry: MapCatalogEntry): ProMapDef | undefined {
  return entry.serverDefault ? undefined : entry.map;
}

/**
 * Whether the chosen board carries battlefield items (#725 ↔ engine #519) —
 * gates the lobby's 🎁 ITEMS chip, and with it the `CREATE_ROOM.itemsEnabled`
 * opt-out: hidden chip ⇒ the field is never put on the wire, so every create on
 * an item-less board stays byte-identical to today.
 *
 * - catalog tile → the entry's own `items` array (Wedding Crashers is the first
 *   catalog board to print items, #727; any later one lights up automatically);
 * - Custom… → a lenient parse of the pasted JSON through `normalizeMap`. Parse
 *   errors are swallowed on purpose: a malformed board shows no chip (nothing to
 *   toggle), and the create-click handler owns surfacing the real error;
 * - Random → always false: the roll resolves at create time, so there is no
 *   board to inspect and the player never had a say — items stay ON.
 */
export function mapHasItems(selectedMapId: string, customMapJson: string): boolean {
  if (selectedMapId === RANDOM_MAP_ID) return false;
  if (selectedMapId === CUSTOM_MAP_ID) {
    const trimmed = customMapJson.trim();
    if (!trimmed) return false;
    try {
      return (normalizeMap(JSON.parse(trimmed)).items?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }
  const entry = catalogEntry(selectedMapId);
  return !!entry && (entry.map.items?.length ?? 0) > 0;
}
