import { ErrorCode } from "./protocol";

/**
 * Friendly, user-facing copy for every server ERROR code (issue #209). Kept pure
 * and centralized so the mapping is unit-tested and so ROOM_LIMIT / RATE_LIMITED
 * (unbrewed-engine PR #103) surface actionable text instead of the generic
 * "{code}: {message}" fallback.
 *
 * `MESSAGES` is a `Record<ErrorCode, …>`, so adding a new code to the protocol
 * union without copy here fails the build — the mapping can never silently drift.
 * A code the server sends that this (older) client doesn't know falls back to the
 * generic line rather than throwing.
 */
const MESSAGES: Record<ErrorCode, string> = {
  VERSION: "The game updated — refresh the page to keep playing.",
  BAD_MESSAGE: "Something went wrong talking to the server. Please try again.",
  ROOM_NOT_FOUND: "This room expired or never existed.",
  ROOM_FULL: "This room is already full.",
  BAD_TOKEN: "Your seat in this room has expired.",
  NOT_YOUR_SEAT: "It isn't your seat to act on right now.",
  ILLEGAL_ACTION: "That move isn't allowed — your view may be out of date.",
  UNKNOWN_HERO: "That hero isn't available.",
  BAD_MAP: "That custom board didn't pass validation.",
  RESUME_FAILED: "This game couldn't be restored.",
  RESUME_TOO_LARGE: "This game is too large to restore after a server restart.",
  UNDO_UNAVAILABLE: "Nothing to undo.",
  REMATCH_UNAVAILABLE: "A rematch can't be arranged right now — your opponent may need to refresh.",
  // PR #103 additions — the two this ticket wires up with friendly handling.
  ROOM_LIMIT: "Server is full — try again in a few minutes.",
  RATE_LIMITED: "Slowing down — too many actions at once.",
  SERVER_ERROR: "The server couldn't process that action — try again or take a different action.",
  // v37 (engine #755): tournament tickets. Each one is answered from the match page,
  // which mints a fresh ticket — see lib/pro/tournamentTicket.ts.
  TICKET_INVALID: "This match link isn't valid any more.",
  TICKET_EXPIRED: "Your seat reservation ran out (they last 15 minutes).",
  TICKET_MISMATCH: "This seat reservation doesn't fit this room — it may be for another game, or your seat is already taken.",
  TICKET_REQUIRED: "This is a tournament room — join it from the match page.",
  MATCHUP_LOCKED: "The organizer set this match's heroes and map, and this pick doesn't match them.",
  TOURNAMENTS_DISABLED: "Tournament games aren't available on this server right now.",
};

/** A tournament room's dead seat: it is released, not lost, and the way back is one click (p2p #1252). */
export const TOURNAMENT_SEAT_RELEASED = "Your seat was released while you were away. We'll get you back in.";

const GENERIC = "Something went wrong. Please try again.";

/** Friendly copy for a server ERROR code (accepts any string for forward-compat). */
export function proErrorMessage(code: string): string {
  return MESSAGES[code as ErrorCode] ?? GENERIC;
}
