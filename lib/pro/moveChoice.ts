/**
 * moveChoice.ts — turn a two-space (LARGE fighter) MOVE choice into clickable
 * board spaces (issue #132).
 *
 * When a LARGE fighter (e.g. Triceratops) is told to "move up to N spaces" by a
 * card effect — DASH's after-move — the server emits a CHOOSE_SPACE prompt whose
 * every option is a DESTINATION POSE: the two adjacent spaces the fighter will
 * occupy, encoded in the option label/id as "<head>|<tail>" (e.g. "s12|s13").
 *
 * game.tsx's single-space resolver can't map "s12|s13" onto a board space, so
 * before this the whole option set fell through to opaque sidebar buttons and NO
 * gold circles were drawn — the player saw a wall of "s12|s13" text and couldn't
 * tell where a move led. Here we parse those pairs so the board can highlight the
 * reachable spaces and a two-tap gesture (anchor space -> partner space) picks
 * the exact pose, sending the server's own option id verbatim.
 */
import type { SpaceId, ViewPrompt } from "./protocol";

/** Separator the server uses between the two spaces of a pose option. */
const POSE_SEP = "|";

export interface PoseOption {
  /** the RESPOND_PROMPT option id to send when this pose is chosen */
  optionId: string;
  /** the two board spaces the fighter would occupy (server order) */
  spaces: [SpaceId, SpaceId];
}

const parsePair = (raw: string, mapSpaceIds: Set<SpaceId>): [SpaceId, SpaceId] | null => {
  const parts = raw.split(POSE_SEP).map((p) => p.trim());
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === b || !mapSpaceIds.has(a) || !mapSpaceIds.has(b)) return null;
  return [a, b];
};

/**
 * Parse a CHOOSE_SPACE prompt's two-space pose options. Returns [] for any
 * prompt that isn't CHOOSE_SPACE or whose options aren't "<space>|<space>"
 * pairs — so single-space CHOOSE_SPACE prompts (placement, token ops) are left
 * entirely to game.tsx's existing single-space resolver.
 */
export const parsePoseOptions = (
  prompt: ViewPrompt | null,
  mapSpaceIds: Set<SpaceId>,
): PoseOption[] => {
  if (!prompt || prompt.kind !== "CHOOSE_SPACE") return [];
  const poses: PoseOption[] = [];
  for (const o of prompt.options) {
    // Trust the label first (that's what the sidebar showed as "s12|s13"); fall
    // back to the id so the parse survives if the server only pairs it there.
    const pair = parsePair(o.label, mapSpaceIds) ?? parsePair(o.id, mapSpaceIds);
    if (pair) poses.push({ optionId: o.id, spaces: pair });
  }
  return poses;
};

/** Order-independent key so {a,b} and {b,a} resolve to the same pose. */
const pairKey = (a: SpaceId, b: SpaceId) =>
  a < b ? `${a}${POSE_SEP}${b}` : `${b}${POSE_SEP}${a}`;

/**
 * Index over pose options for the board interaction. Pairs are treated as
 * unordered — the player may tap either end first.
 */
export interface PoseIndex {
  /** every space that is part of some pose (what the board highlights) */
  spaces: Set<SpaceId>;
  /** spaces that complete a pose with `space` (empty if none touch it) */
  partnersOf: (space: SpaceId) => SpaceId[];
  /** the server option id for the pose {a,b}, or null if that pair isn't offered */
  optionFor: (a: SpaceId, b: SpaceId) => string | null;
  /** number of pose options (0 = not a pose prompt) */
  size: number;
}

export const buildPoseIndex = (poses: PoseOption[]): PoseIndex => {
  const spaces = new Set<SpaceId>();
  const partners = new Map<SpaceId, Set<SpaceId>>();
  const byPair = new Map<string, string>();
  const link = (x: SpaceId, y: SpaceId) => {
    spaces.add(x);
    const set = partners.get(x) ?? new Set<SpaceId>();
    set.add(y);
    partners.set(x, set);
  };
  for (const {
    optionId,
    spaces: [a, b],
  } of poses) {
    link(a, b);
    link(b, a);
    byPair.set(pairKey(a, b), optionId);
  }
  return {
    spaces,
    partnersOf: (space) => [...(partners.get(space) ?? [])],
    optionFor: (a, b) => byPair.get(pairKey(a, b)) ?? null,
    size: poses.length,
  };
};

/** Spaces the board should highlight given the current anchor (2-tap state). */
export const poseHighlights = (index: PoseIndex, anchor: SpaceId | null): SpaceId[] => {
  if (anchor === null) return [...index.spaces];
  // Stage 2: the anchor itself (tap again to cancel) plus its completing spaces.
  return [anchor, ...index.partnersOf(anchor)];
};

export type PoseClick =
  | { type: "commit"; optionId: string } // send RESPOND_PROMPT with this option
  | { type: "anchor"; space: SpaceId } // remember this space, await the partner tap
  | { type: "cancel" } // clear the anchor
  | { type: "ignore" }; // tap wasn't on a pose space — caller does nothing

/**
 * Pure state machine for the two-tap pose pick. `anchor` is the space tapped
 * first (null = fresh). A space that uniquely completes a single pose commits on
 * the first tap; an ambiguous space becomes the anchor and its partners light up.
 */
export const resolvePoseClick = (
  index: PoseIndex,
  anchor: SpaceId | null,
  space: SpaceId,
): PoseClick => {
  if (anchor === null) {
    const partners = index.partnersOf(space);
    if (partners.length === 0) return { type: "ignore" };
    if (partners.length === 1) {
      const optionId = index.optionFor(space, partners[0]);
      return optionId ? { type: "commit", optionId } : { type: "ignore" };
    }
    return { type: "anchor", space };
  }
  if (space === anchor) return { type: "cancel" };
  const optionId = index.optionFor(anchor, space);
  if (optionId) return { type: "commit", optionId };
  // Tapped a different pose space — re-anchor there (or commit if unambiguous).
  return resolvePoseClick(index, null, space);
};
