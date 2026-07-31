import { SpaceId, ViewFighter } from "./protocol";

// ---------------------------------------------------------------------------
// Large-fighter reach — PRESENTATION ONLY (unbrewed-p2p #235, corrected by #549).
//
// The engine decides legality; these helpers only EXPLAIN a server-offered
// option and never recompute or second-guess whether it is legal.
//
// The reach is ATTACKER-ONLY (unbrewed-engine#307). Every primary source grants
// it one-directionally: T. Rex's card reads "SHE can attack up to 2 spaces away"
// and the rulebook "Large fighters can attack up to 2 spaces away, even over
// fighters that occupy one of those spaces". #235 originally mirrored the
// engine's symmetric rule and shipped a tooltip explaining behaviour that was
// never legal; the case it explained is now simply not offered. A large fighter
// is still REACHABLE from what looks like two spaces away — next to its tail is
// two steps from its head — but that is ordinary adjacency, which
// `withinNormalReach` already covers by checking both body spaces.
//
// Copy lives here so the attack-row chip (1) and the hero-rules blurb (2) can
// never drift apart (#235 acceptance criterion 3).
// ---------------------------------------------------------------------------

/**
 * Compact chip shown beside a surprise (extended-reach) attack option. Only ever
 * appears on the large fighter's OWN attack rows, so "melee reach 2" describes
 * the attacker named in that row.
 */
export const LARGE_REACH_CHIP = "Large fighter — melee reach 2";

/**
 * Standing rule line for a LARGE fighter, shown wherever the client surfaces a
 * fighter's rules. Also the tooltip behind the reach chip, so the chip's hover
 * text and the hero-panel line are word-for-word identical. States the reach
 * one-directionally, and spells out the opponent's side so nobody reads the
 * occupancy half as their own reach growing.
 */
export const LARGE_FIGHTER_BLURB =
  "Large fighter: occupies 2 spaces; it can attack up to 2 spaces away, even over fighters in between. Opponents attack it normally, from any space next to its body.";

/**
 * Hover copy for the board marker on a fighter that a LARGE attacker is reaching
 * over. That fighter is the TARGET, not the large one, so this frames the rule
 * from the receiving end before quoting the shared blurb — and is composed from
 * `LARGE_FIGHTER_BLURB` so the wording still cannot drift.
 */
export const LARGE_REACH_TARGET_BLURB = `Within a large fighter's 2-space attack reach. ${LARGE_FIGHTER_BLURB}`;

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
 * extension: the ATTACKER is LARGE (engine#307 — the reach is one-directional)
 * AND the target sits beyond its normal reach. This is exactly the case that
 * reads as a bug without a hint. A LARGE *target* explains nothing: an attack on
 * it is only ever offered from a space next to its head or its tail, which
 * `withinNormalReach` already counts. Returns false the instant either fighter
 * is off-board (no space), so a stale view never produces a phantom chip.
 */
export const isExtendedReachAttack = (
  attacker: ViewFighter,
  target: ViewFighter,
  spaces: Map<SpaceId, SpaceReach>
): boolean => {
  if (attacker.space == null || target.space == null) return false;
  if (!isLargeFighter(attacker)) return false;
  return !withinNormalReach(attacker, target, spaces);
};
