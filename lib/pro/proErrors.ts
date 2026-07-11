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
  UNDO_UNAVAILABLE: "Nothing to undo.",
  // PR #103 additions — the two this ticket wires up with friendly handling.
  ROOM_LIMIT: "Server is full — try again in a few minutes.",
  RATE_LIMITED: "Slowing down — too many actions at once.",
  SERVER_ERROR: "The server couldn't process that action — try again or take a different action.",
};

const GENERIC = "Something went wrong. Please try again.";

/** Friendly copy for a server ERROR code (accepts any string for forward-compat). */
export function proErrorMessage(code: string): string {
  return MESSAGES[code as ErrorCode] ?? GENERIC;
}
