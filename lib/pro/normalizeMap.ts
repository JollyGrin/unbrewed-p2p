/**
 * Bridges pasted map JSON into the engine-native `ProMapDef` the Pro protocol
 * carries in `CREATE_ROOM.customMap`.
 *
 * Two shapes reach us:
 *   1. Engine-native `ProMapDef` — what the /dev/map-editor now exports and what
 *      the server ships. Passes through untouched.
 *   2. The editor's legacy `MapDoc` (pre-native-export copies people already
 *      have): `meta.players: number[]`, `space.start: number`, no schemaVersion.
 *      Converted here so old exports keep working.
 *
 * This is a SHALLOW structural normalizer, not a validator: it guarantees the
 * shape the wire type demands and throws readable errors on obvious garbage, but
 * graph validity (connectivity, symmetric adjacency, start slots) is the
 * server's job — it re-runs validateMap and answers BAD_MAP. Keeping the deep
 * rules server-side avoids duplicating (and drifting) the validator.
 */

import type { ProMapDef, ProMapSpace } from "./protocol";

class MapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapParseError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Slugify a title into a stable-ish id for a pasted board with none. */
const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "custom";

/**
 * Coerce arbitrary parsed JSON into a `ProMapDef`. Throws `MapParseError` with a
 * human-readable message when the shape is unusable; the caller shows it inline.
 */
export function normalizeMap(raw: unknown): ProMapDef {
  if (!isObj(raw)) throw new MapParseError("map JSON must be an object");
  if (!Array.isArray(raw.spaces)) throw new MapParseError("map is missing a `spaces` array");
  if (!Array.isArray(raw.zones)) throw new MapParseError("map is missing a `zones` array");

  // Already engine-native (has schemaVersion): trust the shape, pass through.
  // The server validates the graph regardless.
  if (typeof raw.schemaVersion === "string") {
    return raw as unknown as ProMapDef;
  }

  // Legacy editor `MapDoc` -> `ProMapDef`.
  const meta = isObj(raw.meta) ? raw.meta : {};
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title : "Custom Map";
  const players = Array.isArray(meta.players) && meta.players.length
    ? (meta.players.filter((n) => typeof n === "number") as number[])
    : [2];

  const spaces: ProMapSpace[] = raw.spaces.map((s, i) => {
    if (!isObj(s) || typeof s.id !== "string") {
      throw new MapParseError(`space #${i} is missing an id`);
    }
    // MapDoc stores start as a bare slot number; ProMapDef wants { slot }.
    const start =
      typeof s.start === "number"
        ? { slot: s.start }
        : isObj(s.start) && typeof s.start.slot === "number"
        ? { slot: s.start.slot }
        : undefined;
    return {
      id: s.id,
      x: Number(s.x),
      y: Number(s.y),
      zones: Array.isArray(s.zones) ? (s.zones as string[]) : [],
      adjacentTo: Array.isArray(s.adjacentTo) ? (s.adjacentTo as string[]) : [],
      ...(Array.isArray(s.oneWayTo) ? { oneWayTo: s.oneWayTo as string[] } : {}),
      ...(start ? { start } : {}),
    };
  });

  return {
    schemaVersion: "1.0",
    id: typeof raw.id === "string" ? raw.id : slugify(title),
    meta: {
      title,
      minPlayers: Math.min(...players),
      maxPlayers: Math.max(...players),
      specialRules: false,
      ...(typeof meta.imageUrl === "string" ? { imageUrl: meta.imageUrl } : {}),
      ...(typeof meta.spaceDiameter === "number" ? { spaceDiameter: meta.spaceDiameter } : {}),
      ...(typeof meta.source === "string" ? { source: meta.source } : {}),
      ...(typeof meta.license === "string" ? { license: meta.license } : {}),
    },
    zones: raw.zones as ProMapDef["zones"],
    spaces,
  };
}

export { MapParseError };
