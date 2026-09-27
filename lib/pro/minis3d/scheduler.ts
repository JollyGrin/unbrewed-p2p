/**
 * 3D minis — the RENDER SCHEDULER: when each mini's canvas is redrawn.
 *
 *   - A mini asks for a redraw (`request`) only when its camera changed; the
 *     latest job per mini wins, so a mini asked twice in a frame draws once.
 *   - At most `budget` minis draw per animation frame (3). The queue is FIFO
 *     and a drawn mini that asks again goes to the back, so with more movers
 *     than budget they take turns (round-robin). A mini that misses a frame
 *     keeps showing its previous image — at play size that is invisible, and
 *     it keeps a board-wide shove from costing 8 × ~2 ms in one frame (#931).
 *   - A tweening mini registers a `track` sampler, called once per frame
 *     before the queue drains, which reads where the anchor is and requests a
 *     redraw only if it moved.
 *   - With nothing queued and nothing tracked, no frame is requested at all:
 *     at rest the scheduler does zero work (no rAF, no GL).
 *
 * The frame source is injected so tests drive it by hand.
 */
import { minis3dStats } from "./stats";

export const MINIS3D_FRAME_BUDGET = 3;

type Key = object;

export interface RenderScheduler {
  /** Queue (or replace) this mini's redraw. */
  request(key: Key, job: () => void): void;
  /** Drop a queued redraw and any tracker (the mini unmounted). */
  cancel(key: Key): void;
  /** Call `sample` every frame until `untrack` — a tween in progress. */
  track(key: Key, sample: () => void): void;
  untrack(key: Key): void;
  /** Whether a frame is currently requested (false = idle). */
  readonly busy: boolean;
}

export interface SchedulerOptions {
  budget?: number;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
  /** Counters (default: the shared minis3dStats.scheduler). */
  stats?: { frames: number; jobs: number; deferred: number; peakQueue: number };
}

export const createRenderScheduler = ({
  budget = MINIS3D_FRAME_BUDGET,
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
  stats = minis3dStats.scheduler,
}: SchedulerOptions = {}): RenderScheduler => {
  const queue = new Map<Key, () => void>();
  const trackers = new Map<Key, () => void>();
  let frameId: number | null = null;

  const schedule = () => {
    if (frameId === null && (queue.size > 0 || trackers.size > 0)) frameId = requestFrame(frame);
  };

  const frame = () => {
    frameId = null;
    stats.frames++;
    try {
      // A throwing sampler or job must not freeze every other mini: each is
      // guarded, and the next frame is scheduled whatever happens.
      trackers.forEach((sample) => {
        try {
          sample();
        } catch (e) {
          console.warn("[minis3d] tween sampler failed", e);
        }
      });
      stats.peakQueue = Math.max(stats.peakQueue, queue.size);
      // This frame's batch is fixed up front: a job that asks again (or asks
      // for another mini) lands in the queue for the NEXT frame.
      const batch = Array.from(queue).slice(0, budget);
      for (const [key, job] of batch) {
        if (queue.get(key) !== job) continue; // replaced or cancelled by an earlier job
        queue.delete(key);
        stats.jobs++;
        try {
          job();
        } catch (e) {
          console.warn("[minis3d] render job failed", e);
        }
      }
      stats.deferred += queue.size;
    } finally {
      schedule();
    }
  };

  return {
    request(key, job) {
      queue.set(key, job); // an already-queued mini keeps its place in line
      schedule();
    },
    cancel(key) {
      queue.delete(key);
      trackers.delete(key);
      if (frameId !== null && queue.size === 0 && trackers.size === 0) {
        cancelFrame(frameId);
        frameId = null;
      }
    },
    track(key, sample) {
      trackers.set(key, sample);
      schedule();
    },
    untrack(key) {
      trackers.delete(key);
    },
    get busy() {
      return frameId !== null;
    },
  };
};

let shared: RenderScheduler | null = null;
/** The board's one scheduler (every mini shares the one GL renderer). */
export const minis3dScheduler = (): RenderScheduler => (shared ??= createRenderScheduler());
