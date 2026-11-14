/**
 * A fighter's CURRENT move, as the engine resolves it (protocol v40, engine #1059).
 *
 * `ViewFighter.move` is the same stat the maneuver uses — the printed value, or the
 * last `setStat MOVE` override standing (POMNI's Reward 4 = 4, King Kong's and Jason
 * Voorhees's "cannot move" = 0) — and a `MOVE_SET` status is present exactly while it
 * differs from the printed one, stamped with when it ends. Before this field the
 * plate could only show the deck's printed number.
 *
 * Gate on PRESENCE: an older server sends no `move`, and the caller's printed
 * fallback is then all there is. A maneuver boost is NOT in `move`.
 */
import type { ViewFighter } from "./protocol";

export const MOVE_SET_KIND = "MOVE_SET";

export interface FighterMoveReading {
  /** the number to show: the engine's, else the caller's printed fallback, else null */
  value: number | null;
  /** the engine says this is not the fighter's printed move right now */
  changed: boolean;
  /** "until the end of turn 9" — when a changed value ends; "" when unknown or unchanged */
  until: string;
}

type MoveSource = Pick<ViewFighter, "move" | "statuses"> & { defeated?: boolean };

export const moveSetUntil = (fighter: MoveSource | undefined): string => {
  const s = fighter?.statuses?.find((x) => x.kind === MOVE_SET_KIND);
  if (!s || s.expiresAtTurn == null) return "";
  return `until the ${s.expiresAt === "START" ? "start" : "end"} of turn ${s.expiresAtTurn}`;
};

export const fighterMoveReading = (
  fighter: MoveSource | undefined,
  printedFallback?: number | null
): FighterMoveReading => {
  // A defeated fighter carries no MOVE_SET, yet its `move` can still read a stale 0
  // (engine #1060 review): fall back to the printed number rather than show it.
  const fromEngine = typeof fighter?.move === "number" && !fighter?.defeated;
  const changed = fromEngine && !!fighter?.statuses?.some((s) => s.kind === MOVE_SET_KIND);
  return {
    value: fromEngine ? fighter!.move! : printedFallback ?? null,
    changed,
    until: changed ? moveSetUntil(fighter) : "",
  };
};

/** Words for a title / aria-label: "Move 4 — changed from its printed value, until the end of turn 9". */
export const fighterMoveTitle = (reading: FighterMoveReading): string =>
  reading.value == null
    ? "Move"
    : reading.changed
      ? `Move ${reading.value} — changed from its printed value${reading.until ? `, ${reading.until}` : ""}`
      : `Move ${reading.value}`;
