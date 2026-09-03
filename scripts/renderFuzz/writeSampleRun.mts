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
 * Run this whenever the fixture builders in sampleViews.ts change — including
 * after a protocol sync that adds fields to them. `renderFuzz.test.tsx` rebuilds
 * these same bytes in memory and fails if what's committed drifted, so a
 * forgotten regen is caught at the moment it happens (unbrewed-p2p-505).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildFixtureFiles, FIXTURE_ROOT } from "./fixtureFiles";

const here = dirname(fileURLToPath(import.meta.url));
const replaysDir = join(here, "..", "..", ...FIXTURE_ROOT);

for (const f of buildFixtureFiles()) {
  const dir = join(replaysDir, f.dir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, f.name);
  writeFileSync(file, f.contents);
  process.stdout.write(`wrote ${f.viewCount} views → ${file}\n`);
}
