/**
 * The viewer's figure-style preference for the tabletop (unbrewed-p2p-903):
 * which figure set to draw, or plain tokens. Per device, same shape as
 * `useBoardView` — read after mount, every storage access guarded — and
 * `null` until the viewer has chosen, so `effectiveFigureStyle` picks the
 * board's best option.
 */
import { useCallback, useEffect, useState } from "react";
import { FigureStyle, isFigureStyle } from "./figures";

export const FIGURE_STYLE_KEY = "pro-figure-style";

export const useFigureStyle = (): [FigureStyle | null, (style: FigureStyle) => void] => {
  const [style, setStyle] = useState<FigureStyle | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FIGURE_STYLE_KEY);
      if (isFigureStyle(stored)) setStyle(stored);
    } catch {
      /* storage blocked — the board's default style applies */
    }
  }, []);

  const choose = useCallback((next: FigureStyle) => {
    setStyle(next);
    try {
      window.localStorage.setItem(FIGURE_STYLE_KEY, next);
    } catch {
      /* storage blocked — the choice just won't survive a reload */
    }
  }, []);

  return [style, choose];
};
