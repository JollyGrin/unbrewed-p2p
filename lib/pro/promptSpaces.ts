/**
 * CHOOSE_SPACE prompt-option → board mapping (issue #553).
 *
 * The board answers a CHOOSE_SPACE prompt by lighting up spaces and sending the
 * option id for the space you click. That needed a `space -> optionId` map, and the
 * map was built with a comment justifying itself: *"tokens never share a space, so
 * this can't collide."*
 *
 * Protocol v26 retired that. Board objects stopped participating in occupancy, so a
 * `destroyToken` prompt offers ONE OPTION PER OBJECT and labels each with its
 * object's space — two corpses on one space produce two options reading `"a3"`.
 * v28 makes it routine rather than exotic: four SMALL Larrys can stand on one space
 * and die there, so up to four options can name the same space.
 *
 * The old `Map<space, optionId>` silently kept the LAST colliding option. The
 * dropped one became unclickable on the board, and (because the board-answered set
 * is what the panel filters out) it was stranded in the sidebar under a label
 * identical to its twin's. This module keeps EVERY option and hands the caller two
 * views:
 *
 *  - `bySpace` — the full list per space, for highlighting.
 *  - `unambiguous` — only the spaces holding exactly one option, the ones a click
 *    can answer without guessing. Everything else routes to the panel, where the
 *    options can be labelled apart.
 *
 * A click cannot express "the corpse with one turn left rather than the one with
 * three", so it must not pick for you.
 *
 * PRESENTATION ONLY — this re-partitions options the server already offered.
 */

/** The subset of a `LegalOption` this needs. */
export interface SpaceOption {
  id: string;
  label: string;
  data?: unknown;
}

export interface PromptSpaceMap {
  /** space -> every option id naming it, in server order. */
  bySpace: Map<string, string[]>;
  /** space -> the single option id naming it. Board clicks answer from here ONLY. */
  unambiguous: Map<string, string>;
  /** Option ids a board click can answer — used to keep them out of the panel. */
  boardAnswerable: Set<string>;
}

/**
 * Build the map. `resolveSpace` is the caller's option→space resolver (it knows the
 * real space ids); returning null means "not a space option" and the option is left
 * entirely alone, which is how card/branch/sentinel options keep their panel button.
 */
export const buildPromptSpaceMap = (
  options: readonly SpaceOption[],
  resolveSpace: (option: SpaceOption) => string | null
): PromptSpaceMap => {
  const bySpace = new Map<string, string[]>();
  for (const o of options) {
    const space = resolveSpace(o);
    if (!space) continue;
    bySpace.set(space, [...(bySpace.get(space) ?? []), o.id]);
  }
  const unambiguous = new Map<string, string>();
  for (const [space, ids] of bySpace) if (ids.length === 1) unambiguous.set(space, ids[0]);
  return { bySpace, unambiguous, boardAnswerable: new Set(unambiguous.values()) };
};
