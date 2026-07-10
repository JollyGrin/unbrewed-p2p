/**
 * Render-fuzz harness tests (unbrewed-p2p-179).
 *
 * Two layers:
 *   1. Pure-logic units (sampling, hashing, run-dir parsing, artifact naming) —
 *      fast, in-process.
 *   2. The known-bad regression + clean-sample smoke, driven through the REAL
 *      CLI as a subprocess (`tsx scripts/render-fuzz.mts`). This is the harness's
 *      own test: a view hand-mutated to throw in render MUST be caught as a
 *      finding (exit 1), and the clean sample MUST render with 0 throws (exit 0).
 *      Running the actual CLI also proves the jsdom mount path itself, without
 *      needing Jest to transform the whole page + Chakra/framer ESM tree.
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProErrorBoundary } from "@/components/Pro/ProErrorBoundary";
import { sampleJobs } from "./sampling";
import { viewHash } from "./viewHash";
import { findViewFiles, readViewFile, readRunDir, RenderJob } from "./runDir";
import { findingFileName } from "./artifact";
import { knownBadView } from "./sampleViews";
import { parseBoundaryMarker, fallbackShownIn, BOUNDARY_MARKER } from "./detect";
import type { PlayerView } from "@/lib/pro/protocol";

const REPO = resolve(__dirname, "..", "..");
const CLI = join(REPO, "scripts", "render-fuzz.mts");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const SAMPLE_DIR = join(REPO, "test", "replays", "smokebot", "sample");
const KNOWN_BAD_DIR = join(REPO, "test", "replays", "smokebot", "known-bad");

const job = (gameRef: string, seat: string, step: number): RenderJob => ({
  gameRef,
  seat,
  step,
  view: {} as PlayerView,
  legalActions: [],
  events: [],
  sourceFile: "x",
});

describe("sampleJobs", () => {
  const jobs = [
    job("g1", "p1", 0), job("g1", "p1", 1), job("g1", "p1", 2),
    job("g2", "p1", 0), job("g2", "p1", 1),
    job("g3", "p1", 0),
  ];

  it("keeps everything when no sampling is requested", () => {
    expect(sampleJobs(jobs)).toHaveLength(jobs.length);
  });

  it("--games N limits to the first N distinct games", () => {
    const out = sampleJobs(jobs, 2);
    expect(new Set(out.map((j) => j.gameRef))).toEqual(new Set(["g1", "g2"]));
    expect(out).toHaveLength(5);
  });

  it("--steps K keeps only every Kth step", () => {
    const out = sampleJobs(jobs, undefined, 2);
    expect(out.map((j) => `${j.gameRef}:${j.step}`)).toEqual(["g1:0", "g1:2", "g2:0", "g3:0"]);
  });

  it("composes --games and --steps", () => {
    const out = sampleJobs(jobs, 1, 2);
    expect(out.map((j) => `${j.gameRef}:${j.step}`)).toEqual(["g1:0", "g1:2"]);
  });
});

describe("viewHash", () => {
  it("is stable and independent of key order", () => {
    const a = { you: "p1", turnNumber: 2, fighters: [{ id: "x", hp: 1 }] };
    const b = { fighters: [{ hp: 1, id: "x" }], turnNumber: 2, you: "p1" };
    expect(viewHash(a)).toBe(viewHash(b));
  });

  it("changes when content changes", () => {
    expect(viewHash({ hp: 1 })).not.toBe(viewHash({ hp: 2 }));
  });
});

describe("runDir parsing", () => {
  it("finds the committed sample view file", () => {
    const files = findViewFiles(SAMPLE_DIR);
    expect(files.some((f) => f.endsWith("sample-game-0001.views.jsonl"))).toBe(true);
  });

  it("reads jobs with seat/step/view populated", () => {
    const jobs = readRunDir(SAMPLE_DIR);
    expect(jobs.length).toBeGreaterThan(0);
    const seats = new Set(jobs.map((j) => j.seat));
    expect(seats.has("p1")).toBe(true);
    expect(seats.has("p2")).toBe(true);
    for (const j of jobs) expect(j.view).toBeTruthy();
  });

  it("throws with file+line on malformed JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "rf-bad-"));
    try {
      require("node:fs").writeFileSync(join(dir, "x.views.jsonl"), "not json\n");
      expect(() => readViewFile(join(dir, "x.views.jsonl"))).toThrow(/x\.views\.jsonl:1/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findingFileName", () => {
  it("is deterministic and filesystem-safe", () => {
    const name = findingFileName({ gameRef: "g/1", seat: "p1", step: 3, viewHash: "abcd" });
    expect(name).toBe("g_1--seat-p1--step-3--abcd.json");
  });
});

describe("parseBoundaryMarker", () => {
  it("ignores unrelated console.error calls", () => {
    expect(parseBoundaryMarker(["some other warning", 1, 2])).toBeNull();
    expect(parseBoundaryMarker([])).toBeNull();
  });

  it("lifts error + component stack out of the boundary's marker log", () => {
    const err = new Error("boom");
    const parsed = parseBoundaryMarker([`${BOUNDARY_MARKER}:`, err, "\n    at ProBoard\n    at ProErrorBoundary"]);
    expect(parsed).not.toBeNull();
    expect(parsed!.message).toBe("boom");
    expect(parsed!.componentStack).toContain("ProErrorBoundary");
  });
});

// The critical cross-PR interaction (PR #180): the page wraps its board in
// ProErrorBoundary, which SWALLOWS a board render throw. React stops at the
// nearest boundary, so a harness boundary further out never fires. This proves
// detection still fires — a finding is produced (→ exit 1) — via the boundary's
// console marker + fallback testid seam, exactly as renderView consumes it.
describe("detection through a real (swallowing) ProErrorBoundary", () => {
  const Boom = ({ message }: { message: string }): JSX.Element => {
    throw new Error(message);
  };

  it("produces a finding even though the boundary swallows the throw", () => {
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let container: HTMLElement;
    try {
      const r = render(
        <ChakraProvider>
          <ProErrorBoundary roomId="R" seat="p1" stateHash="h">
            <Boom message="swallowed board crash" />
          </ProErrorBoundary>
        </ChakraProvider>
      );
      container = r.container;
    } finally {
      // restore below after we read the captured calls
    }

    // 1. Fallback panel rendered (the boundary tripped) — the DOM signal.
    expect(fallbackShownIn(container!)).toBe(true);

    // 2. The console marker carried the real error + stack — the rich signal.
    const marked = errSpy.mock.calls.map((c) => parseBoundaryMarker(c as unknown[])).find(Boolean);
    errSpy.mockRestore();
    expect(marked).toBeTruthy();
    expect(marked!.message).toBe("swallowed board crash");
    expect(marked!.componentStack).toContain("ProErrorBoundary");

    // 3. renderView's decision: outer boundary saw nothing, yet marker/fallback
    //    yield an error → the sweep records a finding and exits 1, not 0-blind.
    const outerCapture = null;
    const error = outerCapture ?? marked ?? (fallbackShownIn(container!) ? { message: "fallback", stack: null, componentStack: null } : null);
    expect(error).toBeTruthy();
  });
});

// The render subprocess tests boot tsx + mount the real page; give them room.
const CLI_TIMEOUT = 120_000;

const runCli = (args: string[]): { code: number; stdout: string } => {
  try {
    const stdout = execFileSync(TSX, [CLI, ...args], { cwd: REPO, encoding: "utf8" });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
};

describe("render-fuzz CLI (real jsdom mount)", () => {
  it(
    "renders the clean sample with 0 throws and exits 0",
    () => {
      const out = mkdtempSync(join(tmpdir(), "rf-clean-"));
      try {
        const { code, stdout } = runCli(["--run", SAMPLE_DIR, "--out", out]);
        expect(stdout).toMatch(/0 throws/);
        expect(code).toBe(0);
        expect(readdirSync(out)).toHaveLength(0);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    CLI_TIMEOUT
  );

  it(
    "catches the known-bad view as a finding and exits 1",
    () => {
      const out = mkdtempSync(join(tmpdir(), "rf-bad-"));
      try {
        const { code, stdout } = runCli(["--run", KNOWN_BAD_DIR, "--out", out]);
        expect(stdout).toMatch(/1 throws/);
        expect(code).toBe(1);

        const files = readdirSync(out);
        expect(files).toHaveLength(1);
        const finding = JSON.parse(readFileSync(join(out, files[0]), "utf8"));
        expect(finding.error.message).toMatch(/Cannot read properties of null/);
        // Acceptance proof: the throw was SWALLOWED by the page's real
        // ProErrorBoundary (PR #180) and still caught via its seam — the stack
        // runs through both the boundary and the board it wraps.
        expect(finding.error.componentStack).toContain("ProErrorBoundary");
        expect(finding.error.componentStack).toContain("ProBoard");
        expect(finding.view).toBeTruthy(); // self-contained: repro needs no server
        expect(finding.viewHash).toBe(viewHash(knownBadView()));
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    CLI_TIMEOUT
  );

  it(
    "re-renders a saved finding in isolation via --repro",
    () => {
      const out = mkdtempSync(join(tmpdir(), "rf-repro-"));
      try {
        runCli(["--run", KNOWN_BAD_DIR, "--out", out]);
        const finding = join(out, readdirSync(out)[0]);
        const { code, stdout } = runCli(["--repro", finding]);
        expect(stdout).toMatch(/THREW/);
        expect(code).toBe(1);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    CLI_TIMEOUT
  );
});
