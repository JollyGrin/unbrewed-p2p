/**
 * The single source of truth for the committed render-fuzz JSONL fixtures
 * (unbrewed-p2p-505).
 *
 * `sampleViews.ts` and the `.views.jsonl` files under `test/replays/smokebot/`
 * encode the same protocol shape twice, and for a while nothing failed at the
 * moment they diverged: the v22 sync (cfe0d3a) added fields to the TypeScript builders and
 * left the JSONL a protocol version behind, which surfaced only much later as an
 * opaque `viewHash` mismatch that read like a hashing bug.
 *
 * So the fixtures are DERIVED, not hand-kept. This module builds their exact
 * bytes from `sampleViews.ts`; `writeSampleRun.mts` writes them to disk and
 * `renderFuzz.test.tsx` rebuilds them in memory and compares, failing with the
 * regen command the moment the two sides drift.
 */
import { buildSampleGame, knownBadView } from "./sampleViews";

/** Path segments of the fixture root, relative to the repo root. */
export const FIXTURE_ROOT = ["test", "replays", "smokebot"] as const;

export const REGEN_COMMAND = "npm run pro:render-fuzz:fixtures";

export const STALE_FIXTURE_HINT =
  `The committed render-fuzz fixtures are STALE — they no longer match ` +
  `scripts/renderFuzz/sampleViews.ts (this is what a protocol sync that moves ` +
  `only the TypeScript side looks like). Regenerate and commit them:\n` +
  `    ${REGEN_COMMAND}`;

export interface FixtureFile {
  /** Run-dir name under the fixture root (`sample`, `known-bad`). */
  dir: string;
  /** File name within that run dir. */
  name: string;
  /** Repo-relative path, for failure messages. */
  relPath: string;
  /** The exact bytes this fixture file should contain. */
  contents: string;
  /** How many view records `contents` holds. */
  viewCount: number;
}

const jsonl = (records: unknown[]): string =>
  records.map((r) => JSON.stringify(r)).join("\n") + "\n";

const fixture = (dir: string, name: string, records: unknown[]): FixtureFile => ({
  dir,
  name,
  relPath: [...FIXTURE_ROOT, dir, name].join("/"),
  contents: jsonl(records),
  viewCount: records.length,
});

/** Both committed run dirs, built fresh from `sampleViews.ts`. */
export function buildFixtureFiles(): FixtureFile[] {
  return [
    fixture(
      "sample",
      "sample-game-0001.views.jsonl",
      buildSampleGame().map((s) => ({
        game: "sample-game-0001",
        seat: s.seat,
        step: s.step,
        view: s.view,
        legalActions: [],
        events: [],
      }))
    ),
    fixture("known-bad", "known-bad.views.jsonl", [
      { game: "known-bad", seat: "p1", step: 0, view: knownBadView(), legalActions: [], events: [] },
    ]),
  ];
}

/**
 * A "line N, column C differs" excerpt for a stale-fixture failure — the whole
 * point is that the next person sees WHAT drifted, not just that a hash moved.
 * Fixture lines are single huge JSON blobs, so the excerpt is a window centred
 * on the first differing character rather than the head of the line.
 */
export function describeFixtureDrift(onDisk: string, fresh: string): string {
  const a = onDisk.split("\n");
  const b = fresh.split("\n");
  const WINDOW = 90;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    if (a[i] === undefined || b[i] === undefined) {
      return `line ${i + 1}: ${a[i] === undefined ? "missing on disk" : "unexpected extra line on disk"}`;
    }
    let col = 0;
    while (col < a[i].length && col < b[i].length && a[i][col] === b[i][col]) col++;
    const from = Math.max(0, col - WINDOW);
    const window = (line: string): string =>
      `${from > 0 ? "…" : ""}${line.slice(from, col + WINDOW)}${col + WINDOW < line.length ? "…" : ""}`;
    return (
      `first difference at line ${i + 1}, column ${col + 1}:\n` +
      `  on disk: ${window(a[i])}\n` +
      `  fresh:   ${window(b[i])}`
    );
  }
  return "files differ, but no line-level difference was found";
}
