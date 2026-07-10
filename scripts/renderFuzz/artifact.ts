/**
 * Finding artifact for a caught render throw (unbrewed-p2p-179).
 *
 * The artifact is self-contained: it embeds the full `view` (plus legalActions
 * and events), so `render-fuzz.mts --repro <artifact.json>` re-renders the exact
 * failing view in isolation with no server and no run dir. The filename is
 * deterministic (game/seat/step + view hash) so re-running a fixed sweep
 * overwrites the same file rather than piling up duplicates.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Action, GameEvent, PlayerView } from "@/lib/pro/protocol";
import type { RenderThrow } from "./detect";
import { viewHash } from "./viewHash";

export interface Finding {
  gameRef: string;
  seat: string;
  step: number;
  viewHash: string;
  error: RenderThrow;
  view: PlayerView;
  legalActions: Action[];
  events: GameEvent[];
}

const slug = (s: string): string => s.replace(/[^A-Za-z0-9._-]+/g, "_");

export function findingFileName(f: Pick<Finding, "gameRef" | "seat" | "step" | "viewHash">): string {
  return `${slug(f.gameRef)}--seat-${slug(f.seat)}--step-${f.step}--${f.viewHash}.json`;
}

export function makeFinding(args: {
  gameRef: string;
  seat: string;
  step: number;
  error: RenderThrow;
  view: PlayerView;
  legalActions: Action[];
  events: GameEvent[];
}): Finding {
  return { ...args, viewHash: viewHash(args.view) };
}

/** Write a finding to `<outDir>/<deterministic-name>.json`. Returns the path. */
export function writeFinding(outDir: string, finding: Finding): string {
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, findingFileName(finding));
  writeFileSync(path, JSON.stringify(finding, null, 2));
  return path;
}
