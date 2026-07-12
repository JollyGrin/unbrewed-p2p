import { SpaceId, ViewFighter } from "./protocol";

// ---------------------------------------------------------------------------
// Large-fighter reach — PRESENTATION ONLY (unbrewed-p2p #235).
//
// The engine already decides legality (docs/pro/02-unmatched-rules.md §4.2b:
// "attacks involving a LARGE fighter can be made up to 2 spaces away"; Triceratops
// prints "She can attack up to 2 spaces away"). A melee fighter two spaces from
// Triceratops is therefore offered the attack — correct, but with nothing on
// screen to say why it reads as a bug. These helpers EXPLAIN a server-offered
// option; they never recompute or second-guess whether it is legal.
//
// Copy lives here so the attack-row chip (1) and the hero-rules blurb (2) can
// never drift apart (#235 acceptance criterion 3).
// ---------------------------------------------------------------------------

/** Compact chip shown beside a surprise (extended-reach) attack option. */
export const LARGE_REACH_CHIP = "Large fighter — melee reach 2";

/**
 * Standing rule line for a LARGE fighter, shown wherever the client surfaces a
 * fighter's rules. Also the tooltip behind the reach chip, so the chip's hover
 * text and the hero-panel line are word-for-word identical.
 */
export const LARGE_FIGHTER_BLURB =
  "Large fighter: occupies up to 2 spaces; melee attacks involving it can be made from up to 2 spaces away.";

/**
 * A LARGE fighter occupies two adjacent spaces, so `tailSpace` is populated once
 * it is on the board — the only size signal the live view carries (protocol v6;
 * there is no pre-match field, see HeroPreviewModal's registry). NORMAL / off-board
 * fighters have `tailSpace: null`.
 */
export const isLargeFighter = (f: Pick<ViewFighter, "tailSpace">): boolean =>
  f.tailSpace != null;

/** The board spaces a fighter's body occupies (head + tail for a LARGE fighter). */
const occupiedSpaces = (f: Pick<ViewFighter, "space" | "tailSpace">): SpaceId[] =>
  [f.space, f.tailSpace].filter((s): s is SpaceId => s != null);

/** Adjacency / zone lookup for one space — the subset of ProMapSpace we need. */
export interface SpaceReach {
  adjacentTo: SpaceId[];
  zones: string[];
}

const areAdjacent = (
  spaces: Map<SpaceId, SpaceReach>,
  a: SpaceId,
  b: SpaceId
): boolean => a === b || !!spaces.get(a)?.adjacentTo.includes(b);

const shareAZone = (
  spaces: Map<SpaceId, SpaceReach>,
  a: SpaceId,
  b: SpaceId
): boolean => {
  const other = new Set(spaces.get(b)?.zones ?? []);
  return (spaces.get(a)?.zones ?? []).some((z) => other.has(z));
};

/**
 * Would `attacker` reach `target` WITHOUT the large-fighter melee extension?
 * Melee reach is adjacency only; ranged reach is adjacency OR a shared zone
 * (docs §4.2). Checked across every body space so a LARGE combatant's tail counts
 * too. Used only to decide whether an option is worth EXPLAINING — the server has
 * already ruled it legal.
 */
export const withinNormalReach = (
  attacker: ViewFighter,
  target: ViewFighter,
  spaces: Map<SpaceId, SpaceReach>
): boolean => {
  for (const a of occupiedSpaces(attacker)) {
    for (const t of occupiedSpaces(target)) {
      if (areAdjacent(spaces, a, t)) return true;
      if (attacker.reach === "RANGED" && shareAZone(spaces, a, t)) return true;
    }
  }
  return false;
};

/**
 * True when a server-offered attack is legal ONLY via the large-fighter reach
 * extension: a LARGE fighter is involved (attacker or target) AND the target sits
 * beyond the attacker's normal reach. This is exactly the case that reads as a bug
 * without a hint. Returns false the instant either fighter is off-board (no space),
 * so a stale view never produces a phantom chip.
 */
export const isExtendedReachAttack = (
  attacker: ViewFighter,
  target: ViewFighter,
  spaces: Map<SpaceId, SpaceReach>
): boolean => {
  if (attacker.space == null || target.space == null) return false;
  if (!isLargeFighter(attacker) && !isLargeFighter(target)) return false;
  return !withinNormalReach(attacker, target, spaces);
};
