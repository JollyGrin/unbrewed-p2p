import { absoluteUrl } from "./deckToPack";
import { mapSize } from "./layout";
import type { PackOverlay, TbppPack } from "./types";

export { FELT_HALF_X, FELT_HALF_Z } from "./layout";

export type TableMap = { imageUrl: string; width: number; height: number };

/**
 * A table-scoped pack carrying one board overlay. table.place's `scale` is the
 * overlay's world HEIGHT (its z extent; width = ratio × scale), sized by
 * `mapSize` to leave the front strips and player areas clear. The API
 * auto-centres a single table overlay, so no placement is needed.
 */
export const mapToTablePack = (
  map: TableMap,
  id = "unbrewed-map",
): TbppPack => {
  const ratio = map.width / map.height;
  const overlay: PackOverlay = {
    imageUrl: absoluteUrl(map.imageUrl),
    ratio,
    scale: Math.round(mapSize(ratio).height * 100) / 100,
  };
  return {
    tbpp: 1,
    specVersion: "1.0.0",
    id,
    name: "Unbrewed map",
    scope: "table",
    decks: [],
    overlays: [overlay],
  };
};
