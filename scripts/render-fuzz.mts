/**
 * render-fuzz — replay smoke-bot game logs through the real Pro client under a
 * headless DOM and catch any per-seat render throw (unbrewed-p2p-179).
 *
 * The engine smoke bot proves games COMPLETE over the wire; this proves the
 * client can RENDER every seat's redacted view at every step without throwing
 * in React — the Hollow-Oak white-screen class — before human playtesting.
 *
 * Usage:
 *   npx tsx scripts/render-fuzz.mts --run <dir> [--games N] [--steps K] [--out <dir>]
 *   npx tsx scripts/render-fuzz.mts --repro <finding.json>
 *
 *   --run <dir>     A run directory of `*.views.jsonl` per-seat view fixtures
 *                   (see scripts/renderFuzz/runDir.ts for the engine-export
 *                   contract). Renders all seat-views and writes a finding
 *                   artifact per render throw.
 *   --games N       Sample: render only the first N distinct games.
 *   --steps K       Sample: render only every Kth step per seat.
 *   --out <dir>     Findings output dir (default <run>/render-fuzz-findings).
 *   --repro <file>  Re-render a single saved finding's view in isolation and
 *                   report whether it still throws — no run dir, no server.
 *
 * Exit code: 0 when every rendered view was clean; 1 when any view threw (so it
 * gates a merge alongside the engine smoke run). Pure deterministic scripting —
 * no network, no live dev server, no LLM.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createJsdomEnv } from "./renderFuzz/domEnv";

// Keep useProSocket from ever reaching the live Railway server: any non-empty
// value flips the page to LIVE mode, and the fake WebSocket intercepts the
// connection so nothing leaves the process. Set before importing the page.
process.env.NEXT_PUBLIC_PRO_WS_URL ||= "ws://render-fuzz.invalid";

interface Args {
  run?: string;
  repro?: string;
  games?: number;
  steps?: number;
  out?: string;
  help?: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--run": args.run = next(); break;
      case "--repro": args.repro = next(); break;
      case "--games": args.games = Number(next()); break;
      case "--steps": args.steps = Number(next()); break;
      case "--out": args.out = next(); break;
      case "-h": case "--help": args.help = true; break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

const USAGE = `render-fuzz — catch Pro client render throws by replaying seat-views under jsdom

  npx tsx scripts/render-fuzz.mts --run <dir> [--games N] [--steps K] [--out <dir>]
  npx tsx scripts/render-fuzz.mts --repro <finding.json>
`;

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.run && !args.repro)) {
    process.stdout.write(USAGE);
    return args.help ? 0 : 1;
  }

  // Stand up the headless DOM BEFORE importing anything that renders (the mount
  // module's imports — Chakra, framer-motion, the page — evaluate against it).
  createJsdomEnv();

  if (args.repro) {
    const { renderView } = await import("./renderFuzz/mountProGame");
    const file = resolve(args.repro);
    const finding = JSON.parse(readFileSync(file, "utf8"));
    if (!finding?.view) throw new Error(`${file}: not a finding artifact (no .view)`);
    const outcome = await renderView(finding.view, {
      legalActions: finding.legalActions ?? [],
      events: finding.events ?? [],
      room: finding.gameRef ?? "REPRO",
    });
    if (outcome.ok) {
      process.stdout.write(`repro: view rendered CLEAN (no throw) — ${file}\n`);
      return 0;
    }
    process.stdout.write(`repro: view THREW — ${outcome.error?.message}\n`);
    if (outcome.error?.componentStack) {
      process.stdout.write(`${outcome.error.componentStack.trim()}\n`);
    }
    return 1;
  }

  const runDir = resolve(args.run!);
  const outDir = args.out ? resolve(args.out) : join(runDir, "render-fuzz-findings");
  const { runFuzz } = await import("./renderFuzz/fuzz");

  const summary = await runFuzz({
    runDir,
    games: args.games,
    steps: args.steps,
    outDir,
  });

  for (const f of summary.findings) {
    process.stdout.write(
      `THROW  ${f.gameRef} seat=${f.seat} step=${f.step} view=${f.viewHash}  ${f.error.message}\n`
    );
  }

  process.stdout.write(
    `render-fuzz: ${summary.games} games, ${summary.seats} seats, ` +
      `${summary.views} views rendered, ${summary.throws} throws` +
      (summary.throws ? ` → ${outDir}` : "") +
      "\n"
  );

  return summary.throws > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`render-fuzz: ${err?.stack ?? err}\n`);
    process.exit(2);
  }
);
