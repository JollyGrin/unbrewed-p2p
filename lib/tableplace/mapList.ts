import defaultMaps from "@/components/Bag/Map/MapModal/defaultMaps.json";
import type { MapData } from "@/lib/hooks/useLocalStorage";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { mapSpacesEntry } from "./mapSpaces";

export type TableMapOption = MapData & {
  /** The label shown in the picker. */
  label: string;
  /** A board that snaps figures to spaces. */
  spaces: boolean;
};

/** Built-ins that are test uploads: kept in the shared list, left out of this picker. */
const JUNK = /forrestofrandomtrash|gigs-and-shittles/;
/** The shared list carries two entries with this title; the pair is one board in this picker. */
const DUPLICATE_TITLE = /untitled-battlefield-230/;
/** The shared list files the Altar under another image than the catalog does. */
const ALTAR = /community-altar-119/;

const pathOf = (url: string) => {
  try {
    return new URL(url, "https://x.invalid").pathname;
  } catch {
    return url;
  }
};

const titleOf = (m: MapData) => (m.meta?.title ?? m.imgUrl).trim();

/** The one place that decides which picker entries count as snapping boards. */
export const isSpacesMap = (m: Pick<TableMapOption, "spaces">) => m.spaces;

/** The picker's two groups, each in list order. */
export const groupMapList = (maps: TableMapOption[]) => ({
  spaces: maps.filter(isSpacesMap),
  other: maps.filter((m) => !isSpacesMap(m)),
});

/**
 * The `/table` map picker: your bag's maps, then the built-ins minus the junk,
 * plus the catalog boards the shared list lacks. Boards that snap figures to
 * spaces (marked) come first; each group is sorted by title.
 */
export const buildMapList = (bagMaps: MapData[] = []): TableMapOption[] => {
  const catalog = new Map(
    MAP_CATALOG.filter((e) => !e.hidden && e.map.meta.imageUrl).map((e) => [
      pathOf(e.map.meta.imageUrl as string),
      e,
    ]),
  );
  const builtIn: MapData[] = (defaultMaps as MapData[]).filter(
    (m) =>
      !JUNK.test(m.imgUrl) &&
      !DUPLICATE_TITLE.test(m.imgUrl) &&
      !ALTAR.test(m.imgUrl),
  );
  const fromCatalog: MapData[] = [...catalog.entries()].map(([path, e]) => ({
    imgUrl: path,
    meta: { title: e.title, author: "", url: "" },
  }));

  const seen = new Set<string>();
  const list = [...bagMaps, ...builtIn, ...fromCatalog]
    .filter((m) => (seen.has(m.imgUrl) ? false : (seen.add(m.imgUrl), true)))
    .map((m) => {
      const spaces =
        catalog.has(pathOf(m.imgUrl)) || !!mapSpacesEntry(m.imgUrl);
      const title = titleOf(m);
      return { ...m, label: spaces ? `${title} · spaces` : title, spaces };
    })
    .sort((a, b) =>
      titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: "base" }),
    );
  const { spaces, other } = groupMapList(list);
  return [...spaces, ...other];
};
