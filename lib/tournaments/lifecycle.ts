/**
 * Organizer recourse (#1242): edit a draft/signup event, extend signup, cancel,
 * open a draft — and the copy that says what state signup is in. Pure; the
 * LifecyclePanel renders it and calls `patchTournament`.
 *
 * Cancel-running and extend-after-close need unbrewed-api #91: until it lands
 * the api refuses them (409/400) and the panel shows the api's own message.
 */
import type { TournamentPatch } from "./api";
import { sizesFor } from "./createForm";
import { signupWindowOpen } from "./joinState";
import { formatWhen } from "./share";
import type { Tournament } from "./types";

/** "closes Mon, 5 Oct, 18:00" while it is ahead of us, "closed …" once passed. */
export const signupCloseText = (t: Pick<Tournament, "signupClosesAt">, now: number = Date.now()): string => {
  if (!t.signupClosesAt) return "";
  const when = formatWhen(t.signupClosesAt);
  if (!when) return "";
  return Date.parse(t.signupClosesAt) <= now ? `closed ${when}` : `closes ${when}`;
};

/** The api's start rule: more than half the seats, and round robin needs 4. */
export const canStartWith = (t: Pick<Tournament, "size" | "format">, players: number): boolean =>
  players * 2 > t.size && (t.format !== "round_robin" || players >= 4);

/** Signup is over (the time passed) and too few players joined to start. */
export const underFilledClosed = (t: Tournament, players: number, now: number = Date.now()): boolean =>
  t.status === "signup" && !signupWindowOpen(t, now) && !canStartWith(t, players);

export const UNDER_FILLED_COPY = "Not enough players to start. Extend signup, or cancel.";

/** `YYYY-MM-DDTHH:mm` (viewer's zone) for a `datetime-local` input. */
export const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export type CancelKind = "draft" | "signup" | "running";

export const cancelKind = (t: Pick<Tournament, "status">): CancelKind | null =>
  t.status === "draft" ? "draft" : t.status === "signup" ? "signup" : t.status === "running" ? "running" : null;

/** What cancelling costs, said before the second click. */
export const cancelConsequence = (kind: CancelKind, players: number): string =>
  kind === "draft"
    ? "Delete this draft? Nobody has seen it yet. It can't be brought back."
    : kind === "signup"
      ? `Cancel this tournament? Signup closes for good${players > 0 ? ` and the ${players} player${players === 1 ? "" : "s"} who joined lose their seat` : ""}. This can't be undone.`
      : "Cancel this running tournament? Matches still to play are called off and no champion is named. This can't be undone.";

export const cancelLabel = (kind: CancelKind): string => (kind === "draft" ? "Delete draft" : "Cancel tournament");

export interface EditFormState {
  name: string;
  size: number;
  matchWindowHours: number;
  signupCloses: string;
  top2Final: boolean;
}

export const editFormOf = (t: Tournament): EditFormState => ({
  name: t.name,
  size: t.size,
  matchWindowHours: t.matchWindowHours,
  signupCloses: toLocalInput(t.signupClosesAt),
  top2Final: t.settings?.top2Final === true,
});

/** The signup-close problem for an input value, or null. */
export const closeProblem = (value: string, now: number = Date.now()): string | null => {
  const ms = new Date(value).getTime();
  return !value || Number.isNaN(ms) || ms <= now ? "Pick a time in the future." : null;
};

/** The PATCH body holding only what changed, plus what is wrong with the form. */
export const editPatch = (
  t: Tournament,
  f: EditFormState,
  players: number,
  now: number = Date.now(),
): { patch: TournamentPatch; problems: string[] } => {
  const problems: string[] = [];
  const patch: TournamentPatch = {};
  const name = f.name.trim();
  if (!name) problems.push("Give it a name.");
  else if (name !== t.name) patch.name = name;
  if (f.size !== t.size) {
    if (!sizesFor(t.format).includes(f.size)) problems.push("That size isn't available for this format.");
    else if (f.size < players) problems.push(`${players} players have already joined, so the size can't go below ${players}.`);
    else patch.size = f.size;
  }
  if (f.matchWindowHours !== t.matchWindowHours) patch.matchWindowHours = f.matchWindowHours;
  if (f.signupCloses !== toLocalInput(t.signupClosesAt)) {
    const bad = closeProblem(f.signupCloses, now);
    if (bad) problems.push(bad);
    else patch.signupClosesAt = new Date(f.signupCloses).toISOString();
  }
  if (t.format === "round_robin" && f.top2Final !== (t.settings?.top2Final === true))
    patch.settings = { ...t.settings, top2Final: f.top2Final };
  return { patch, problems };
};
