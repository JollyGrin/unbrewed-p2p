/**
 * Seat and fighter labels for prose that must never print a raw id (p2p #1473, delta review L1;
 * the #1169 class). Dependency-free so both `promptSubject` and `adventureBoard` can share it.
 */
import type { PlayerView, ViewFighter } from "./protocol";

/**
 * A seat as the nameplates read it: the claimed display name, else "You" / "Opponent" (duel) /
 * the uppercased seat id ("P3") in a bigger table — the `seatNameplate` / `gameLog.seatLabel`
 * convention, never the bare `p3`.
 */
export const seatLabelOf = (view: Pick<PlayerView, "you" | "players">, player: string): string => {
  const claimed = view.players?.find((p) => p.id === player)?.displayName?.trim();
  if (claimed) return claimed;
  if (player === view.you) return "You";
  return (view.players?.length ?? 0) === 2 ? "Opponent" : player.toUpperCase();
};

/** Whether another fighter in the view (defeated ones too — they can return) shares this name. */
const nameShared = (view: Pick<PlayerView, "fighters">, fighter: ViewFighter): boolean =>
  view.fighters.some((f) => f !== fighter && f.id !== fighter.id && f.name === fighter.name);

/**
 * A fighter's name, with its seat appended when a second copy of the same hero is at the table
 * ("Dr. Sattler (Bo)"), so a target or a prompt subject is never ambiguous.
 */
export const fighterLabel = (view: Pick<PlayerView, "you" | "players" | "fighters">, fighter: ViewFighter): string =>
  nameShared(view, fighter) ? `${fighter.name} (${seatLabelOf(view, fighter.owner)})` : fighter.name;
