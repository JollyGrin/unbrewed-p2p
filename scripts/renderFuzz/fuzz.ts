/**
 * Sweep orchestration for the per-seat render fuzz (unbrewed-p2p-179).
 *
 * Reads a run dir, renders every (game, seat, step) view — or a sampled slice —
 * through the real page, and writes a deterministic finding artifact for each
 * render throw. Pure scripting: no network, no live server, no LLM.
 */
import { readRunDir, RenderJob } from "./runDir";
import { renderView } from "./mountProGame";
import { Finding, makeFinding, writeFinding } from "./artifact";
import { sampleJobs } from "./sampling";

export interface FuzzOptions {
  runDir: string;
  /** Render only the first N distinct games (cheap CI slice). */
  games?: number;
  /** Render only every Kth step per (game, seat) sequence. */
  steps?: number;
  /** Where to write finding artifacts. */
  outDir: string;
  /** Progress callback (one line per rendered view). */
  onProgress?: (job: RenderJob, ok: boolean) => void;
}

export interface FuzzSummary {
  games: number;
  seats: number;
  views: number;
  throws: number;
  findings: Finding[];
}

export async function runFuzz(opts: FuzzOptions): Promise<FuzzSummary> {
  const allJobs = readRunDir(opts.runDir);
  const jobs = sampleJobs(allJobs, opts.games, opts.steps);

  const games = new Set<string>();
  const seats = new Set<string>();
  const findings: Finding[] = [];

  for (const job of jobs) {
    games.add(job.gameRef);
    seats.add(`${job.gameRef}::${job.seat}`);

    const outcome = await renderView(job.view, {
      legalActions: job.legalActions,
      events: job.events,
      room: job.gameRef,
    });

    opts.onProgress?.(job, outcome.ok);

    if (!outcome.ok && outcome.error) {
      const finding = makeFinding({
        gameRef: job.gameRef,
        seat: job.seat,
        step: job.step,
        error: outcome.error,
        view: job.view,
        legalActions: job.legalActions,
        events: job.events,
      });
      writeFinding(opts.outDir, finding);
      findings.push(finding);
    }
  }

  return {
    games: games.size,
    seats: seats.size,
    views: jobs.length,
    throws: findings.length,
    findings,
  };
}
