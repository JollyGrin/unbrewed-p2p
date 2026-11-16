/**
 * The puzzle catalogue (issue #1679 ↔ engine #1074): `GET <engine>/puzzles.json`,
 * ordered easy → hard. Summaries only — no position, no solution. Nothing here
 * names a puzzle id or assumes how many there are.
 */
import { useEffect, useState } from "react";

import type { PuzzleSummary } from "./protocol";
import { replayHttpBase } from "./replayApi";
import { PRO_WS_URL } from "./wsUrl";

export type PuzzleCatalogueState =
  | { status: "loading"; puzzles: null }
  | { status: "ready"; puzzles: PuzzleSummary[] }
  | { status: "unavailable"; puzzles: null };

const isSummary = (p: unknown): p is PuzzleSummary => {
  const s = p as Partial<PuzzleSummary> | null;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.order === "number" &&
    typeof s.goal?.text === "string" &&
    typeof s.heroes?.solver?.name === "string" &&
    typeof s.heroes?.enemy?.name === "string" &&
    typeof s.source?.kind === "string"
  );
};

/** The catalogue in catalogue order, or null on any failure (network, shape, empty). */
export async function fetchPuzzleCatalogue(opts: { wsUrl?: string; signal?: AbortSignal } = {}): Promise<PuzzleSummary[] | null> {
  try {
    const res = await fetch(`${replayHttpBase(opts.wsUrl)}/puzzles.json`, { signal: opts.signal, cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; puzzles?: unknown };
    if (body?.ok !== true || !Array.isArray(body.puzzles)) return null;
    const puzzles = body.puzzles.filter(isSummary);
    if (puzzles.length === 0) return null;
    return [...puzzles].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  } catch {
    return null;
  }
}

// One fetch per engine per page load, shared by every panel and the /puzzles
// strip. A failure is not cached: the next mount asks again.
const cache = new Map<string, Promise<PuzzleSummary[] | null>>();

export const loadPuzzleCatalogue = (wsUrl: string = PRO_WS_URL): Promise<PuzzleSummary[] | null> => {
  let pending = cache.get(wsUrl);
  if (!pending) {
    pending = fetchPuzzleCatalogue({ wsUrl }).then((puzzles) => {
      if (!puzzles) cache.delete(wsUrl);
      return puzzles;
    });
    cache.set(wsUrl, pending);
  }
  return pending;
};

/** Test-only: forget every cached catalogue. */
export const __resetPuzzleCatalogueForTests = () => cache.clear();

const LOADING: PuzzleCatalogueState = { status: "loading", puzzles: null };

export const usePuzzleCatalogue = (wsUrl: string = PRO_WS_URL): PuzzleCatalogueState => {
  const [state, setState] = useState<PuzzleCatalogueState>(LOADING);
  useEffect(() => {
    let alive = true;
    setState(LOADING);
    loadPuzzleCatalogue(wsUrl).then((puzzles) => {
      if (alive) setState(puzzles ? { status: "ready", puzzles } : { status: "unavailable", puzzles: null });
    });
    return () => {
      alive = false;
    };
  }, [wsUrl]);
  return state;
};

/** "Solved by 41% of players", or null when the catalogue carries no rate. */
export const solveRateLine = (puzzle: Pick<PuzzleSummary, "solveRate"> | null | undefined): string | null => {
  const rate = puzzle?.solveRate;
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 1) return null;
  return `Solved by ${Math.round(rate * 100)}% of players`;
};

/**
 * Where the position came from, truthfully to `source.kind`, and never with a
 * player name: a real game, a bot game, or a hand-made training position.
 */
export const puzzleSourceLine = (puzzle: Pick<PuzzleSummary, "source" | "heroes">): string => {
  const you = `you are ${puzzle.heroes.solver.name}`;
  switch (puzzle.source.kind) {
    case "human":
      return `From a real game · turn ${puzzle.source.turn} · ${you}`;
    case "bot":
      return `From a bot game · turn ${puzzle.source.turn} · ${you}`;
    default:
      return `Training puzzle · ${you}`;
  }
};
