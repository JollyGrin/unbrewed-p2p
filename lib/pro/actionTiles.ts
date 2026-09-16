/**
 * The three core turn actions as big tiles in the phone action sheet (mobile
 * step 2): Maneuver, Scheme and Attack. Every other legal row (items, boosts,
 * ending a move) stays in the plain list under the tiles.
 */
import type { Action } from "./protocol";

export type TileKind = "maneuver" | "scheme" | "attack";

export interface ActionTile {
  kind: TileKind;
  /** the legal actions this tile stands for; empty = shown disabled */
  actions: Action[];
}

const TILE_ORDER: TileKind[] = ["maneuver", "scheme", "attack"];

export function tileKindOf(action: Action): TileKind | null {
  switch (action.type) {
    case "MANEUVER":
      return "maneuver";
    case "SCHEME":
      return "scheme";
    case "DECLARE_ATTACK":
      return "attack";
    default:
      return null;
  }
}

/** Tiles only make sense at the start of an action: with no core action legal
 *  (mid-maneuver, mid-combat) there are none, so the list shows as before. */
export function actionTilesFor(actions: Action[]): ActionTile[] {
  if (!actions.some((action) => tileKindOf(action) !== null)) return [];
  return TILE_ORDER.map((kind) => ({ kind, actions: actions.filter((action) => tileKindOf(action) === kind) }));
}
