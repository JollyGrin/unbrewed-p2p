/** Browse-page filtering and card labels (#1216). */
import { signupWindowOpen } from "./joinState";
import type { Tournament } from "./types";

export type BrowseFilter = "all" | "live" | "signup" | "done" | "mine";

export const FILTERS: { id: BrowseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "signup", label: "Signup open" },
  { id: "done", label: "Completed" },
  { id: "mine", label: "My tournaments" },
];

/** Drafts are the organizer's own business; the public list never carries them. */
export const browsable = (rows: readonly Tournament[]): Tournament[] =>
  rows.filter((t) => t.status !== "draft");

/**
 * The browse rows: the public list plus every event of the signed-in player's
 * own that it leaves out (`GET /tournaments?mine=1` has them): their drafts, so
 * "Save draft" is not a dead end, and cancelled events they played in or ran.
 */
export const withMyDrafts = (all: readonly Tournament[], mine: readonly Tournament[]): Tournament[] => {
  const seen = new Set(all.map((t) => t.id));
  return [...browsable(all), ...mine.filter((t) => !seen.has(t.id))];
};

/** Only the owner's "My tournaments" lists these: the public list never does. */
const mineOnly = (t: Tournament): boolean => t.status === "draft" || t.status === "cancelled";

export const matchesFilter = (
  t: Tournament,
  filter: BrowseFilter,
  mineIds: ReadonlySet<string>,
): boolean => {
  // A draft or a cancelled event only shows under "My tournaments".
  if (mineOnly(t)) return filter === "mine" && mineIds.has(t.id);
  switch (filter) {
    case "live":
      return t.status === "running";
    case "signup":
      return t.status === "signup";
    case "done":
      return t.status === "complete";
    case "mine":
      return mineIds.has(t.id);
    default:
      return true;
  }
};

export const statusChip = (
  t: Tournament,
): { tone: "live" | "soon" | "done" | "plain"; label: string } => {
  switch (t.status) {
    case "running":
      return { tone: "live", label: "Live" };
    case "signup":
      if (t.signupOpen) return { tone: "soon", label: "Signup open" };
      // Full roster before the close time: signup closes the moment seats fill,
      // so all that is left is the organizer starting it.
      if (signupWindowOpen(t)) return { tone: "soon", label: "Full · ready to start" };
      return { tone: "plain", label: "Signup closed" };
    case "complete":
      return { tone: "done", label: "Completed" };
    case "cancelled":
      return { tone: "done", label: "Cancelled" };
    default:
      return { tone: "plain", label: "Draft" };
  }
};

/**
 * The account-menu count, off the `/me/tournaments` rows the menu already has
 * (no extra request): the events the account plays in or runs, never cancelled
 * ones. That endpoint lists only signup and running events, so this counts the
 * ACTIVE ones and is not the length of the browse "My tournaments" filter, which
 * also lists finished events and drafts.
 */
export const myTournamentCount = (rows: readonly Tournament[]): number =>
  rows.filter((t) => (t.myEntryId || t.isOrganizer) && t.status !== "cancelled").length;

/** "2 active": the menu says what the number counts (see `myTournamentCount`). */
export const activeCountText = (n: number): string => `${n} active`;
