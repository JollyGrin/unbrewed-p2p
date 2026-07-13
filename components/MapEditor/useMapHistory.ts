/**
 * Undo/redo history over a single immutable `doc` value (the map editor's whole
 * draft). Because every mutation in model.ts is a flat doc-in/doc-out function,
 * history is just three stacks of `doc` snapshots — cheap and total: any change
 * routed through `commit` is undoable.
 *
 * Drags are the one non-atomic gesture: `beginTransient` snapshots the current
 * doc, `update` mutates the present WITHOUT pushing history (so a drag isn't 60
 * undo entries), and `endTransient` folds the whole gesture into ONE history
 * entry (or none, if nothing actually moved). `load` replaces the present and
 * clears history — used for the initial draft load and box imports' baseline.
 */
import { useCallback, useRef, useState } from "react";

type Recipe<T> = T | ((prev: T) => T);

const apply = <T>(recipe: Recipe<T>, prev: T): T =>
  typeof recipe === "function" ? (recipe as (p: T) => T)(prev) : recipe;

// Cap the undo depth so a long authoring session can't grow the stack without
// bound; 200 steps is far more than anyone reaches for in practice.
const MAX_DEPTH = 200;
const cap = <T>(stack: T[]): T[] =>
  stack.length > MAX_DEPTH ? stack.slice(stack.length - MAX_DEPTH) : stack;

interface HistState<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface MapHistory<T> {
  present: T;
  /** Atomic mutation → one undo entry (no-ops are ignored). */
  commit: (recipe: Recipe<T>) => void;
  /** Mutate the present without recording history (mid-gesture). */
  update: (recipe: Recipe<T>) => void;
  /** Snapshot the present as a gesture baseline (call on pointer-down). */
  beginTransient: () => void;
  /** Fold everything since `beginTransient` into a single entry (pointer-up). */
  endTransient: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the present and drop all history (draft load / import baseline). */
  load: (value: T) => void;
}

export function useMapHistory<T>(initial: T): MapHistory<T> {
  const [hist, setHist] = useState<HistState<T>>({ past: [], present: initial, future: [] });
  const transientBase = useRef<T | null>(null);

  const commit = useCallback((recipe: Recipe<T>) => {
    setHist((h) => {
      const next = apply(recipe, h.present);
      if (next === h.present) return h;
      return { past: cap([...h.past, h.present]), present: next, future: [] };
    });
  }, []);

  const update = useCallback((recipe: Recipe<T>) => {
    setHist((h) => {
      const next = apply(recipe, h.present);
      if (next === h.present) return h;
      return { ...h, present: next };
    });
  }, []);

  const beginTransient = useCallback(() => {
    // Read the live present via a functional update, then leave state untouched.
    setHist((h) => {
      transientBase.current = h.present;
      return h;
    });
  }, []);

  const endTransient = useCallback(() => {
    setHist((h) => {
      const base = transientBase.current;
      transientBase.current = null;
      if (base === null || base === h.present) return h;
      return { past: cap([...h.past, base]), present: h.present, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHist((h) => {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1]!;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHist((h) => {
      if (!h.future.length) return h;
      const next = h.future[0]!;
      return { past: cap([...h.past, h.present]), present: next, future: h.future.slice(1) };
    });
  }, []);

  const load = useCallback((value: T) => {
    transientBase.current = null;
    setHist({ past: [], present: value, future: [] });
  }, []);

  return {
    present: hist.present,
    commit,
    update,
    beginTransient,
    endTransient,
    undo,
    redo,
    canUndo: hist.past.length > 0,
    canRedo: hist.future.length > 0,
    load,
  };
}
