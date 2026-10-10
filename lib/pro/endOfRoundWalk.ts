import type { GameEvent, PlayerView, ViewInitiativeCard } from "./protocol";
import { endOfRoundResolvingId } from "./adventureBoard";

/** The boxes one batch resolved. */
export interface EndOfRoundStep {
  /** the view whose row holds the boxes (pre-batch for a finished round) */
  view: PlayerView;
  cards: ViewInitiativeCard[];
}

const boxes = (view: PlayerView): ViewInitiativeCard[] =>
  view.initiative?.row.filter((c) => !c.faceDown && c.endOfRound) ?? [];

/** Index after the box `prev` was parked on (0 when it was not mid-walk). */
const resumeFrom = (prev: PlayerView, row: ViewInitiativeCard[]): number => {
  const parked = endOfRoundResolvingId(prev);
  const i = parked ? row.findIndex((c) => c.id === parked) : -1;
  return i + 1;
};

/**
 * The END OF ROUND walk as the table sees it (#1149): the row resolves left to right, one
 * printed box at a time. The engine runs every box that does not prompt inside ONE batch (the
 * view never shows those steps), so this reads which boxes a batch resolved from the pre- and
 * post-batch views:
 *
 * - a batch that ENDED the round (ROUND_ENDED) resolved the pre-batch row's boxes — after the
 *   one it was parked on, when it resumed a parked walk;
 * - a batch that PARKED mid-walk (post-batch phase END_OF_ROUND) resolved the boxes up to and
 *   including the one now prompting.
 *
 * Returns the resolved row cards, left to right (with the view they were read from); null for
 * every other batch and for a first view (join / reconnect: nothing was witnessed).
 */
export const endOfRoundSteps = (
  prev: PlayerView | null,
  next: PlayerView,
  events: readonly GameEvent[],
): EndOfRoundStep | null => {
  if (!prev?.initiative || !next.initiative) return null;
  if (events.some((e) => e.type === "ROUND_ENDED")) {
    const row = boxes(prev);
    const cards = row.slice(resumeFrom(prev, row));
    return cards.length ? { view: prev, cards } : null;
  }
  if (next.initiative.phase !== "END_OF_ROUND") return null;
  const row = boxes(next);
  const parked = endOfRoundResolvingId(next);
  const end = parked ? row.findIndex((c) => c.id === parked) : -1;
  if (end < 0) return null;
  const sameRound = prev.initiative.phase === "END_OF_ROUND" && prev.initiative.round === next.initiative.round;
  const cards = row.slice(sameRound ? resumeFrom(prev, row) : 0, end + 1);
  return cards.length ? { view: next, cards } : null;
};
