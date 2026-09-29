import mapSpaces from "./mapSpaces.json";
import { absoluteUrl } from "./deckToPack";
import type { BoardSpaces } from "./layout";

/**
 * Printed spaces for built-in maps that have no Pro def: enough to snap a
 * figure onto a space and start the heroes on theirs, nothing more (no
 * adjacency). Keyed by the map's `/maps/...webp` path; `x`/`y` are fractions
 * of the image, `spaceDiameter` a fraction of its WIDTH. `club` entries come
 * from the-unmatched.club's own editor data, `cv` ones from the translate-map
 * pipeline's ring detector, each checked against an overlay of the board.
 * `starts` is only present when the board prints slots 1 and 2.
 */
export type MapSpacesEntry = {
  spaces: { x: number; y: number }[];
  spaceDiameter: number;
  starts?: { slot: number; x: number; y: number }[];
  source: "club" | "cv";
};

export const MAP_SPACES = mapSpaces as Record<string, MapSpacesEntry>;

const byUrl = new Map(
  Object.entries(MAP_SPACES).map(([path, e]) => [absoluteUrl(path), e]),
);

export const mapSpacesEntry = (imageUrl: string): MapSpacesEntry | null =>
  byUrl.get(absoluteUrl(imageUrl)) ?? null;

/** A built-in map's printed spaces by image url, relative or absolute. */
export const printedSpaces = (imageUrl: string): BoardSpaces | null => {
  const entry = mapSpacesEntry(imageUrl);
  if (!entry) return null;
  const slotAt = (x: number, y: number) =>
    entry.starts?.find((s) => s.x === x && s.y === y)?.slot;
  return {
    meta: { spaceDiameter: entry.spaceDiameter },
    spaces: entry.spaces.map(({ x, y }, i) => {
      const slot = slotAt(x, y);
      return { id: `s${i}`, x, y, ...(slot ? { start: { slot } } : {}) };
    }),
  };
};
