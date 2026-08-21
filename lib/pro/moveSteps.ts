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
 * Scope (widened 2026-08-21, issue #654 / engine #411): MANEUVER movement AND
 * card/scheme EFFECT moves. A `CHOOSE_SPACE` move prompt now carries its own
 * `ViewPrompt.moveGraph` in the very same shape, so the same state machine walks
 * it — the only differences live at the call site: the graph comes from the prompt
 * instead of `view.moveGraphs`, the commit is ONE `RESPOND_PROMPT{optionId, path}`
 * instead of a `MOVE_FIGHTER`, and a far one-click commits straight away
 * (`applyClick`'s `commitFarJump`) because that is what an effect-move click has
 * always done. Nothing rules-shaped moved into this module.
 *
 * Scope (widened again 2026-08-21, issue #658 / engine #415): LARGE (two-space)
 * fighters. A LARGE body does not occupy a space, it occupies an ORDERED POSE
 * `(lead, trail)`, and the server ships those as `LargeMoveGraph` — poses instead
 * of nodes, snake-step edges instead of adjacency. Rather than fork the machine,
 * `poseGraph()` folds a `LargeMoveGraph` into the very same `MoveGraph` this file
 * already walks, keying each node `"<lead>|<trail>"`. Everything below is therefore
 * written in terms of a graph NODE, which is a space for a NORMAL mover and a pose
 * for a LARGE one; only four places care about the difference:
 *   - `currentNodes` — a FRESH large preview sits on BOTH orientations of the start
 *     pose at once (picking one is picking which end leads);
 *   - `stepsOntoSpace` — a board click names a SPACE, and one space can be the lead
 *     of more than one legal pose (→ `choosePose`, resolved by a second click);
 *   - `commitPath` — poses collapse back to the LEADING END's path, which is what
 *     both `MOVE_FIGHTER.path` and `RESPOND_PROMPT.path` carry for a LARGE mover;
 *   - `posePathFrom` — a server-canonical LEAD path re-expanded into poses so a far
 *     one-click can still be adopted wholesale.
 * There is no tail choice anywhere: the trail is dragged into the lead's former
 * space, so the pose prompt's "click the second gold space" click disappears.
 */
import type { LargeMoveGraph, MoveGraph, SpaceId } from "./protocol";

/**
 * A graph NODE key. For a NORMAL mover it is simply the space id; for a LARGE
 * mover it is an ordered pose `"<lead>|<trail>"` (see `poseGraph`). Space ids never
 * contain the separator — which is exactly why the engine uses it to key poses —
 * so the two are always tellable apart without a side channel.
 */
export type NodeKey = string;

const POSE_SEP = "|";

/** One ordered body pose of a LARGE fighter: `lead` is the end that moves. */
export interface Pose {
  lead: SpaceId;
  trail: SpaceId;
}

/** The node key for an ordered pose. NOT the prompt's option id — see `poseStopKey`. */
export const poseNode = (lead: SpaceId, trail: SpaceId): NodeKey =>
  `${lead}${POSE_SEP}${trail}`;

/** Parse a node key back into a pose, or null when the node is a plain space. */
export const parsePose = (node: NodeKey): Pose | null => {
  const i = node.indexOf(POSE_SEP);
  if (i <= 0 || i >= node.length - 1) return null;
  return { lead: node.slice(0, i), trail: node.slice(i + 1) };
};

/** The board space a node puts the fighter's *moving* end on (itself, if NORMAL). */
export const leadOf = (node: NodeKey): SpaceId => parsePose(node)?.lead ?? node;

/** Both board spaces a node occupies — one for a NORMAL mover, two for a LARGE one. */
export const spacesOf = (node: NodeKey): SpaceId[] => {
  const p = parsePose(node);
  return p ? [p.lead, p.trail] : [node];
};

/**
 * The ORDER-INDEPENDENT key for a resting pose: the two occupied spaces sorted
 * ascending and joined with `|`. That is the engine's `poseKey` — the id a LARGE
 * move prompt offers its destinations under — so it is how a walked pose is matched
 * against the destinations the effect actually allows (`restrictStops`). A plain
 * space node is its own key.
 */
export const poseStopKey = (node: NodeKey): string => {
  const p = parsePose(node);
  if (!p) return node;
  return p.lead < p.trail ? `${p.lead}${POSE_SEP}${p.trail}` : `${p.trail}${POSE_SEP}${p.lead}`;
};

/**
 * Fold the server's LARGE pose graph (engine #415) into the `MoveGraph` shape this
 * module already walks: one node per ORDERED pose keyed `"<lead>|<trail>"`, one
 * directed edge per legal snake step. Purely a re-encoding — no legality is decided
 * here, exactly as for NORMAL movers.
 */
export const poseGraph = (g: LargeMoveGraph): MoveGraph => ({
  fighter: g.fighter,
  allowance: g.allowance,
  nodes: g.poses.map((p) => ({ space: poseNode(p.lead, p.trail), canStop: p.canStop })),
  edges: g.edges.map(([[fl, ft], [tl, tt]]) => [poseNode(fl, ft), poseNode(tl, tt)]),
});

/** True when this graph's nodes are ordered poses (i.e. it came from `poseGraph`). */
export const isPoseGraph = (g: MoveGraph): boolean =>
  g.nodes.some((n) => parsePose(n.space) !== null);

/**
 * Local stepping state. `path[0]` is always the origin (the fighter's real
 * node); the last element is the current PREVIEW position (where the ghost
 * sits). `path` accumulates every hop, so revisits are preserved verbatim and
 * committed as-is.
 */
export interface StepState {
  origin: NodeKey;
  path: NodeKey[];
}

/**
 * Begin stepping a fighter sitting at `origin` — no hops taken yet. For a LARGE
 * fighter pass `poseNode(headSpace, tailSpace)`: the orientation stored here is
 * only the *canonical* one, because until the first hop lands BOTH orientations are
 * live (the first step is what picks the leading end).
 */
export const startStepping = (origin: NodeKey): StepState => ({ origin, path: [origin] });

/**
 * Narrow a graph's resting places to `allowed` (issue #654). The engine already
 * promises that a prompt graph's `canStop` set IS the prompt's option set, so this
 * is a belt-and-braces projection for the prompt call site: a node stays stoppable
 * only if the prompt actually offers that space as an answer, and traversal (nodes,
 * edges, allowance) is untouched — a space you may walk over but not end on keeps
 * behaving like every other pass-through node. Never widens: a node the graph marks
 * non-stoppable (the mover's own start space) stays non-stoppable.
 *
 * `allowed` holds SPACES for a NORMAL mover and order-independent POSE KEYS (the
 * prompt's own `"<a>|<b>"` option ids, see `poseStopKey`) for a LARGE one: a walked
 * pose and the offered destination name the same two spaces whichever end leads.
 */
export const restrictStops = (g: MoveGraph, allowed: Iterable<string>): MoveGraph => {
  const stops = new Set(allowed);
  return {
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, canStop: n.canStop && stops.has(poseStopKey(n.space)) })),
  };
};

