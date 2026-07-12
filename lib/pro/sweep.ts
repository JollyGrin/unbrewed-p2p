/**
 * Elimination-sweep detection for the view differs (fxEvents / gameLog).
 *
 * When a seat's hero dies, the engine's `sweepEliminatedSeats` (engine #102)
 * removes that seat's surviving fighters by setting `{hp:0, defeated:true,
 * space:null}` and emitting a `FIGHTER_DEFEATED` — but, by design, NO
 * `DAMAGE_APPLIED`. The client differs read the hp drop as combat damage and
 * would otherwise pop a phantom "took N damage" number/line for every swept
 * sidekick before its defeat line (issue #212).
 *
 * A swept fighter is one with a `FIGHTER_DEFEATED` event this batch and NO
 * `DAMAGE_APPLIED` of its own. Genuine kill-shots carry `DAMAGE_APPLIED` and
 * are excluded, so their damage FX/log is untouched. Requiring an explicit
 * `FIGHTER_DEFEATED` event means a pre-v10 server (empty events) yields an
 * empty set — the differs stay byte-identical to their pre-fix behaviour.
 */
import { FighterId, GameEvent } from "./protocol";

export function sweptFighters(events: GameEvent[]): Set<FighterId> {
  const damaged = new Set<FighterId>();
  const defeated = new Set<FighterId>();
  for (const e of events) {
    if (e.type === "DAMAGE_APPLIED") damaged.add(e.fighter);
    else if (e.type === "FIGHTER_DEFEATED") defeated.add(e.fighter);
  }
  for (const id of damaged) defeated.delete(id);
  return defeated;
}
