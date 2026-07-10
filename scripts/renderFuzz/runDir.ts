/**
 * Reads a smoke-bot run directory into a flat list of render jobs
 * (unbrewed-p2p-179).
 *
 * ── The bridge (engine → client) ─────────────────────────────────────────────
 * The engine smoke bot (unbrewed-engine #80/#81, `--save-all`) writes one meta
 * JSON per game: `{ format, seed, heroIds, map, actionLog, outcome }`. That meta
 * alone can't be rendered — the client shows each seat's *redacted* view, which
 * only the authoritative reducer + `server/redact.ts redactFor()` can produce,
 * and the engine is private (never a dependency of this public repo).
 *
 * So the contract is a small ENGINE-SIDE EXPORT STEP that replays each game's
 * `actionLog` through the reducer and emits, per game, a `*.views.jsonl` file —
 * one JSON object per line, each the exact `msg.view` the client would receive:
 *
 *   { "game": "<id>", "seat": "<PlayerId>", "step": <n>,
 *     "view": <PlayerView>, "legalActions"?: [...], "events"?: [...] }
 *
 * Why JSONL fixtures rather than importing the engine here: it keeps the private
 * engine out of this repo's dependency graph (CI stays a plain `tsx` run with no
 * server, no secrets), and JSONL streams line-by-line for overnight sweeps. The
 * engine PR only needs to add the emitter; this harness owns everything after.
 * (Note for @Emyrk in the PR body.)
 *
 * This reader is deliberately tolerant so partial exports still run: `game`
 * defaults to the file's basename, `seat` to `view.you`, `step` to the line
 * index within its file.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { Action, GameEvent, PlayerView } from "@/lib/pro/protocol";

export interface RenderJob {
  /** Stable reference to the source game (artifact ref for the finding). */
  gameRef: string;
  seat: string;
  step: number;
  view: PlayerView;
  legalActions: Action[];
  events: GameEvent[];
  /** Absolute path of the .views.jsonl file this came from. */
  sourceFile: string;
}

/** Every `*.views.jsonl` (or a bare `views.jsonl`) directly under `dir`. */
export function findViewFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`run dir not found or unreadable: ${dir}`);
  }
  const files: string[] = [];
  for (const name of entries.sort()) {
    const full = join(dir, name);
    let isFile = false;
    try {
      isFile = statSync(full).isFile();
    } catch {
      continue;
    }
    if (!isFile) continue;
    if (name.endsWith(".views.jsonl") || name === "views.jsonl") files.push(full);
  }
  return files;
}

/** Parse one `.views.jsonl` file into render jobs. Blank lines are skipped;
 *  a malformed line throws with its file + line number (deterministic). */
export function readViewFile(file: string): RenderJob[] {
  const text = readFileSync(file, "utf8");
  const fileGame = basename(file).replace(/\.views\.jsonl$/, "").replace(/\.jsonl$/, "");
  const jobs: RenderJob[] = [];
  const lines = text.split("\n");
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line);
    } catch (e) {
      throw new Error(`${file}:${i + 1}: invalid JSON — ${(e as Error).message}`);
    }
    const view = record.view as PlayerView | undefined;
    if (!view || typeof view !== "object") {
      throw new Error(`${file}:${i + 1}: record has no "view" object`);
    }
    jobs.push({
      gameRef: typeof record.game === "string" ? record.game : fileGame,
      seat: typeof record.seat === "string" ? record.seat : String((view as PlayerView).you ?? "?"),
      step: typeof record.step === "number" ? record.step : index,
      view,
      legalActions: Array.isArray(record.legalActions) ? (record.legalActions as Action[]) : [],
      events: Array.isArray(record.events) ? (record.events as GameEvent[]) : [],
      sourceFile: file,
    });
    index++;
  }
  return jobs;
}

/** All render jobs in a run directory, in file + line order. */
export function readRunDir(dir: string): RenderJob[] {
  const files = findViewFiles(dir);
  if (files.length === 0) {
    throw new Error(
      `no *.views.jsonl files in ${dir}. Expected the engine export step's ` +
        `per-seat view fixtures (see scripts/renderFuzz/runDir.ts for the format).`
    );
  }
  return files.flatMap(readViewFile);
}

export const isJsonlFile = (f: string): boolean => extname(f) === ".jsonl";