/** Reset the preview back to the origin (full cancel — nothing was ever sent). */
export const cancel = (s: StepState): StepState => ({ origin: s.origin, path: [s.origin] });

/** The ghost's current node (where the next hop starts from). */
export const previewPosition = (s: StepState): NodeKey => s.path[s.path.length - 1];

/** The LARGE body's previewed pose, or null while a NORMAL fighter is stepping. */
export const previewPose = (s: StepState): Pose | null => parsePose(previewPosition(s));

/** Hops taken so far (0 = fresh at the origin). */
export const stepsTaken = (s: StepState): number => s.path.length - 1;

/** True while the preview is still parked on the origin (no hops yet). */
export const isFresh = (s: StepState): boolean => stepsTaken(s) === 0;

/** Steps still available given the graph's allowance and hops already taken. */
export const remaining = (g: MoveGraph, s: StepState): number => g.allowance - stepsTaken(s);

/**
 * May the fighter END its move on `node`? Purely the graph's `canStop` flag —
 * the engine marks empty, non-barred resting places true and everything else
 * (pass-through nodes AND the fighter's own start node) false, because "staying
 * put is END_MANEUVER", not a zero-length MOVE_FIGHTER. For a LARGE mover the same
 * holds pose-wise: a pose whose second space is occupied by another non-small body
 * is traversable but never stoppable. Nodes absent from the graph are never
 * stoppable.
 */
export const canStopAt = (g: MoveGraph, node: NodeKey): boolean => {
  const found = g.nodes.find((n) => n.space === node);
  return !!found && found.canStop;
};

/**
 * The node(s) the next hop may leave from. Normally just the preview position —
 * with ONE exception: a FRESH LARGE preview has not picked a leading end yet, so
 * both orientations of the start pose are live starting points (the engine puts
 * both in `poses`, neither stoppable). Choosing between them IS the first step.
 */
const currentNodes = (g: MoveGraph, s: StepState): NodeKey[] => {
  const pos = previewPosition(s);
  const p = parsePose(pos);
  if (!isFresh(s) || !p) return [pos];
  const has = (n: NodeKey) => g.nodes.some((x) => x.space === n);
  return [pos, poseNode(p.trail, p.lead)].filter(has);
};

