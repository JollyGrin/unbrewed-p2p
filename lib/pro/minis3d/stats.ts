/**
 * 3D minis — counters for the measuring probes
 * (scripts/visual-probe/tableMini3d/). Plain numbers, no DOM; each layer
 * appends to its own list. Exposed as `window.__minis3d.stats` once the
 * renderer starts.
 */
export interface Minis3dStats {
  /** One per GL render: ms (main thread; GPU too when `syncTiming`), size. */
  renders: { ms: number; w: number; h: number; url: string }[];
  /** One per decoded model file. */
  loads: { url: string; bytes: number; fetchMs: number; decodeMs: number; triangles: number }[];
  importMs: number | null;
  status: string;
  /** Probe only: wait for the GPU after each render (1-px readPixels) so
   *  `renders[].ms` includes GPU time, not just the main thread's share. */
  syncTiming: boolean;
  /** The render scheduler's own counters (see scheduler.ts). */
  scheduler: { frames: number; jobs: number; deferred: number; peakQueue: number };
}

const MAX_RENDERS = 100_000;

export const minis3dStats: Minis3dStats = {
  renders: [],
  loads: [],
  importMs: null,
  status: "idle",
  syncTiming: false,
  scheduler: { frames: 0, jobs: 0, deferred: 0, peakQueue: 0 },
};

export const recordRender = (r: Minis3dStats["renders"][number]) => {
  if (minis3dStats.renders.length < MAX_RENDERS) minis3dStats.renders.push(r);
};
