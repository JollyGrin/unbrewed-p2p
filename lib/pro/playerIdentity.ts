/**
 * Optional player identity on the pro wire (issue #568, engine #344).
 *
 * A signed-in player's Discord name rides CREATE_ROOM/JOIN_ROOM as
 * `displayName` and comes back on every seat's public shape, so BOTH clients
 * can put a real name on the plate instead of "Opponent". `playerId` (the
 * account id) rides along too, but only ever reaches telemetry — the server
 * never broadcasts it and nothing here renders it.
 *
 * Two hard rules this module exists to keep honest:
 *
 * 1. **A guest sends nothing.** `identityFields` returns an EMPTY object for
 *    every non-signed-in state, and the callers spread it, so a signed-out
 *    client's messages are byte-identical to today's. That is the whole
 *    old-client-safety story: absent fields = v28 behavior.
 * 2. **Avatars never cross the wire.** The protocol carries no image URL by
 *    design; your own avatar is rendered locally from `useAccount()`, and the
 *    opponent's plate gets a name and nothing else.
 *
 * The name is sanitized here even though the SERVER sanitizes it again
 * (server/identity.ts is authoritative). Client-side sanitization is not a
 * trust boundary — it just means what we send is what comes back, so a name
 * with a stray control character doesn't render one way locally and another
 * way after the round trip.
 */
import type { AccountState } from "@/lib/account/useAccount";

/** Engine limits (server/identity.ts) — mirrored so we bound names the same way. */
export const MAX_DISPLAY_NAME = 32;
export const MAX_PLAYER_ID = 64;

// C0 controls + DEL + C1 controls, matching the engine's set exactly (\n, \r
// and \t included — none of them belong in a one-line label).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001F\u007F-\u009F]/g;
// A /g regex carries `lastIndex` across .test() calls, so the predicate copy
// must NOT be global (same two-copy note as the engine's).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * Strip control characters, trim, truncate to 32, trim again (truncation can
 * expose trailing whitespace) — the engine's sanitizer in client form. Returns
 * undefined for anything that sanitizes to empty, because the wire contract is
 * "absent", not "empty string". Over-long names TRUNCATE rather than reject: a
 * name is cosmetic, and failing over one would be the worse outcome.
 */
export const sanitizeDisplayName = (raw: string): string | undefined => {
  const stripped = raw.replace(CONTROL_CHARS_GLOBAL, "").trim();
  if (stripped === "") return undefined;
  return stripped.slice(0, MAX_DISPLAY_NAME).trim() || undefined;
};

/**
 * The identity fields to spread into a CREATE_ROOM/JOIN_ROOM message.
 *
 * `{}` for guest / loading / offline — a client that hasn't finished its `/me`
 * probe when the player clicks Create simply plays that room as a guest, which
 * is the same outcome as not being signed in. (The probe fires on page load and
 * the create flow needs a hero pick first, so in practice it has long since
 * settled.)
 */
export const identityFields = (
  state: AccountState,
): { displayName?: string; playerId?: string } => {
  if (state.status !== "signed-in" || !state.account) return {};
  const displayName = sanitizeDisplayName(state.account.username);
  // Over-long or control-bearing ids are DROPPED, never truncated: a truncated
  // pseudonymous token would attribute telemetry to the wrong player. The
  // server drops the field on the same rule (and keeps the join either way).
  const id = state.account.id.trim();
  const playerId =
    id && id.length <= MAX_PLAYER_ID && !CONTROL_CHARS.test(id) ? id : undefined;
  return {
    ...(displayName ? { displayName } : {}),
    ...(playerId ? { playerId } : {}),
  };
};

/**
 * What goes on a HUD nameplate for one seat.
 *
 * A claimed `displayName` wins for every seat, yours included — seeing your own
 * Discord name is the confirmation that the other player sees it too. Without
 * one we fall back to exactly today's labels: "You" for the local seat,
 * "Opponent" in a duel, and the seat id ("P3") in multiplayer, where "Opponent"
 * would be ambiguous. A mixed room therefore renders one name and one fallback,
 * with no layout difference between them.
 *
 * `seatCount` is how many seats the view carries, not the format's capacity —
 * it decides only whether the anonymous label reads "Opponent" or "P3".
 */
export const seatNameplate = (
  seat: { id: string; you: boolean; displayName?: string },
  seatCount: number,
): string => {
  const claimed = seat.displayName ? sanitizeDisplayName(seat.displayName) : undefined;
  if (claimed) return claimed;
  if (seat.you) return "You";
  return seatCount === 2 ? "Opponent" : seat.id.toUpperCase();
};
