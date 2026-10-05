/** Browse-page filtering and card labels (#1216). */
import { signupWindowOpen } from "./joinState";
import type { Tournament } from "./types";

export type BrowseFilter = "all" | "live" | "signup" | "done" | "mine";

export const FILTERS: { id: BrowseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "signup", label: "Signup open" },
  { id: "done", label: "Completed" },
  { id: "mine", label: "I'm in" },
];

/** Drafts are the organizer's own business; browse never lists them. */
export const browsable = (rows: readonly Tournament[]): Tournament[] =>
  rows.filter((t) => t.status !== "draft");

export const matchesFilter = (
  t: Tournament,
  filter: BrowseFilter,
  mineIds: ReadonlySet<string>,
): boolean => {
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
      // Full roster before the close time: still open (people can leave), just no free seats.
      if (signupWindowOpen(t)) return { tone: "soon", label: "Full · signup open" };
      return { tone: "plain", label: "Signup closed" };
    case "complete":
      return { tone: "done", label: "Completed" };
    case "cancelled":
      return { tone: "done", label: "Cancelled" };
    default:
      return { tone: "plain", label: "Draft" };
  }
};
