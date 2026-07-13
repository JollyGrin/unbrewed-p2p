/**
 * moveSteps.ts — pure, rules-free state machine for INCREMENTAL maneuver
 * movement (issue #285, PAIRED with engine #55).
 *
 * Player feedback (Inforce): moving back and forth must count as movement
 * (Tomoe, John Henry, path-sensitive effects). Today a single click on a
 * reachable destination spends the whole maneuver allowance along a canonical
 * shortest path. Here the player steps ONE space at a time as a LOCAL preview
 * (ghost token; nothing sent per step). On commit the client submits ONE
 * `MOVE_FIGHTER{fighter, path}` with the full accumulated path — the engine
 * already accepts arbitrary legal paths, revisits included (validated
 * server-side), so back-and-forth wandering is a single decision / single undo
 * unit and the opponent sees one multi-hop tween.
 *
 * Every legality decision is derived from the server's `MoveGraph` (protocol.ts,
 * synced from engine #55): the client owns ZERO rules — no BFS, no occupancy, no
 * edge derivation. This module is the stepping bookkeeping ONLY; `game.tsx` wires
 * it to clicks and the ghost, exactly like `moveChoice.ts` backs the pose picker.
 *
 * Scope: MANEUVER movement only. Effect/scheme moves (CHOOSE_SPACE prompts) are
 * teleports and keep their single-click behaviour — they never reach this module.
 */
import type { MoveGraph, SpaceId } from "./protocol";

/**
 * Local stepping state. `path[0]` is always the origin (the fighter's real
 * space); the last element is the current PREVIEW position (where the ghost
 * sits). `path` accumulates every hop, so revisits are preserved verbatim and
 * committed as-is.
 */
export interface StepState {
  origin: SpaceId;
  path: SpaceId[];
}

/** Begin stepping a fighter sitting at `origin` — no hops taken yet. */
export const startStepping = (origin: SpaceId): StepState => ({ origin, path: [origin] });

/** Reset the preview back to the origin (full cancel — nothing was ever sent). */
export const cancel = (s: StepState): StepState => ({ origin: s.origin, path: [s.origin] });

/** The ghost's current space (where the next hop starts from). */
export const previewPosition = (s: StepState): SpaceId => s.path[s.path.length - 1];

/** Hops taken so far (0 = fresh at the origin). */
export const stepsTaken = (s: StepState): number => s.path.length - 1;

/** True while the preview is still parked on the origin (no hops yet). */
export const isFresh = (s: StepState): boolean => stepsTaken(s) === 0;

/** Steps still available given the graph's allowance and hops already taken. */
export const remaining = (g: MoveGraph, s: StepState): number => g.allowance - stepsTaken(s);

/**
 * May the fighter END its move on `space`? The origin is ALWAYS stoppable
 * (returning there is a legal no-op / revisit); every other space follows its
 * node's `canStop` flag. Spaces absent from the graph are never stoppable.
 */
export const canStopAt = (g: MoveGraph, origin: SpaceId, space: SpaceId): boolean => {
  if (space === origin) return true;
  const node = g.nodes.find((n) => n.space === space);
  return !!node && node.canStop;
};

/**
 * Spaces the player can click to take ONE hop from the current preview position.
 * These are the graph's edge-neighbours of the preview position that are legal
 * resting spots (`canStop`), offered only while budget remains. Restricting
 * clickable hops to stoppable spaces keeps the "select fighter vs step onto its
 * space" ambiguity (#185) out of the common case — step targets are empty, so no
 * token sits on them. (Passing THROUGH a non-stoppable friendly space is reached
 * via the fresh far-click canonical path, not by stepping.)
 */
export const legalNextSteps = (g: MoveGraph, s: StepState): SpaceId[] => {
  if (remaining(g, s) <= 0) return [];
  const pos = previewPosition(s);
  const out = new Set<SpaceId>();
  for (const [a, b] of g.edges) {
    if (a !== pos || b === pos) continue;
    if (canStopAt(g, s.origin, b)) out.add(b);
  }
  return [...out];
};

/** Advance the preview one hop to `space`, or null if that isn't a legal step. */
export const stepTo = (g: MoveGraph, s: StepState, space: SpaceId): StepState | null =>
  legalNextSteps(g, s).includes(space) ? { ...s, path: [...s.path, space] } : null;

/**
 * May the accumulated preview be committed right now? Requires at least one hop
 * (committing zero hops is a no-op — caller should just deselect) AND the
 * preview position to be a legal resting spot.
 */
export const canCommit = (g: MoveGraph, s: StepState): boolean =>
  stepsTaken(s) > 0 && canStopAt(g, s.origin, previewPosition(s));

/** The full path to submit as `MOVE_FIGHTER.path` (origin as `path[0]`). */
export const commitPath = (s: StepState): SpaceId[] => [...s.path];

/**
 * Resolve a board click during stepping into the next state.
 *
 * - A one-hop neighbour of the preview position → advance the preview (`step`).
 *   If that hop spends the last of the allowance the move auto-commits (matches
 *   "picking a max-distance space commits" — you simply reached max by stepping).
 * - A FAR reachable destination clicked while still FRESH → keep today's
 *   one-click behaviour: adopt the server's canonical path to it. If it lands on
 *   0 remaining it commits at once (exactly as today); if it leaves budget the
 *   preview continues from there (the player may keep stepping or stay).
 * - Anything else → `ignore` (the caller does nothing / falls through).
 *
 * Far jumps are only honoured from a fresh preview because the canonical path is
 * the server's — once the player has stepped, only one-hop moves keep the client
 * rules-free (no client pathfinding from a mid-walk position).
 */
export type StepResult =
  | { type: "step"; state: StepState; commit: boolean }
  | { type: "ignore" };

export const applyClick = (
  g: MoveGraph,
  s: StepState,
  space: SpaceId,
  /** The server-enumerated MOVE_FIGHTER path to `space` from the origin, if the
   *  server offered a direct move there; null otherwise. */
  canonicalPathFromOrigin: SpaceId[] | null,
): StepResult => {
  const stepped = stepTo(g, s, space);
  if (stepped) return { type: "step", state: stepped, commit: remaining(g, stepped) <= 0 };

  if (isFresh(s) && space !== s.origin && canonicalPathFromOrigin && canonicalPathFromOrigin.length > 0) {
    const raw = canonicalPathFromOrigin;
    const path = raw[0] === s.origin ? [...raw] : [s.origin, ...raw];
    if (path[path.length - 1] !== space) return { type: "ignore" };
    if (path.length - 1 > g.allowance) return { type: "ignore" };
    const state: StepState = { origin: s.origin, path };
    return { type: "step", state, commit: remaining(g, state) <= 0 };
  }
  return { type: "ignore" };
};
