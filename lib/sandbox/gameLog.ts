/**
 * Client-side merge of every player's actionLog blob into one activity feed
 * for the sandbox game (mirrors lib/pro/gameLog.ts's role for Pro, but the
 * sandbox has no server-authoritative view to diff — each player's client
 * already appends its own entries via WebGameProvider.logAction). Shared by
 * the ActionLog panel display and the Report-bug dialog/CSV export so both
 * read the exact same merged, ordered feed.
 */
import { PlayerState } from "@/lib/gamesocket/message";

export interface SandboxLogEntry {
  key: string;
  player: string;
  at: number;
  text: string;
}

/**
 * Newest-first merge of every player's actionLog ring buffer. Wall-clock
 * order across players; the per-player `seq` (folded into `key`) keeps
 * same-millisecond entries from one player stable.
 */
export function mergeActionLog(
  players: Record<string, PlayerState> | undefined
): SandboxLogEntry[] {
  if (!players) return [];
  const merged: SandboxLogEntry[] = [];
  for (const [player, state] of Object.entries(players)) {
    for (const entry of state?.actionLog ?? []) {
      merged.push({ key: `${player}-${entry.seq}`, player, at: entry.at, text: entry.text });
    }
  }
  merged.sort((a, b) => b.at - a.at || b.key.localeCompare(a.key));
  return merged;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** Oldest-first CSV of the whole feed (entries are stored newest-first). */
export function logEntriesToCsv(entries: SandboxLogEntry[]): string {
  return [
    "time,player,text",
    ...[...entries]
      .reverse()
      .map((e) => [new Date(e.at).toISOString(), e.player, csvCell(e.text)].join(",")),
  ].join("\n");
}
