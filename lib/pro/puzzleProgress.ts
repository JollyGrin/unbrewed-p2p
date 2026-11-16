/**
 * Which puzzles THIS browser has solved (issue #1679). localStorage only: no
 * account, no server. A solve counts once per puzzle id; the list is what the
 * panel's "Next puzzle" and the /puzzles strip read.
 */
import { useEffect, useState } from "react";

export const PUZZLE_PROGRESS_KEY = "unbrewed-pro-puzzles-solved";
const CHANGE_EVENT = "unbrewed-pro-puzzles-solved-change";

// Solves this page could not write down (storage blocked): kept for the page's
// life, so a solve still counts once and the tick still shows.
const unsaved = new Set<string>();
/** Test-only. */
export const __resetPuzzleProgressForTests = () => unsaved.clear();

export const readSolvedPuzzles = (): string[] => {
  if (typeof window === "undefined") return [];
  let stored: string[] = [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(PUZZLE_PROGRESS_KEY) || "[]");
    stored = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    stored = [];
  }
  return unsaved.size ? [...stored, ...[...unsaved].filter((id) => !stored.includes(id))] : stored;
};

/** Record a solve. Returns true when it is this browser's FIRST solve of that puzzle. */
export const markPuzzleSolved = (id: string): boolean => {
  const solved = readSolvedPuzzles();
  if (solved.includes(id)) return false;
  try {
    window.localStorage.setItem(PUZZLE_PROGRESS_KEY, JSON.stringify([...solved, id]));
  } catch {
    unsaved.add(id); // storage blocked: the solve still counts for this page
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
};

/** The solved ids, live: follows this tab's solves and other tabs' (`storage`). */
export const useSolvedPuzzles = (): string[] => {
  // Empty on the first render so the static HTML and the first client paint agree.
  const [solved, setSolved] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSolved(readSolvedPuzzles());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return solved;
};

/**
 * The next unsolved puzzle in catalogue order: the first one after `currentId`,
 * else the first one before it; never `currentId` itself. Null when every other
 * puzzle is solved. With no current puzzle: the first unsolved one.
 */
export const nextUnsolvedPuzzle = <T extends { id: string }>(catalogue: readonly T[], solved: readonly string[], currentId?: string | null): T | null => {
  const open = (p: T) => p.id !== currentId && !solved.includes(p.id);
  const at = currentId ? catalogue.findIndex((p) => p.id === currentId) : -1;
  if (at < 0) return catalogue.find(open) ?? null;
  return catalogue.slice(at + 1).find(open) ?? catalogue.slice(0, at).find(open) ?? null;
};
