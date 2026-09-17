/**
 * The board-view setting, per device — same shape as `usePace`: read from
 * localStorage AFTER mount so the server render and the first client paint
 * agree, and guarded so a private window or blocked storage can never throw.
 *
 * Defaults to `flat`. The tabletop view is a second way to play, not a
 * replacement, so an untouched device keeps exactly the board it had.
 */
import { useCallback, useEffect, useState } from "react";
import { BoardView, DEFAULT_BOARD_VIEW, isBoardView, nextBoardView } from "./boardView";

export const BOARD_VIEW_KEY = "pro-board-view";

export const useBoardView = (): [BoardView, () => void] => {
  const [view, setView] = useState<BoardView>(DEFAULT_BOARD_VIEW);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(BOARD_VIEW_KEY);
      if (stored && isBoardView(stored)) setView(stored);
    } catch {
      /* storage blocked — the view stays at the default */
    }
  }, []);

  const toggleBoardView = useCallback(() => {
    setView((cur) => {
      const next = nextBoardView(cur);
      try {
        window.localStorage.setItem(BOARD_VIEW_KEY, next);
      } catch {
        /* storage blocked — the choice just won't survive a reload */
      }
      return next;
    });
  }, []);

  return [view, toggleBoardView];
};
