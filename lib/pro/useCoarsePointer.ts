/**
 * True when the primary input is a finger (phones, tablets) — mobile step 1.
 *
 * Starts false and is corrected in an effect, like useProLayout: /pro/game is
 * statically exported, so nothing may read `window` during render, and the
 * prerendered markup must match the first client render.
 */
import { useEffect, useState } from "react";

export const COARSE_POINTER_QUERY = "(pointer: coarse)";

export function useCoarsePointer(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(COARSE_POINTER_QUERY);
    const apply = () => setIsCoarse(query.matches);
    apply();
    query.addEventListener?.("change", apply);
    return () => query.removeEventListener?.("change", apply);
  }, []);

  return isCoarse;
}
