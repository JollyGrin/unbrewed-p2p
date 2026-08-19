/**
 * "Hide opponent cosmetics" (#615) — a per-browser setting, in the shape
 * `useGameFx`'s sound/visual toggles already established: a localStorage
 * boolean read AFTER mount so the server render and the first client paint
 * agree, flipped by a chip in the HUD's cluster.
 *
 * The one difference from those two is the default. FX default ON (`"off"` is
 * the stored sentinel) because they are the intended experience; this defaults
 * OFF (`"on"` is the sentinel) because showing your upgrades to the other seat
 * is the entire point of the epic. Someone who finds an opponent's foils
 * distracting can opt out; nobody has to opt in.
 *
 * It hides OTHER seats only — your own loadout is untouched, which is enforced
 * one level down, at the single decode point in `seatCosmetics`.
 */
import { useCallback, useEffect, useState } from "react";

export const HIDE_OPPONENT_COSMETICS_KEY = "pro-hide-opponent-cosmetics";

export const useHideOpponentCosmetics = (): [boolean, () => void] => {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_OPPONENT_COSMETICS_KEY) === "on");
    } catch {
      /* storage blocked — cosmetics stay visible */
    }
  }, []);

  const toggle = useCallback(() => {
    setHidden((cur) => {
      const next = !cur;
      try {
        window.localStorage.setItem(
          HIDE_OPPONENT_COSMETICS_KEY,
          next ? "on" : "off",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return [hidden, toggle];
};
