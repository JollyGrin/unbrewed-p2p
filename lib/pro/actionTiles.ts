/**
 * The three core turn actions as big tiles in the phone action sheet (mobile
 * step 2): Maneuver, Scheme and Attack. Every other legal row (items, boosts,
 * ending a move) stays in the plain list under the tiles.
 *
 * A free activated hero ability (`USE_ABILITY`, protocol v41) is NOT one of the
 * three: it costs no action, so it never becomes an action tile. It stands
 * beside them as a bonus button instead (`abilityActionsOf`).
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

export type AbilityAction = Extract<Action, { type: "USE_ABILITY" }>;

/** The free abilities on offer, in the server's order: one bonus button each. */
export const abilityActionsOf = (actions: Action[]): AbilityAction[] =>
  actions.filter((action): action is AbilityAction => action.type === "USE_ABILITY");

/** Tiles only make sense at the start of an action: with no core action legal
 *  (mid-maneuver, mid-combat) there are none, so the list shows as before. */
export function actionTilesFor(actions: Action[]): ActionTile[] {
  if (!actions.some((action) => tileKindOf(action) !== null)) return [];
  return TILE_ORDER.map((kind) => ({ kind, actions: actions.filter((action) => tileKindOf(action) === kind) }));
}
