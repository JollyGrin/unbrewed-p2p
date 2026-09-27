/**
 * Which motion each 3D mini should play (#962): the board's state turned into
 * a mini's `MiniMotionCues`. Pure — TableBoard calls it per fighter; the
 * motion itself is lib/pro/minis3d/pose, drawn by TableMini3D.
 *
 *   facing   the two fighters of the live combat — or of the strike that is
 *            still playing after it resolved — face each other.
 *   lunge    the strike's attacker, on the combat panel's own clock: it
 *            starts with the attack card's lunge and peaks at its contact.
 *   recoil   the strike's defender, from the contact moment, as long as the
 *            defense card's reaction; harder the more damage landed.
 *   flinch   a fighter standing where a damage beat (−N) lands.
 *   held     selected or targetable.
 *
 * Fighter-agnostic: a sidekick with a mini gets exactly what a hero gets.
 */
import type { FighterId, SpaceId } from "@/lib/pro/protocol";
import type { MiniMotionCues } from "./TableMini3D";

/** The strike beat as the board needs it: who, how it went, and when (ms
 *  from the moment it arrives), at the player's combat pace. */
export interface TableStrike {
  key: string;
  attacker: FighterId;
  target: FighterId;
  variant: "win" | "blocked" | "tie";
  damage: number;
  /** When the attack card's lunge starts, and how long it takes. */
  lungeDelayMs: number;
  lungeMs: number;
  /** When the cards meet, and how long the defense card reacts. */
  contactMs: number;
  reactMs: number;
}

export interface MiniCueInput {
  fighter: { id: FighterId; space: SpaceId; tailSpace?: SpaceId | null };
  selected: boolean;
  targetable: boolean;
  /** The live combat's pair (null between combats). */
  attack: { attacker: FighterId; target: FighterId } | null;
  strike: TableStrike | null;
  /** Where every on-board fighter stands (board coordinates). */
  positions: Map<FighterId, { x: number; y: number }>;
  /** The board's damage beats in flight (BoardFxItem: key, space, kind). */
  fx: { key: string; space: SpaceId; kind: string }[];
}

/** A lost combat still knocks the defender back — a block only rocks it. */
export const recoilStrength = (strike: Pick<TableStrike, "variant" | "damage">) =>
  strike.variant === "win" ? Math.min(1.4, 0.8 + 0.12 * Math.max(0, strike.damage)) : 0.35;

export const miniCuesFor = ({ fighter, selected, targetable, attack, strike, positions, fx }: MiniCueInput): MiniMotionCues => {
  const id = fighter.id;
  const pair = attack ?? (strike ? { attacker: strike.attacker, target: strike.target } : null);
  const foe = pair ? (pair.attacker === id ? pair.target : pair.target === id ? pair.attacker : null) : null;
  const faceToward = foe && foe !== id ? (positions.get(foe) ?? null) : null;

  const lunge =
    strike && strike.attacker === id
      ? { key: strike.key, delayMs: strike.lungeDelayMs, durMs: strike.lungeMs, strength: strike.variant === "win" ? 1 : 0.75 }
      : null;
  const recoil =
    strike && strike.target === id
      ? { key: strike.key, delayMs: strike.contactMs, durMs: strike.reactMs, strength: recoilStrength(strike) }
      : null;

  let flinch: { key: string } | null = null;
  for (const item of fx) {
    if (item.kind === "damage" && (item.space === fighter.space || item.space === fighter.tailSpace)) flinch = { key: item.key };
  }

  return { dropIn: true, held: selected || targetable, faceToward, lunge, recoil, flinch };
};
