/**
 * Display-time grouping for the sandbox activity feed: a run of the same
 * action by the same player ("Drew a card" five times) reads as one line
 * with a count. Purely a view over mergeActionLog's output: nothing here
 * touches the stored / broadcast log, so older clients and the bug-report
 * CSV keep seeing one entry per action.
 */
import { ACTION_LOG_LIMIT, SandboxLogEntry } from "@/lib/sandbox/gameLog";

/**
 * A run breaks when two neighbouring entries are further apart than this.
 * A group shows one timestamp (its latest), so without the break a draw from
 * ten minutes ago would fold into "Drew a card ×2 · now".
 */
export const GROUP_GAP_MS = 60_000;

export interface LogGroup {
  /**
   * Key of the OLDEST entry, so the line keeps its identity as it grows. A
   * capped group is keyed by player instead: its oldest entry changes with
   * every action once the buffer is full.
   */
  key: string;
  /**
   * The run fills the player's whole log buffer, so older entries of it may
   * already have been dropped: the true count is `count` or more.
   */
  capped: boolean;
  player: string;
  /** Latest entry's time: what the line shows. */
  at: number;
  /** Earliest entry's time. */
  firstAt: number;
  count: number;
  /** The shared part of the text ("Drew a card", "Rolled d20"). */
  base: string;
  /**
   * Per-entry values that differ inside the group, in the order they
   * happened (oldest first). Only dice rolls have them.
   */
  values: string[];
  /** The underlying entries, newest first (same order as the feed). */
  entries: SandboxLogEntry[];
}

/**
 * A single-die roll, "Rolled d20 → 17" (command-menu.tsx / dice.modal.tsx).
 * Multi-dice rolls ("Rolled 2d6 → 3, 4 = 7") deliberately do not match:
 * their detail is already a list, and joining several would be unreadable.
 */
const SINGLE_ROLL = /^(Rolled d\d+) → (\d+)$/;

interface Parsed {
  /** Entries group only when this is identical. */
  base: string;
  value?: string;
}

const parse = (text: string): Parsed => {
  const roll = SINGLE_ROLL.exec(text);
  return roll ? { base: roll[1], value: roll[2] } : { base: text };
};

/**
 * Collapse runs of similar adjacent entries. `entries` is newest-first (as
 * mergeActionLog returns it) and so is the result.
 *
 * Two neighbours join when the same player did them, they are no more than
 * `maxGapMs` apart, and their text is identical, or both are single-die
 * rolls of the same die (the rolled values are kept in `values`). Any other
 * entry in between, including another player's, ends the run.
 *
 * `logLimit` is the per-player buffer size; a run that long is `capped`.
 */
export function groupActionLog(
  entries: SandboxLogEntry[],
  maxGapMs: number = GROUP_GAP_MS,
  logLimit: number = ACTION_LOG_LIMIT,
): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const entry of entries) {
    const { base, value } = parse(entry.text);
    const last = groups[groups.length - 1];
    // `last.firstAt` is the previous (newer) neighbour's time: gaps chain
    // entry to entry rather than being measured against the group's newest.
    if (
      last &&
      last.player === entry.player &&
      last.base === base &&
      (value !== undefined) === (last.values.length > 0) &&
      Math.abs(last.firstAt - entry.at) <= maxGapMs
    ) {
      last.key = entry.key;
      last.firstAt = entry.at;
      last.count += 1;
      last.entries.push(entry);
      if (value !== undefined) last.values.unshift(value);
      continue;
    }
    groups.push({
      key: entry.key,
      player: entry.player,
      at: entry.at,
      firstAt: entry.at,
      count: 1,
      capped: false,
      base,
      values: value !== undefined ? [value] : [],
      entries: [entry],
    });
  }
  // A run as long as the buffer is the player's entire retained log (so there
  // is at most one per player): whatever came before it is gone, and the
  // count can no longer grow. Say "or more" rather than sticking at the cap.
  for (const group of groups) {
    if (group.count >= logLimit) {
      group.capped = true;
      group.key = `${group.player}-capped`;
    }
  }
  return groups;
}

/** The parts of a group's line; `count` is null for a single entry. */
export interface GroupLabelParts {
  base: string;
  count: string | null;
  /** Dice values, e.g. "→ 17, 4, 12". Empty when there are none. */
  detail: string;
}

export function groupLabelParts(group: LogGroup): GroupLabelParts {
  return {
    base: group.base,
    count:
      group.count > 1 ? `×${group.count}${group.capped ? "+" : ""}` : null,
    detail: group.values.length > 0 ? `→ ${group.values.join(", ")}` : "",
  };
}

/**
 * One-string form: "Drew a card ×5", "Rolled d20 ×3 → 17, 4, 12", and
 * "Drew a card ×25+" once the run has filled the log buffer.
 */
export function groupLabel(group: LogGroup): string {
  const { base, count, detail } = groupLabelParts(group);
  return [base, count, detail].filter(Boolean).join(" ");
}
