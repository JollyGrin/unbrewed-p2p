/**
 * The join panel's state machine (#1216), derived — never stored.
 *
 *  - `signed_out` → "Sign in with Discord to join" (returns here via OAuth)
 *  - `can_join`   → signed in, one tap to take a seat
 *  - `joined`     → "You're seat N of M" + Leave (until signup closes)
 *  - `locked_in`  → joined but signup has closed: no Leave
 *  - `full` / `closed` → a signed-in visitor who can't join
 */
import type { Entry, Tournament } from "./types";

export type JoinState =
  | { kind: "signed_out" }
  | { kind: "can_join" }
  | { kind: "joined"; seat: number; of: number }
  | { kind: "locked_in"; seat: number; of: number }
  | { kind: "full" }
  | { kind: "closed" };

export const activeEntries = (entries: readonly Entry[]): Entry[] =>
  entries.filter((e) => !e.leftAt);

/** Seat = 1-based join order among active entrants. */
export const seatOf = (entries: readonly Entry[], userId: string): number | null => {
  const sorted = [...activeEntries(entries)].sort((a, b) =>
    a.joinedAt.localeCompare(b.joinedAt),
  );
  const i = sorted.findIndex((e) => e.userId === userId);
  return i < 0 ? null : i + 1;
};

export const joinState = (
  t: Tournament,
  entries: readonly Entry[],
  userId: string | null,
): JoinState => {
  const seat = userId ? seatOf(entries, userId) : null;
  if (seat !== null)
    return t.signupOpen
      ? { kind: "joined", seat, of: t.size }
      : { kind: "locked_in", seat, of: t.size };
  if (t.signupOpen) return userId ? { kind: "can_join" } : { kind: "signed_out" };
  if (t.status === "signup" && t.entryCount >= t.size) return { kind: "full" };
  return { kind: "closed" };
};
