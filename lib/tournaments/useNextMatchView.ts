/**
 * The /pro banner's view of the next match. Split from `useNextMatch.ts`, which
 * the navbar chip imports: this one pulls `nextMatchView` and its bracket/match
 * helpers, which must stay out of the shared bundle (#1265).
 */
import { useEffect, useState } from "react";

import { nextMatchView, type NextMatchView } from "./nextMatch";
import { useMyTournaments } from "./useNextMatch";

/** The view, re-derived each second so the seat-hold and deadline clocks tick. */
export const useNextMatch = (): NextMatchView | null => {
  const data = useMyTournaments();
  const [now, setNow] = useState(() => Date.now());
  const next = data?.next ?? null;
  useEffect(() => {
    if (!next) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [next]);
  return next ? nextMatchView(next.match, next.detail, next.size, now) : null;
};
