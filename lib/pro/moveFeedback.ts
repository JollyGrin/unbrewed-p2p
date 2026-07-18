/**
 * moveFeedback.ts — legibility for card-effect MOVE prompts (issue #412).
 *
 * A `CHOOSE_SPACE` move prompt (e.g. Baba Yaga's Skirmish, "move up to 2
 * spaces") offers only the spaces the engine deems reachable. Two gaps read as
 * bugs to the player:
 *
 *  1. The step BUDGET wasn't obviously stated, so "why can't I go there?" had no
 *     answer on screen. The budget rides in `ViewPrompt.description` (protocol
 *     `description` — "op verb + amount", e.g. "Move up to 2 spaces"); these
 *     helpers surface it and give a move-shaped fallback if a server omits it.
 *  2. Tapping a visible-but-unofferable space did NOTHING (issue #326: a LARGE
 *     King Kong can't fit through the Hut's occupied-anchor portal on 2
 *     movement). Silence read as "the game is broken". `unofferableMoveFeedback`
 *     turns that tap into a lightweight, honest explanation.
 *
 * Pure + engine-free: we never recompute pathing here. A generic "not reachable"
 * is always correct; the richer LARGE-into-region copy only fires when the data
 * is already in hand (a pose prompt + the tapped space's region id).
 */
import type { SpaceId, ViewPrompt } from "./protocol";

/** The move op's verb as it appears in the mechanical `description` summary. */
const MOVE_VERB = /\bmove\b/i;

/**
 * Is this the viewer's active *move* prompt? A LARGE mover's two-space pose
 * prompt is always a move (`largeMover`); otherwise we trust the mechanical
 * description's "move" verb, so placement / token `CHOOSE_SPACE` prompts (which
 * carry no move verb, or no description at all) are left untouched.
 */
export const isMovePrompt = (
  prompt: ViewPrompt | null,
  largeMover: boolean,
): boolean => {
  if (!prompt || prompt.kind !== "CHOOSE_SPACE") return false;
  return largeMover || MOVE_VERB.test(prompt.description ?? "");
};

/**
 * The budget line to show on a move prompt, or null when the prompt isn't a
 * move. Prefers the server's mechanical summary (which states the budget, e.g.
 * "Move up to 2 spaces") and falls back to a move-shaped line if a server omits
 * it, so a move prompt is never left budget-less/ambiguous.
 */
export const moveBudgetLine = (
  prompt: ViewPrompt | null,
  largeMover: boolean,
): string | null => {
  if (!isMovePrompt(prompt, largeMover)) return null;
  const desc = prompt?.description?.trim();
  return desc && desc.length > 0 ? desc : "Choose where to move.";
};

export interface MoveTapContext {
  /** the active prompt for this viewer, or null */
  prompt: ViewPrompt | null;
  /** the tapped space id */
  space: SpaceId;
  /** every space currently offered as a destination (single-space + pose ends) */
  offeredSpaces: Set<SpaceId>;
  /** true when the mover is LARGE (a two-space pose prompt is open) */
  largeMover: boolean;
  /** region id of the tapped space, if any (a region = Hut-style inset portal) */
  spaceRegion?: string | null;
}

/**
 * Message to surface when a player taps a space during a move prompt. Returns
 * null when the tap should stay a no-op — the prompt isn't a move, or the space
 * is actually offered (handled by the normal answer path). Never recomputes
 * engine pathing: a generic "not reachable" is always honest; the LARGE-mover
 * region copy only sharpens it where the data is already at hand.
 */
export const unofferableMoveFeedback = (ctx: MoveTapContext): string | null => {
  if (!isMovePrompt(ctx.prompt, ctx.largeMover)) return null;
  if (ctx.offeredSpaces.has(ctx.space)) return null;
  if (ctx.largeMover && ctx.spaceRegion) {
    return "A large fighter needs more movement to fit inside.";
  }
  return "Not reachable with this move.";
};
