/**
 * Badge-case state (issue #577; three worn and ordered, #718).
 *
 * A module-level store rather than component state — the opposite choice from
 * `useAccountStats`, and for a concrete reason: the badge case has consumers on
 * two different pages. `/account` reads it to draw the grid AND the header chip,
 * and `useProSocket` reads only the SELECTION, so a signed-in player's chosen
 * badges can ride CREATE_ROOM/JOIN_ROOM. Sharing one probe means one request per
 * page load however many of those mount, and it means picking a badge updates
 * every consumer at once. This mirrors `useAccount`, which shares its `/me`
 * probe for the same reason.
 *
 * The standing epic rules hold:
 *
 * 1. **A guest costs nothing.** The probe only fires once the account state says
 *    "signed-in", so a signed-out player makes zero `/me/badges` requests — on
 *    `/account` and, more importantly, on every Pro page.
 * 2. **No retry, no loud failure.** One request; an unreachable or 503 API is a
 *    quiet state, and selecting is disabled rather than broken.
 */
import { useEffect, useState } from "react";

import { MAX_WORN_BADGES } from "@/components/Badges/BadgeGlyph";

import { Badge, fetchBadgeCase, putWornBadges } from "./badges";
import { useAccount } from "./useAccount";

/**
 * - `loading`     — the account probe or the badges request is in flight
 * - `guest`       — nobody signed in; nothing was requested
 * - `unavailable` — signed in, but the case didn't come back → quiet state
 * - `ready`       — a catalog in hand
 */
export type BadgeCaseStatus = "loading" | "guest" | "unavailable" | "ready";

/**
 * Why the last write didn't take, kept until the next attempt.
 * - `locked`  — the server refused the pick (422)
 * - `unsaved` — it couldn't be reached, or wouldn't answer
 */
export type BadgeNotice = "locked" | "unsaved";

export interface BadgeCaseState {
  status: BadgeCaseStatus;
  badges: Badge[];
  /**
   * The badges being worn, in the player's own order — slot 1 first (#718).
   * Survives an `unavailable` status: the API reports the stored pick even on
   * its 503s, so a wearer keeps their shelf on the HUD while the case itself
   * has nothing to show.
   */
  selected: string[];
  /** A write is in flight — the grid disables itself rather than racing. */
  busy: boolean;
  notice: BadgeNotice | null;
}

const EMPTY: BadgeCaseState = {
  status: "loading",
  badges: [],
  selected: [],
  busy: false,
  notice: null,
};

const GUEST: BadgeCaseState = { ...EMPTY, status: "guest" };

let state: BadgeCaseState = EMPTY;
/** The in-flight (or settled) probe. Non-null means "already asked". */
let probe: Promise<void> | null = null;
const listeners = new Set<(next: BadgeCaseState) => void>();

const publish = (next: BadgeCaseState) => {
  state = next;
  listeners.forEach((listener) => listener(next));
};

const patch = (partial: Partial<BadgeCaseState>) =>
  publish({ ...state, ...partial });

/**
 * Fire the badge probe once per page load. Repeat calls (a second consumer
 * mounting, StrictMode's double effect, a client-side route change) reuse the
 * same promise, so an unreachable API costs exactly one failed request.
 */
export const ensureBadgeProbe = (): Promise<void> => {
  if (!probe) {
    probe = fetchBadgeCase().then((result) => {
      if (result.ok) {
        patch({
          status: "ready",
          badges: result.value.badges,
          selected: result.value.selected,
        });
        return;
      }
      // Keep whatever selection the API managed to report (its 503 carries one).
      patch({ status: "unavailable", badges: [], selected: result.selected });
    });
  }
  return probe;
};

/** Drop everything and allow a fresh probe — used when the account changes. */
const reset = (next: BadgeCaseState) => {
  probe = null;
  publish(next);
};

/**
 * Wear exactly these badges, in exactly this order. `[]` takes them all off.
 *
 * The whole shelf goes every time — see `putWornBadges`. Callers below compute
 * the next list (toggle, swap, reorder) and hand it over; nothing here has an
 * opinion about which operation produced it, which is what lets a drag and a
 * click share one write path.
 *
 * Not optimistic: the server owns both the unlock check and the storage, so the
 * shelf only moves once it has agreed. A refusal is a notice on the case, never
 * a thrown error or a console line — the worst outcome of a failed cosmetic
 * write is that the player's badges didn't change.
 */
export const setWornBadges = async (
  next: readonly string[],
): Promise<void> => {
  if (state.busy) return;
  const ids = next.slice(0, MAX_WORN_BADGES);
  // What this write ADDS. On a 422 the server won't say which id it refused,
  // and it can only be refusing one we weren't already wearing — the others it
  // handed us itself, moments ago.
  const added = ids.filter((id) => !state.selected.includes(id));
  patch({ busy: true, notice: null });
  const result = await putWornBadges(ids);
  if (result.ok) {
    patch({ busy: false, notice: null, selected: result.selected });
    return;
  }
  if (result.reason === "locked") {
    // Our copy of the catalog is stale, not wrong-headed: mark the badge locked
    // so the grid stops offering a pick the server won't honour.
    patch({
      busy: false,
      notice: "locked",
      badges: state.badges.map((badge) =>
        added.includes(badge.id) ? { ...badge, unlocked: false } : badge,
      ),
    });
    return;
  }
  patch({ busy: false, notice: "unsaved" });
};

/**
 * Click a badge in the grid: wear it, or take it off if it is already on.
 *
 * With all three slots full, a fourth pick SWAPS THE LAST one rather than doing
 * nothing. Doing nothing is the answer that makes a player hunt for the badge to
 * remove first; swapping the tail keeps slots 1 and 2 — the ones they cared
 * enough about to put in front — exactly where they were.
 */
export const toggleWornBadge = (id: string): Promise<void> => {
  const worn = state.selected;
  if (worn.includes(id)) return setWornBadges(worn.filter((row) => row !== id));
  if (worn.length < MAX_WORN_BADGES) return setWornBadges([...worn, id]);
  return setWornBadges([...worn.slice(0, MAX_WORN_BADGES - 1), id]);
};

/**
 * Subscribe to the badge case, driving the probe off the account state.
 *
 * Starts at `loading` on every mount so the server render and the first client
 * paint agree, then syncs from the shared store — the same no-hydration-flash
 * idiom `useAccount` uses.
 */
export const useBadges = (): BadgeCaseState => {
  const { status: accountStatus } = useAccount();
  const [snapshot, setSnapshot] = useState<BadgeCaseState>(EMPTY);

  useEffect(() => {
    let alive = true;
    const listener = (next: BadgeCaseState) => {
      if (alive) setSnapshot(next);
    };
    listeners.add(listener);
    if (state !== EMPTY) setSnapshot(state);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (accountStatus === "signed-in") {
      void ensureBadgeProbe();
      return;
    }
    if (accountStatus === "loading") return;
    // Signed out, or an accounts API we never reached: forget the previous
    // account's badges rather than showing them to whoever is here now, and
    // arm a fresh probe for a later sign-in.
    if (state !== GUEST) reset(GUEST);
  }, [accountStatus]);

  return accountStatus === "loading" ? EMPTY : snapshot;
};

/** Test-only: drop the shared store so each case starts from a cold probe. */
export const __resetBadgeStoreForTests = () => {
  state = EMPTY;
  probe = null;
  listeners.clear();
};
