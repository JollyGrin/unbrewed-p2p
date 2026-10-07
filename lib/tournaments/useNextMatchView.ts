/**
 * The /pro banner's view of the next match. Split from `useNextMatch.ts`, which
 * the navbar chip imports: this one pulls `nextMatchView` and its bracket/match
 * helpers, which must stay out of the shared bundle (#1265).
 */
import { nextMatchView, type NextMatchView } from "./nextMatch";
import { useTicker } from "./poll";
import { useMyTournaments } from "./useNextMatch";

/** The view, re-derived each second so the seat-hold and deadline clocks tick. */
export const useNextMatch = (): NextMatchView | null => {
  const data = useMyTournaments();
  const next = data?.next ?? null;
  const now = useTicker(1000, Date.now, !!next, next);
  return next ? nextMatchView(next.match, next.detail, next.size, now) : null;
};
