/**
 * Dock-armed relocation clicks (engine #535; p2p #747 review, #764).
 *
 * A maneuver-origin relocation is a FREE teleport (engine/turn.ts writes the
 * space, spends no step, records the fighter in `maneuver.relocated` — never in
 * `maneuver.moved`), so an adjacent origin plus a full walk is a real option the
 * board must never guess away. Per Dean's ruling `legalActions` stays the single
 * source of truth, and the bare board click is left EXACTLY as it is on main:
 * the mode is armed from one synthetic dock row ("Start maneuver elsewhere"),
 * and only while armed may a board click resolve to a RELOCATE_FIGHTER.
 *
 * #764: the row's VISIBILITY no longer waits on a token click. #747 derived it
 * from the SELECTED fighter, which made the affordance undiscoverable for a solo
 * seat (Jason Voorhees, DOPE): clicking Maneuver showed only "End maneuver" and
 * the boosts, and the row appeared only after clicking the one token on the
 * board. The rows now key on the OFFERS — one row per fighter the server is
 * offering a relocation for — and ARMING is what selects that fighter, so the
 * dashed origins draw the moment the row goes on.
 *
 * Pure and view-independent so the page's `onSpaceClick` stays a three-line
 * dispatch and every ruling here is unit-pinned.
 */
import { Action, FighterId, SpaceId } from "./protocol";

export type RelocateBoardClick =
  /** send exactly this offered action, then disarm the mode */
  | { kind: "relocate"; action: Action }
  /** armed, but the space is not an offered origin: the click does nothing —
   *  while armed the dashed origins are the only clickable spaces */
  | { kind: "ignored" }
  /** unarmed: fall through to the board's ordinary behavior (far-preview,
   *  stepping, pose picks) — a relocation is never sent */
  | { kind: "board" };

export const resolveRelocateBoardClick = (opts: {
  armed: boolean;
  space: SpaceId;
  /** the RELOCATE_FIGHTER offers for the armed fighter, by origin space */
  originActions: Map<SpaceId, Action>;
}): RelocateBoardClick => {
  // Unarmed, even a space that is BOTH a gold step destination and a relocation
  // origin answers as the ordinary move — the dashed pick simply doesn't exist.
  if (!opts.armed) return { kind: "board" };
  const action = opts.originActions.get(opts.space);
  return action ? { kind: "relocate", action } : { kind: "ignored" };
};

/** One synthetic dock row: the toggle that arms `fighter`'s origin picks. */
export type RelocateArmRow = {
  /** the fighter this row arms — arming it also SELECTS it (that is the fix) */
  fighter: FighterId;
  /** rendered copy, already accounting for `armed` and for whether the seat has
   *  more than one relocating fighter */
  label: string;
  /** true while this row's fighter is the armed one */
  armed: boolean;
};

export type RelocateMode = {
  /** one row per own fighter with offers, in the order the server offered them.
   *  Empty whenever the seat has no relocation on the table — a deck without the
   *  trait renders an unchanged dock. */
  rows: RelocateArmRow[];
  /** the armed fighter's offered origins, by space. null when nothing is armed —
   *  or when the armed fighter's offers are gone, which is the auto-disarm cue. */
  armedTarget: { fighter: FighterId; originActions: Map<SpaceId, Action> } | null;
};

/**
 * The dock rows and the armed origin picks, derived from the server's offers
 * alone.
 *
 * `armed` is a FIGHTER, not a boolean, and deliberately NOT `selectedFighter`:
 * selection follows arming (#764), so feeding selection back in here would
 * restore the very coupling that hid the row. A seat whose armed fighter stops
 * being offered a relocation gets `armedTarget: null` — the caller disarms on
 * exactly that, so the mode can never outlive its row.
 */
export const deriveRelocateMode = (opts: {
  /** `view.turnPhase` — relocation is a MANEUVER_MOVE affordance only */
  turnPhase: string | null | undefined;
  legalActions: readonly Action[];
  armed: FighterId | null;
  /** display name for a fighter (the page's badged name) */
  nameOf: (id: FighterId) => string;
}): RelocateMode => {
  if (opts.turnPhase !== "MANEUVER_MOVE") return { rows: [], armedTarget: null };
  // One bucket per fighter the server is offering an origin for, first-offered
  // order. We never filter by seat: `legalActions` is what THIS seat may do, so
  // every RELOCATE_FIGHTER in it is already ours.
  const byFighter = new Map<FighterId, Map<SpaceId, Action>>();
  for (const a of opts.legalActions) {
    if (a.type !== "RELOCATE_FIGHTER") continue;
    const origins = byFighter.get(a.fighter) ?? new Map<SpaceId, Action>();
    origins.set(a.space, a);
    byFighter.set(a.fighter, origins);
  }
  if (byFighter.size === 0) return { rows: [], armedTarget: null };
  // Name the fighter only when the row is ambiguous. Today only Jason declares
  // `maneuverRelocate` and he is a solo seat, so one row renders with the copy
  // #747 shipped — but this keys on the offers, never on "is the seat solo".
  const many = byFighter.size > 1;
  const rows: RelocateArmRow[] = [...byFighter.keys()].map((fighter) => {
    const armed = opts.armed === fighter;
    const who = many ? `${opts.nameOf(fighter)}'s ` : "";
    return {
      fighter,
      armed,
      label: armed
        ? `Pick a dashed space to start ${many ? `${opts.nameOf(fighter)} ` : ""}from — click to cancel`
        : `Start ${who}maneuver elsewhere`,
    };
  });
  const armedOrigins = opts.armed != null ? byFighter.get(opts.armed) : undefined;
  return {
    rows,
    armedTarget:
      opts.armed != null && armedOrigins ? { fighter: opts.armed, originActions: armedOrigins } : null,
  };
};
