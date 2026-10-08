/**
 * A map's display title without the map catalog. The catalog (every map JSON)
 * is heavy and the navbar chip's import chain must not pull it into every page
 * (#1265), so `options.ts` registers the real lookup when it loads; until then
 * (or for an unknown map) the id stands in. `loadMapTitles` brings the catalog
 * in on demand for surfaces that show a title but don't import `options`.
 */
import type { MapRef } from "./types";

let lookup: ((ref: MapRef) => string) | null = null;

export const registerMapTitles = (fn: (ref: MapRef) => string) => {
  lookup = fn;
};

export const mapTitle = (ref: MapRef): string => lookup?.(ref) ?? ref.id;

export const loadMapTitles = (): Promise<void> => import("./options").then(() => undefined);
