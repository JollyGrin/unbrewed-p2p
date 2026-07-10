/**
 * Regenerates the committed render-fuzz fixtures (unbrewed-p2p-179):
 *   npx tsx scripts/renderFuzz/writeSampleRun.mts
 *
 * Writes two deterministic run dirs under test/replays/smokebot/ — stand-ins for
 * the engine export step's real per-seat views so the harness, its CI gate, and
 * its regression test run end-to-end before the engine emitter lands:
 *
 *   sample/     — a clean multi-step, two-seat game (must render with 0 throws)
 *   known-bad/  — one view hand-mutated to throw in render (must be CAUGHT)
 *
 * Run this whenever the fixture builders in sampleViews.ts change.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSampleGame, knownBadView } from "./sampleViews";

const here = dirname(fileURLToPath(import.meta.url));
const replaysDir = join(here, "..", "..", "test", "replays", "smokebot");

const writeRun = (sub: string, name: string, lines: string[]): void => {
  const dir = join(replaysDir, sub);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.views.jsonl`);
  writeFileSync(file, lines.join("\n") + "\n");
  process.stdout.write(`wrote ${lines.length} views → ${file}\n`);
};

writeRun(
  "sample",
  "sample-game-0001",
  buildSampleGame().map((s) =>
    JSON.stringify({ game: "sample-game-0001", seat: s.seat, step: s.step, view: s.view, legalActions: [], events: [] })
  )
);

writeRun("known-bad", "known-bad", [
  JSON.stringify({ game: "known-bad", seat: "p1", step: 0, view: knownBadView(), legalActions: [], events: [] }),
]);
