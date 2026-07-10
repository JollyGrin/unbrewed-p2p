/**
 * Sampling knobs for the render fuzz (unbrewed-p2p-179).
 *
 * Kept in its own jsdom-free module so the pure sampling logic can be unit
 * tested without importing the DOM mount path.
 */
import type { RenderJob } from "./runDir";

/**
 * Apply `--games` / `--steps` sampling to the flat job list, preserving order.
 *   games: render only the first N distinct games.
 *   steps: render only every Kth step (by the step index in its sequence).
 */
export function sampleJobs(jobs: RenderJob[], games?: number, steps?: number): RenderJob[] {
  let selected = jobs;

  if (games && games > 0) {
    const keep = new Set<string>();
    selected = selected.filter((j) => {
      if (keep.has(j.gameRef)) return true;
      if (keep.size < games) {
        keep.add(j.gameRef);
        return true;
      }
      return false;
    });
  }

  if (steps && steps > 1) {
    selected = selected.filter((j) => j.step % steps === 0);
  }

  return selected;
}
