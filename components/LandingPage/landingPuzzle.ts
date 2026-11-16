/**
 * The puzzle on the landing page (issue #1680).
 *
 * LANDING_PUZZLE is the pin: the puzzle the landing block opens, and the
 * version of its position the committed still was taken from. The still
 * (`public/puzzles/landing-still.{webp,json}`) is written by
 * `npm run puzzles:still -- <puzzleId>` when the puzzle set is published, never
 * by the build. A test fails while the pin and the still's JSON disagree, so
 * changing one without the other is noticed.
 */
import still from "@/public/puzzles/landing-still.json";

export const LANDING_PUZZLE = { id: "taranis-one-swing", version: 1 } as const;

export interface LandingStill {
  puzzleId: string;
  version: number;
  /** The goal line, in the server's words. */
  goal: string;
  /** "From a real game · turn 14 · you are …", as the panel shows it. */
  source: string;
  heroes: { solver: string; enemy: string };
  image: { src: string; width: number; height: number };
}

export const LANDING_STILL: LandingStill = still;
