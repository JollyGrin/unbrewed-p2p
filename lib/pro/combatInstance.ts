/**
 * Is `next` a DIFFERENT combat from `prev`? The wire has no combat id, and a
 * chained attack (a second combat straight after the first — Grievous's
 * barrage, an "attack again" effect) can be the same attacker on the same
 * target in the same turn, with no null frame between the two. So a new combat
 * is told apart by what can only happen at a combat's start (#874):
 *
 * - it appears (null -> combat), or its attacker / target / seats change;
 * - its stage moves BACKWARDS — a combat only ever walks forward through the
 *   stages, so a return to an earlier one is the next combat's commit;
 * - an attack card already on the table is replaced — a combat's attack slot
 *   only ever goes null -> card (the reveal), never card -> another / null.
 */
import type { GameEvent, ViewCombat } from "./protocol";

const STAGE_ORDER: ViewCombat["stage"][] = [
  "COMMIT_ATTACK",
  "COMMIT_DEFENSE",
  "IMMEDIATELY",
  "DURING",
  "DAMAGE",
  "AFTER",
  "HERO_POST",
  "CLEANUP",
];

/**
 * `events` is the batch that produced `next`. A `COMBAT_ATTACKER_CHANGED` in it
 * that explains the attacker moving (`from` = prev's, `to` = next's) makes that a
 * TAKEOVER inside the same combat — same attacking player, same cards — not a new
 * one. Without it a takeover re-fires every combat-open beat.
 */
export const isNewCombat = (
  prev: ViewCombat | null,
  next: ViewCombat | null,
  events: GameEvent[] = []
): boolean => {
  if (!next) return false;
  if (!prev) return true;
  const takeover =
    prev.attacker !== next.attacker &&
    events.some(
      (e) =>
        e.type === "COMBAT_ATTACKER_CHANGED" && e.from === prev.attacker && e.to === next.attacker
    );
  if (
    (prev.attacker !== next.attacker && !takeover) ||
    prev.target !== next.target ||
    prev.attackerPlayer !== next.attackerPlayer ||
    prev.defenderPlayer !== next.defenderPlayer
  )
    return true;
  if (STAGE_ORDER.indexOf(next.stage) < STAGE_ORDER.indexOf(prev.stage)) return true;
  const was = prev.attackerCard?.instance ?? null;
  return was !== null && was !== (next.attackerCard?.instance ?? null);
};
