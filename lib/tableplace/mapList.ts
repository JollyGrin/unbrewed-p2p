import defaultMaps from "@/components/Bag/Map/MapModal/defaultMaps.json";
import type { MapData } from "@/lib/hooks/useLocalStorage";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";
import { mapSpacesEntry } from "./mapSpaces";

/** The gallery's sections, in the order they are shown. */
export const MAP_GROUPS = ["pro", "bag", "spaces", "image"] as const;
export type MapGroup = (typeof MAP_GROUPS)[number];

export type TableMapOption = MapData & {
  /** The title shown in the gallery. */
  label: string;
  /** A board that snaps figures to spaces. */
  spaces: boolean;
  /** The gallery section the map is listed under. */
  group: MapGroup;
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

/** The gallery's four sections, each in list order. */
export const groupMapList = (
  maps: TableMapOption[],
): Record<MapGroup, TableMapOption[]> => ({
  pro: maps.filter((m) => m.group === "pro"),
  bag: maps.filter((m) => m.group === "bag"),
  spaces: maps.filter((m) => m.group === "spaces"),
  image: maps.filter((m) => m.group === "image"),
});

/**
 * The `/table` map gallery: the Pro boards in catalog order, then your bag's
 * other maps, then the built-ins (minus the junk) that snap figures to spaces,
 * then the image-only rest. Every group but the first is sorted by title.
 */
export const buildMapList = (bagMaps: MapData[] = []): TableMapOption[] => {
  const catalog = new Map(
    MAP_CATALOG.filter((e) => !e.hidden && e.map.meta.imageUrl).map((e) => [
      pathOf(e.map.meta.imageUrl as string),
      e,
    ]),
  );
  const catalogOrder = [...catalog.keys()];
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
  const inBag = new Set(bagMaps.map((m) => m.imgUrl));

  const seen = new Set<string>();
  const list = [...bagMaps, ...builtIn, ...fromCatalog]
    .filter((m) => (seen.has(m.imgUrl) ? false : (seen.add(m.imgUrl), true)))
    .map((m): TableMapOption => {
      const pro = catalog.has(pathOf(m.imgUrl));
      const spaces =
        pro || !!mapSpacesEntry(m.imgUrl) || !!m.layout?.spaces.length;
      const group = pro
        ? "pro"
        : inBag.has(m.imgUrl)
          ? "bag"
          : spaces
            ? "spaces"
            : "image";
      return { ...m, label: titleOf(m), spaces, group };
    })
    .sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  const { pro, bag, spaces, image } = groupMapList(list);
  const catalogIndex = (m: TableMapOption) =>
    catalogOrder.indexOf(pathOf(m.imgUrl));
  pro.sort((a, b) => catalogIndex(a) - catalogIndex(b));
  return [...pro, ...bag, ...spaces, ...image];
};
