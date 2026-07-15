/**
 * Board-move click resolution (issue #320 follow-up). A move-target space can be
 * reachable by MORE THAN ONE of your fighters (hero + sidekick), and the old
 * resolver silently committed `candidates[0]` — often the wrong fighter, with no
 * on-screen cue. This pure helper classifies a space's server-offered actions so
 * the caller can either commit the single unambiguous action or open a
 * fighter chooser instead of guessing.
 *
 * PRESENTATION/UX ONLY — it re-partitions actions the server already offered and
 * never invents or re-checks legality.
 */
import { Action, FighterId } from "./protocol";

export type SpaceMoveResolution =
  /** no actionable move/place here for the current selection */
  | { kind: "none" }
  /** exactly one thing to do — send it verbatim */
  | { kind: "commit"; action: Action }
  /** several of your fighters can move here — ask which one */
  | { kind: "choose"; candidates: FighterId[] };

/**
 * Classify the actions offered at one space. When `selectedFighter` is set, moves
 * are pre-narrowed to that fighter (non-move actions like PLACE_SIDEKICK always
 * pass through), so a pre-selection resolves to a direct commit. With nothing
 * selected, a space reachable by two-or-more distinct fighters is `choose`; a
 * single-owner space (or a lone place action) is `commit`.
 */
export function resolveSpaceMove(
  actions: Action[],
  selectedFighter: FighterId | null
): SpaceMoveResolution {
  const applicable = selectedFighter
    ? actions.filter((a) => a.type !== "MOVE_FIGHTER" || a.fighter === selectedFighter)
    : actions;
  if (applicable.length === 0) return { kind: "none" };
  const moveFighters = [
    ...new Set(applicable.flatMap((a) => (a.type === "MOVE_FIGHTER" ? [a.fighter] : []))),
  ];
  if (moveFighters.length > 1) return { kind: "choose", candidates: moveFighters };
  return { kind: "commit", action: applicable[0] };
}
