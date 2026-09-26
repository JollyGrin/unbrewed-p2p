/**
 * The tabletop board, loaded only once someone asks for it (#893).
 *
 * The flat board is the default, so the tabletop's code (TableBoard and the
 * stage, standees, figures and effects only it pulls in) is split out of the
 * `/pro/game` page chunk: a player who never turns the tabletop on never
 * downloads it.
 *
 * A plain `import()` rather than `next/dynamic`: webpack splits the chunk the
 * same way, but next/dynamic always renders its `loading` placeholder for at
 * least one frame on mount — a blank board mid-game. Here the caller keeps the
 * FLAT board up until the module has arrived and then swaps straight to the
 * real component, so the switch never shows an empty stage. Once loaded the
 * component is cached for the life of the tab: every later switch is instant.
 */
import { useEffect, useState } from "react";
import type { TableBoard as TableBoardComponent } from "@/components/Pro/Table/TableBoard";

export type LazyTableBoard = typeof TableBoardComponent;

let loaded: LazyTableBoard | null = null;
let pending: Promise<LazyTableBoard> | null = null;

/** Starts (or joins) the one download of the tabletop chunk. */
export const loadTableBoard = (): Promise<LazyTableBoard> => {
  if (loaded) return Promise.resolve(loaded);
  if (!pending) {
    pending = import("@/components/Pro/Table/TableBoard").then(
      (mod) => (loaded = mod.TableBoard),
      (err) => {
        // A failed chunk fetch (offline, a deploy swapped the chunk) must not
        // stick: the next time the tabletop is asked for, try again.
        pending = null;
        throw err;
      },
    );
  }
  return pending;
};

/**
 * The TableBoard component once `wanted` has been true and its chunk has
 * arrived; null until then (render the flat board meanwhile). Never fetches
 * anything while `wanted` stays false.
 */
export function useLazyTableBoard(wanted: boolean): LazyTableBoard | null {
  const [board, setBoard] = useState<LazyTableBoard | null>(() => loaded);

  useEffect(() => {
    if (!wanted || board) return;
    let live = true;
    loadTableBoard().then(
      (component) => {
        if (live) setBoard(() => component);
      },
      () => {
        /* chunk failed to load — the flat board stays up */
      },
    );
    return () => {
      live = false;
    };
  }, [wanted, board]);

  return board;
}

/** Test seam: forget the cached module so a test can observe a fresh load. */
export const resetLazyTableBoardCache = (): void => {
  loaded = null;
  pending = null;
};
