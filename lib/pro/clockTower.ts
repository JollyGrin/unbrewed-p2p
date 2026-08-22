/**
 * Skull Kid's Clock Tower — the one bespoke prompt affordance the deck needs
 * (issue #663 ↔ engine #449 / engine issue #448).
 *
 * When the `TIME` dial reaches 0 the tower deals 5 damage to EVERY fighter opposing
 * Skull Kid, and each opposing player is offered up to five sequential yes/no
 * prompts: "Discard a card to reduce the Clock Tower damage to your own fighters by
 * its BOOST value". The engine's label is authored ONCE, statically, so it cannot
 * name the running total — but the running total is the entire decision. Without it
 * the player is asked the same sentence five times with no way to tell whether the
 * damage is already covered and one more discard would be thrown away.
 *
 * So the client states it, from public view data:
 *
 *  - The strike is IN PROGRESS exactly while a Skull Kid seat's dial reads empty.
 *    That is structural, not a label match: `CLOCK_STRIKE` guards on `TIME == 0`,
 *    runs the whole mitigation chain, deals the damage, then reverts the dial to 5
 *    in the same run — so a parked prompt with an empty dial is always a Clock Tower
 *    prompt, and no wording change engine-side can break this gate.
 *  - The reduction banked so far is the `MITIGATION` counter, which the engine banks
 *    CONTROLLER-scoped — on Skull Kid's own seat, where the damage Amount reads it.
 *    Since engine e8462ad the whole mitigation-plus-damage block runs inside a
 *    `forEachOpponent` pass, one per living hostile player, and the counter is cleared
 *    at the END of each pass — so during any given prompt it holds exactly the running
 *    total for the player being asked, which is what this line needs. We still read the
 *    larger of the controller's and the chooser's value: the accumulator has already
 *    moved once in this deck's short life, and reading both costs nothing while a wrong
 *    guess would silently print 0.
 *
 * Pure and view-shaped: no React, no protocol change, and nothing here fires unless a
 * Skull Kid seat is mid-strike.
 */
import { PlayerId, ViewPrompt } from "./protocol";

/** Server hero id whose deck owns the tower. */
export const SKULL_KID_HERO_ID = "skull-kid";

/** Printed Clock Tower damage, before mitigation ("deal 5 damage to each opposing
 *  fighter"). Mirrors the 5 in skull-kid.rules.ts's `CLOCK_STRIKE`. */
export const CLOCK_TOWER_DAMAGE = 5;

/** The engine's `TIME` counter key (`counters: [{ name: 'TIME', max: 5 }]`). */
export const TIME_COUNTER = "TIME";

/** The engine's bookkeeping counter for the banked reduction. Deliberately NOT in the
 *  HERO_STATE_COUNTERS registry — this line is the only place it is ever shown. */
export const MITIGATION_COUNTER = "MITIGATION";

/** The slice of a seat this module reads. Satisfied by `ViewPlayer` as-is. */
export interface ClockTowerSeat {
  id: PlayerId;
  heroId?: string | null;
  counters?: Record<string, number>;
}

/**
 * The Skull Kid seat whose tower is mid-strike (an empty dial), or null.
 *
 * An empty dial is an ABSENT key, not a `0` value: the engine drops a counter key the
 * moment it reaches zero ("a zero result drops the key … COUNTER reads default to 0",
 * engine/effects.ts `counter`), so `TIME` is simply missing for the whole strike run.
 * We read it the way the engine does — absent means 0 — but still require a `counters`
 * object, so a malformed or truncated seat can never be mistaken for a striking one.
 */
const strikingSeat = (seats: ClockTowerSeat[]): ClockTowerSeat | null =>
  seats.find(
    (s) =>
      s.heroId === SKULL_KID_HERO_ID &&
      !!s.counters &&
      (s.counters[TIME_COUNTER] ?? 0) === 0
  ) ?? null;

/**
 * The running reduction and what it leaves, for a strike in progress against the seat
 * being prompted — or null when no Clock Tower prompt is open.
 *
 * `null` is the answer for every prompt in every other game, so callers can compute
 * this unconditionally.
 */
export const clockTowerMitigation = (
  prompt: Pick<ViewPrompt, "kind" | "player"> | null | undefined,
  seats: ClockTowerSeat[]
): { reduced: number; landing: number } | null => {
  if (!prompt || prompt.kind !== "YES_NO") return null;
  const skullKid = strikingSeat(seats);
  // Skull Kid is never offered his own tower's mitigation; a YES_NO addressed to him
  // mid-strike would be some other effect's.
  if (!skullKid || skullKid.id === prompt.player) return null;
  const chooser = seats.find((s) => s.id === prompt.player);
  const reduced = Math.max(
    skullKid.counters?.[MITIGATION_COUNTER] ?? 0,
    chooser?.counters?.[MITIGATION_COUNTER] ?? 0
  );
  return { reduced, landing: Math.max(0, CLOCK_TOWER_DAMAGE - reduced) };
};

/**
 * The prompt-panel line, or null. Shown to BOTH seats — the player deciding needs the
 * running total to decide, and Skull Kid's player is entitled to watch their tower
 * being bought down, since every input to it (both counters, both hands) is public.
 */
export const clockTowerMitigationLine = (
  prompt: Pick<ViewPrompt, "kind" | "player"> | null | undefined,
  seats: ClockTowerSeat[],
  you: PlayerId
): string | null => {
  const m = clockTowerMitigation(prompt, seats);
  if (!m) return null;
  const whose = prompt!.player === you ? "your" : "their";
  const head = `Clock Tower: ${CLOCK_TOWER_DAMAGE} damage to each of ${whose} fighters`;
  if (m.reduced <= 0) return `${head} — nothing discarded yet, so all ${CLOCK_TOWER_DAMAGE} would land.`;
  if (m.landing <= 0)
    return `${head} — currently reduced by ${m.reduced}: fully covered, no damage would land.`;
  return `${head} — currently reduced by ${m.reduced}, so ${m.landing} would land.`;
};