/**
 * Nodes the player can reach in ONE hop from the current preview position: the
 * graph's edge-neighbours of that position, offered while budget remains.
 * A hop onto a NON-stoppable node (a pass-through space, or the origin on the way
 * back) is only offered when there is budget left AFTER it to leave again
 * (`remaining ≥ 2`) — so the walk can never strand on a node it may not end on.
 * A stoppable neighbour is always offered while `remaining ≥ 1`. This is what lets
 * the player wander back and forth: the origin re-appears as a step target once
 * you have moved off it (and its own token routes that click to a step-back, see
 * game.tsx). All of it reads only the graph — no client rules.
 */
export const legalNextSteps = (g: MoveGraph, s: StepState): NodeKey[] => {
  const rem = remaining(g, s);
  if (rem <= 0) return [];
  const from = new Set(currentNodes(g, s));
  const isNode = (node: NodeKey) => g.nodes.some((n) => n.space === node);
  const out = new Set<NodeKey>();
  for (const [a, b] of g.edges) {
    if (!from.has(a) || from.has(b) || !isNode(b)) continue;
    if (canStopAt(g, b) || rem >= 2) out.add(b);
  }
  return [...out];
};

/**
 * The legal one-hop nodes whose MOVING end lands on `space` — i.e. what a board
 * click on that space could mean. For a NORMAL mover that is at most the space
 * itself; for a LARGE one a single space can be the lead of TWO poses on the very
 * first hop (the head could lead into it, or the tail could), which is the only
 * genuine ambiguity in the whole walk and is resolved by a second click.
 */
export const stepsOntoSpace = (g: MoveGraph, s: StepState, space: SpaceId): NodeKey[] =>
  legalNextSteps(g, s).filter((n) => leadOf(n) === space);

/** Advance the preview one hop to `node`, or null if that isn't a legal step. */
export const stepTo = (g: MoveGraph, s: StepState, node: NodeKey): StepState | null => {
  if (!legalNextSteps(g, s).includes(node)) return null;
  if (isFresh(s)) {
    // The first LARGE hop also fixes WHICH end led, so rewrite path[0] to the
    // orientation the step actually came from (for a NORMAL mover that is always
    // the origin itself and this is a no-op).
    const from = currentNodes(g, s).find((c) => g.edges.some(([a, b]) => a === c && b === node));
    if (from && from !== previewPosition(s)) return { ...s, path: [from, node] };
  }
  return { ...s, path: [...s.path, node] };
};

/**
 * May the accumulated preview be committed right now? Requires at least one hop
 * (committing zero hops is a no-op — caller should just deselect) AND the
 * preview position to be a legal resting spot.
 */
export const canCommit = (g: MoveGraph, s: StepState): boolean =>
  stepsTaken(s) > 0 && canStopAt(g, previewPosition(s));

/**
 * The full path to submit as `MOVE_FIGHTER.path` / `RESPOND_PROMPT.path` (origin as
 * `path[0]`). A LARGE walk's nodes are poses, and what the wire carries is the
 * LEADING END's route — the engine reads the final pose off its last two entries —
 * so poses collapse to their leads here.
 */
export const commitPath = (s: StepState): SpaceId[] => s.path.map(leadOf);

/**
 * The TRAILING end's route through the same walk — `null` for a NORMAL mover, which
 * has none. Nothing on the wire carries it (the engine derives the whole body from
 * the leading end); it exists so the board can move a two-space body as ONE thing:
 * the trail is always one space behind, having been dragged into the lead's former
 * space, and it starts on the body's other space.
 */
export const commitTrailPath = (s: StepState): SpaceId[] | null =>
  parsePose(s.path[0]) ? s.path.map((n) => parsePose(n)?.trail ?? n) : null;

/**
 * Re-expand a server-canonical LEADING-END path into the pose nodes it walks, so a
 * far one-click can be adopted wholesale. `lead[0]` must be one of the body's two
 * spaces (the other becomes the first trail); every derived pose and every step
 * between them must exist in the graph, otherwise the path is not one this graph
 * sanctions and we refuse it rather than guessing.
 */
const posePathFrom = (g: MoveGraph, s: StepState, lead: SpaceId[]): NodeKey[] | null => {
  const start = parsePose(s.origin);
  if (!start || lead.length === 0) return null;
  const firstTrail =
    lead[0] === start.lead ? start.trail : lead[0] === start.trail ? start.lead : null;
  if (firstTrail === null) return null;
  const nodes = [poseNode(lead[0], firstTrail)];
  for (let i = 1; i < lead.length; i++) nodes.push(poseNode(lead[i], lead[i - 1]));
  const isNode = (n: NodeKey) => g.nodes.some((x) => x.space === n);
  if (!nodes.every(isNode)) return null;
  for (let i = 1; i < nodes.length; i++) {
    if (!g.edges.some(([a, b]) => a === nodes[i - 1] && b === nodes[i])) return null;
  }
  return nodes;
};

