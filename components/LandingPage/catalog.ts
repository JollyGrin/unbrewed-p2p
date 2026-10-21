/**
 * Build-time catalog facts for the landing page (unbrewed-p2p-1353).
 *
 * Imported only from `getStaticProps` in pages/index.tsx, so the Pro board
 * fixtures (~150 KB of map JSON) and the sandbox map list are read at build
 * time and never ship in the `/` client bundle — only the few facts the page
 * prints do, as props.
 */
import DEFAULT_MAPS from "@/components/Bag/Map/MapModal/defaultMaps.json";
import { MAP_CATALOG } from "@/lib/pro/mapCatalog";

export interface ShowcaseMap {
  title: string;
  thumbUrl: string;
}

export interface LandingCatalog {
  /** Titles of the boards in Pro's board picker (hidden dev boards excluded). */
  proBoards: string[];
  /** Bundled sandbox maps (the bag's map picker). Any image URL works on top. */
  sandboxMapCount: number;
  /** A few community/legacy boards shown by thumbnail. */
  showcaseMaps: ShowcaseMap[];
}

const SHOWCASE_MAP_URLS = [
  "/maps/community-altar-119.webp",
  "/maps/community-city-docks-85.webp",
  "/maps/legacy-counts-castle.webp",
];

export const buildLandingCatalog = (): LandingCatalog => ({
  proBoards: MAP_CATALOG.filter((entry) => !entry.hidden).map((entry) => entry.title),
  sandboxMapCount: DEFAULT_MAPS.length,
  showcaseMaps: SHOWCASE_MAP_URLS.flatMap((url) =>
    DEFAULT_MAPS.filter((map) => map.imgUrl === url).map((map) => ({
      title: map.meta.title,
      thumbUrl: map.thumbUrl,
    })),
  ),
});
