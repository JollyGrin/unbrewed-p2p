/**
 * Dock-armed relocation clicks (engine #535; p2p #747 review).
 *
 * A maneuver-origin relocation is a FREE teleport (engine/turn.ts writes the
 * space, spends no step, records the fighter in `maneuver.relocated` — never in
 * `maneuver.moved`), so an adjacent origin plus a full walk is a real option the
 * board must never guess away. Per Dean's ruling `legalActions` stays the single
 * source of truth, and the bare board click is left EXACTLY as it is on main:
 * the mode is armed from one synthetic dock row ("Start maneuver elsewhere"),
 * and only while armed may a board click resolve to a RELOCATE_FIGHTER.
 *
 * Pure and view-independent so the page's `onSpaceClick` stays a three-line
 * dispatch and both rulings are unit-pinned here.
 */
import { Action, SpaceId } from "./protocol";

export type RelocateBoardClick =
  /** send exactly this offered action, then disarm the mode */
  | { kind: "relocate"; action: Action }
  /** armed, but the space is not an offered origin: the click does nothing —
   *  while armed the dashed origins are the only clickable spaces */
  | { kind: "ignored" }
  /** unarmed: fall through to the board's ordinary behavior (far-preview,
   *  stepping, pose picks) — a relocation is never sent */
  | { kind: "board" };

export const resolveRelocateBoardClick = (opts: {
  armed: boolean;
  space: SpaceId;
  /** the RELOCATE_FIGHTER offers for the selected fighter, by origin space */
  originActions: Map<SpaceId, Action>;
}): RelocateBoardClick => {
  // Unarmed, even a space that is BOTH a gold step destination and a relocation
  // origin answers as the ordinary move — the dashed pick simply doesn't exist.
  if (!opts.armed) return { kind: "board" };
  const action = opts.originActions.get(opts.space);
  return action ? { kind: "relocate", action } : { kind: "ignored" };
};
