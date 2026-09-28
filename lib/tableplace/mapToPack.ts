import type { PackOverlay, TbppPack } from "./types";

/** The felt, per tableplace-api: x ∈ [-30, 30], z ∈ [-15, 15]. */
export const FELT_HALF_X = 30;
export const FELT_HALF_Z = 15;

export type TableMap = { imageUrl: string; width: number; height: number };

/**
 * A table-scoped pack carrying one board overlay. table.place's `scale` is the
 * overlay's world HEIGHT (the plane is `ratio × 1`, scaled), so the largest
 * that keeps the whole image on the felt is min(felt height, felt width / ratio). The API auto-centres a single table overlay, so no placement is needed.
 */
export const mapToTablePack = (
  map: TableMap,
  id = "unbrewed-map",
): TbppPack => {
  const ratio = map.width / map.height;
  const scale = Math.min(FELT_HALF_Z * 2, (FELT_HALF_X * 2) / ratio);
  const overlay: PackOverlay = {
    imageUrl: map.imageUrl,
    ratio,
    scale: Math.round(scale * 100) / 100,
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
