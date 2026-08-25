/**
 * Frames-at-upload: keeping a `/share/replay/<uuid>` link from rotting (#701).
 *
 * A cloud replay is stored as its bundle — decisions only — and re-expanded by
 * the engine every time someone opens the link. That is what makes a link
 * fragile: the engine moves on, and one day the bundle can no longer be
 * verified (no digests, or a digest that diverges on turn 3). The link is
 * public and permanent; the thing behind it should be too.
 *
 * So at UPLOAD time — when the versions still match, so the expansion is exact —
 * we ask the engine for the God-view steps once and carry them along inside the
 * uploaded object as `bundle.frames`. `unbrewed-api` stores the bundle as an
 * opaque blob, so this needs NO api change (see the numbers in #701). Playback
 * then prefers the stored frames and only falls back to re-expansion when a
 * bundle has none.
 *
 * Two deliberate properties:
 *  - Frames NEVER enter localStorage. They are hundreds of KB against a 5 MB
 *    budget, and a local replay always has the live engine to expand it — so
 *    `saveReplay` strips them and so does the .json export.
 *  - Frames carry their own `verification` block, so a link uploaded from an
 *    already-truncated replay still tells the recipient it stops early rather
 *    than silently showing a short game.
 *
 * Integrity note: preferring stored frames trades the engine's authoritative
 * re-simulation for the uploader's own recording of it. That is inherent to the
 * goal (a link that renders with no engine expansion at all), and it is scoped
 * to a link its uploader chose to hand out; the untouched `actionLog` travels in
 * the same bundle, so anyone can still re-verify the game from decisions alone.
 */
import type { ReplayBundle, ReplayExpansion } from "./protocol";

/** Bundle shape as it is UPLOADED / read back from a share link. */
export type BundleWithFrames = ReplayBundle & { frames?: unknown };

/**
 * A frozen expansion, as embedded in an uploaded bundle. Mirrors
 * `ReplayExpansion` (minus its `ok` flag) plus the action log the steps cover,
 * which the scrubber lists beside them.
 */
export interface ReplayFrames {
  /** Frames envelope version, so a later shape change is detectable. */
  v: 1;
  engine: ReplayExpansion["engine"];
  meta: ReplayExpansion["meta"];
  map: ReplayExpansion["map"];
  catalog: ReplayExpansion["catalog"];
  heroes: ReplayExpansion["heroes"];
  steps: ReplayExpansion["steps"];
  finalHash: string;
  actionLog: ReplayBundle["actionLog"];
  verification?: ReplayExpansion["verification"];
  divergedAtTurn?: number;
  recordedEngine?: ReplayExpansion["recordedEngine"];
}

/**
 * Freeze an expansion for upload. The action log comes off the BUNDLE (the
 * server's response is not required to echo it) and is clamped to the steps that
 * were actually returned, so a truncated expansion can't ship a log that runs
 * past its last frame.
 */
export function framesFromExpansion(
  bundle: ReplayBundle,
  expansion: ReplayExpansion,
): ReplayFrames {
  const frames: ReplayFrames = {
    v: 1,
    engine: expansion.engine,
    meta: expansion.meta,
    map: expansion.map,
    catalog: expansion.catalog,
    heroes: expansion.heroes,
    steps: expansion.steps,
    finalHash: expansion.finalHash,
    actionLog: bundle.actionLog.slice(0, Math.max(0, expansion.steps.length - 1)),
  };
  if (expansion.verification) frames.verification = expansion.verification;
  if (typeof expansion.divergedAtTurn === "number") frames.divergedAtTurn = expansion.divergedAtTurn;
  if (expansion.recordedEngine) frames.recordedEngine = expansion.recordedEngine;
  return frames;
}

/**
 * Structural gate on `bundle.frames` read back from a share link. Untrusted
 * input: anything that isn't a usable frame set returns null so the caller falls
 * back to the engine rather than rendering half a board.
 */
export function readFrames(bundle: BundleWithFrames | null | undefined): ReplayFrames | null {
  const raw = bundle?.frames;
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<ReplayFrames>;
  if (f.v !== 1) return null;
  if (!Array.isArray(f.steps) || f.steps.length === 0) return null;
  if (!f.map || !f.meta || !f.engine) return null;
  if (!f.catalog || typeof f.catalog !== "object") return null;
  return {
    v: 1,
    engine: f.engine,
    meta: f.meta,
    map: f.map,
    catalog: f.catalog,
    heroes: f.heroes ?? {},
    steps: f.steps,
    finalHash: typeof f.finalHash === "string" ? f.finalHash : "",
    actionLog: Array.isArray(f.actionLog) ? f.actionLog : [],
    verification: f.verification,
    divergedAtTurn: typeof f.divergedAtTurn === "number" ? f.divergedAtTurn : undefined,
    recordedEngine: f.recordedEngine,
  };
}

/**
 * Stored frames as the expansion the scrubber consumes. `actionLog` rides along
 * on the object exactly as the server's own response carries it.
 */
export function expansionFromFrames(frames: ReplayFrames): ReplayExpansion {
  const expansion: ReplayExpansion & { actionLog: ReplayBundle["actionLog"] } = {
    ok: true,
    engine: frames.engine,
    meta: frames.meta,
    map: frames.map,
    catalog: frames.catalog,
    heroes: frames.heroes,
    steps: frames.steps,
    finalHash: frames.finalHash,
    actionLog: frames.actionLog,
  };
  if (frames.verification) expansion.verification = frames.verification;
  if (typeof frames.divergedAtTurn === "number") expansion.divergedAtTurn = frames.divergedAtTurn;
  if (frames.recordedEngine) expansion.recordedEngine = frames.recordedEngine;
  return expansion;
}

/**
 * The bundle without its frames — what goes into localStorage and into a .json
 * export. Returns the same object when there is nothing to strip, so the common
 * path allocates nothing.
 */
export function stripFrames<T extends BundleWithFrames>(bundle: T): T {
  if (!bundle || typeof bundle !== "object" || bundle.frames === undefined) return bundle;
  const { frames: _frames, ...rest } = bundle;
  return rest as T;
}