/**
 * Resolve a board click during stepping into the next state.
 *
 * - A one-hop neighbour of the preview position → advance the preview (`step`).
 *   If that hop spends the last of the allowance the move auto-commits (matches
 *   "picking a max-distance space commits" — you simply reached max by stepping).
 * - A LARGE first hop that could be led by EITHER end → `choosePose`: the caller
 *   lights up the candidate poses' trail spaces and a second click picks one.
 * - A FAR reachable destination clicked while still FRESH → keep today's
 *   one-click behaviour: adopt the server's canonical path to it. If it lands on
 *   0 remaining it commits at once (exactly as today); if it leaves budget the
 *   preview continues from there (the player may keep stepping or stay). When a
 *   LARGE destination space is offered under SEVERAL final poses, that is again a
 *   `choosePose` — the click cannot say which body orientation was meant.
 * - Anything else → `ignore` (the caller does nothing / falls through).
 *
 * Far jumps are only honoured from a fresh preview because the canonical path is
 * the server's — once the player has stepped, only one-hop moves keep the client
 * rules-free (no client pathfinding from a mid-walk position).
 */
export type StepResult =
  | { type: "step"; state: StepState; commit: boolean }
  | { type: "choosePose"; options: PoseChoice[] }
  | { type: "ignore" };

/** One candidate reading of an ambiguous LARGE click — pick by its `pose.trail`. */
export interface PoseChoice {
  pose: Pose;
  state: StepState;
  commit: boolean;
}

export interface ClickOptions {
  /**
   * Commit a FAR one-click immediately, even with budget left over (issue #654).
   * Effect/scheme move prompts pass this: clicking a far offered destination has
   * always answered the prompt on the spot, and #654 keeps that — only the near
   * (one-hop) clicks become a walk. A maneuver leaves it off, so a far click there
   * still lands the preview and lets the player keep stepping.
   */
  commitFarJump?: boolean;
}

/** Turn candidate next states into a step / a pose pick / nothing. */
const resolveCandidates = (
  candidates: { state: StepState; commit: boolean }[]
): StepResult => {
  if (candidates.length === 0) return { type: "ignore" };
  if (candidates.length === 1) return { type: "step", ...candidates[0] };
  const options: PoseChoice[] = [];
  for (const c of candidates) {
    const pose = previewPose(c.state);
    if (pose) options.push({ pose, ...c });
  }
  return options.length > 1 ? { type: "choosePose", options } : { type: "ignore" };
};

export const applyClick = (
  g: MoveGraph,
  s: StepState,
  space: SpaceId,
  /** The server-enumerated canonical path(s) to `space` from the origin, if the server
   *  offered a direct move/answer there; null otherwise. A LARGE destination space may
   *  be offered under several final poses, so several paths may be passed. */
  canonicalPathFromOrigin: SpaceId[] | SpaceId[][] | null,
  opts: ClickOptions = {}
): StepResult => {
  const near = stepsOntoSpace(g, s, space).flatMap((node) => {
    const state = stepTo(g, s, node);
    return state ? [{ state, commit: remaining(g, state) <= 0 }] : [];
  });
  if (near.length > 0) return resolveCandidates(near);

  if (!isFresh(s) || spacesOf(s.origin).includes(space) || !canonicalPathFromOrigin) {
    return { type: "ignore" };
  }
  const raws: SpaceId[][] = Array.isArray(canonicalPathFromOrigin[0])
    ? (canonicalPathFromOrigin as SpaceId[][])
    : [canonicalPathFromOrigin as SpaceId[]];
  const large = parsePose(s.origin) !== null;
  const seen = new Set<NodeKey>();
  const far: { state: StepState; commit: boolean }[] = [];
  for (const raw of raws) {
    if (raw.length === 0 || raw[raw.length - 1] !== space) continue;
    // A LARGE path may start from EITHER body space and the server need not repeat
    // the start; when it is missing we try both ends and keep whichever the graph
    // sanctions (both ⇒ a genuine ambiguity, resolved by a second click).
    const leads: SpaceId[][] = large
      ? spacesOf(s.origin).includes(raw[0])
        ? [raw]
        : spacesOf(s.origin).map((body) => [body, ...raw])
      : [raw[0] === s.origin ? [...raw] : [s.origin, ...raw]];
    for (const lead of leads) {
      if (lead.length - 1 > g.allowance) continue;
      const path = large ? posePathFrom(g, s, lead) : lead;
      if (!path) continue;
      const end = path[path.length - 1];
      if (!canStopAt(g, end) || seen.has(end)) continue;
      seen.add(end);
      const state: StepState = { origin: s.origin, path };
      far.push({ state, commit: opts.commitFarJump === true || remaining(g, state) <= 0 });
    }
  }
  return resolveCandidates(far);
};
