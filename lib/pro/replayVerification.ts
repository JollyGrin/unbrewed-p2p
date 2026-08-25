/**
 * How much of a replay the engine could vouch for, turned into something the UI
 * can render (#701, engine #509).
 *
 * `POST /replay` used to be all-or-nothing: the bundle matched the running
 * engine's schema/dsl or it was refused outright, so every engine release
 * orphaned every replay ever recorded. With per-turn digests in the bundle the
 * server can now VERIFY an old recording against a new engine turn by turn, and
 * says which of three things happened:
 *
 *   exact           — same engine build; nothing to explain.
 *   digest-verified — different build, every turn still hashes the same. Worth a
 *                     quiet badge, not a warning: the game really did replay.
 *   diverged        — the rules changed how this game plays from turn N. The
 *                     server returned only the turns it could verify, so the
 *                     playback is a truthful PREFIX and the UI has to say so.
 *
 * An expansion with no `verification` field came from a pre-#509 server, where a
 * version mismatch was refused before it ever got here — so "absent" means
 * "exact" and old responses behave exactly as they did.
 */
import type { ReplayExpansion, ReplayVerification } from "./protocol";

const KNOWN: readonly ReplayVerification[] = ["exact", "digest-verified", "diverged"];

/** The engine build a bundle was recorded on, as "schema 2 / dsl 0.17.0". */
const engineLabel = (engine: { schemaVersion: number; dslVersion: string }): string =>
  `schema ${engine.schemaVersion} / dsl ${engine.dslVersion}`;

export interface ReplayVerificationNotice {
  /** Normalized state — an absent or unrecognized field reads as "exact". */
  verification: ReplayVerification;
  /** The turn the engine's rules started producing a different game, if any. */
  divergedAtTurn: number | null;
  /** The last turn that IS shown (divergedAtTurn − 1), if any. */
  lastVerifiedTurn: number | null;
  /** Quiet reassurance for the digest-verified case; null when there's nothing to say. */
  badge: string | null;
  /** Longer form of `badge`, for a tooltip. */
  badgeDetail: string | null;
  /** The truncation explanation for `diverged`; null otherwise. */
  banner: { heading: string; body: string } | null;
  /**
   * Diverged so early that there is nothing left to watch (the engine returned
   * no steps). The caller must show the explanation INSTEAD of a scrubber.
   */
  unplayable: boolean;
}

/**
 * Read the verification block off an expansion. Pure and total: any shape the
 * server could send — including none of it — produces a renderable notice.
 */
export function replayVerificationNotice(
  expansion: Pick<ReplayExpansion, "steps"> &
    Partial<Pick<ReplayExpansion, "verification" | "divergedAtTurn" | "recordedEngine" | "engine">>,
): ReplayVerificationNotice {
  const raw = expansion.verification;
  const verification: ReplayVerification = KNOWN.includes(raw as ReplayVerification)
    ? (raw as ReplayVerification)
    : "exact";

  const at = expansion.divergedAtTurn;
  const divergedAtTurn =
    verification === "diverged" && typeof at === "number" && Number.isFinite(at) && at >= 1
      ? Math.floor(at)
      : null;
  const lastVerifiedTurn = divergedAtTurn !== null ? divergedAtTurn - 1 : null;
  const recorded = expansion.recordedEngine;
  const steps = expansion.steps?.length ?? 0;

  if (verification === "digest-verified") {
    return {
      verification,
      divergedAtTurn: null,
      lastVerifiedTurn: null,
      badge: "verified across engine versions",
      badgeDetail: recorded
        ? `Recorded on ${engineLabel(recorded)} and re-checked turn by turn on this engine — every turn matched, so this is the game that was played.`
        : "Recorded on an older engine and re-checked turn by turn on this one — every turn matched, so this is the game that was played.",
      banner: null,
      unplayable: steps === 0,
    };
  }

  if (verification === "diverged") {
    const from = divergedAtTurn !== null ? `from turn ${divergedAtTurn}` : "partway through";
    const shown =
      lastVerifiedTurn !== null && lastVerifiedTurn >= 1
        ? `Showing turns 1 to ${lastVerifiedTurn} — the part that still replays exactly as it was played.`
        : "There are no turns left that replay exactly as they were played.";
    return {
      verification,
      divergedAtTurn,
      lastVerifiedTurn,
      badge: "truncated",
      badgeDetail: `Verified playback stops ${from}.`,
      banner: {
        heading: "This replay stops early",
        body:
          `The engine's rules changed how this game plays ${from}, so the rest can't be shown ` +
          `as it happened. ${shown}` +
          (recorded ? ` (Recorded on ${engineLabel(recorded)}.)` : ""),
      },
      unplayable: steps === 0,
    };
  }

  return {
    verification: "exact",
    divergedAtTurn: null,
    lastVerifiedTurn: null,
    badge: null,
    badgeDetail: null,
    banner: null,
    unplayable: steps === 0,
  };
}

/**
 * The action-log entries a step sequence actually covers.
 *
 * `steps[k]` is the state AFTER `actionLog[k - 1]`, so a full expansion has one
 * more step than actions. A truncated (diverged) expansion keeps the whole
 * action log in the bundle but only the verified prefix of steps — listing the
 * rest would be a dead control pointing at frames nobody can scrub to.
 */
export function actionsForSteps<T>(actionLog: readonly T[], stepCount: number): T[] {
  return actionLog.slice(0, Math.max(0, stepCount - 1));
}
