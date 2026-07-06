/**
 * Builds a prefilled GitHub "Report bug" issue URL for a live sandbox game
 * (issue #127, sibling to the Pro reporter in lib/pro/bugReport.ts). The
 * sandbox has no rules engine and no fixed hero/HP/combat model, so context
 * capture is deliberately thin: room id, app/commit version, browser UA, and
 * a windowed excerpt of the synced activity log. The title/labels/body all
 * carry an explicit "sandbox" marker so triage never mistakes this for a Pro
 * match report.
 *
 * The URL-length guard (shrink the excerpt, then the description, until the
 * whole URL fits) is shared with the Pro reporter via lib/shared/bugReport.
 */
import { SandboxLogEntry, logEntriesToCsv } from "./gameLog";
import { buildBugReportUrl as buildBugReportUrlShared, clock } from "../shared/bugReport";

const LABELS = "bug,player-report,sandbox";

/** How many of the most recent log lines to embed inline. */
const EXCERPT_LINES = 30;

export interface SandboxBugReportInput {
  description: string;
  /** room/gid, or null when not in a room */
  roomId: string | null;
  /** newest-first, exactly as the ActionLog panel stores the merged feed */
  entries: SandboxLogEntry[];
  /** short commit hash baked in at build time, or "dev" locally */
  commit: string;
  /** package.json version */
  appVersion: string;
  /** navigator.userAgent (or "" when unavailable, e.g. SSR) */
  userAgent: string;
}

/** The auto-captured `<details>` block — readable, folded, no free-text noise. */
const contextBlock = (input: SandboxBugReportInput): string => {
  const { roomId, commit, appVersion, userAgent } = input;
  return [
    "<details>",
    "<summary>Auto-captured sandbox context</summary>",
    "",
    `- **Room:** ${roomId ?? "(unknown)"}`,
    `- **App:** ${appVersion} (${commit})`,
    `- **Browser:** ${userAgent || "(unknown)"}`,
    "</details>",
  ].join("\n");
};

/** One inline log line: `12:03:41 [dean] played a card to the table`. */
const fmtLine = (e: SandboxLogEntry): string => `${clock(e.at)} [${e.player}] ${e.text}`;

const titleFor = (input: SandboxBugReportInput): string => {
  const first = input.description.trim().split("\n")[0].slice(0, 80).trim();
  return `[Sandbox bug] ${first || "Bug report"}`;
};

/**
 * Assemble title + body and return a GitHub new-issue URL guaranteed under
 * the shared length ceiling. The body opens with an explicit sandbox marker
 * so a triager never assumes Pro match state is attached.
 */
export function buildSandboxBugReportUrl(input: SandboxBugReportInput): string {
  const title = titleFor(input);
  const context = contextBlock(input);
  const total = input.entries.length;

  const bodyFor = (excerptLines: string[], description: string): string =>
    [
      "_Reported from the **sandbox** (freeform) game — not a Pro match. No rules engine, no fixed hero/HP/combat state._",
      "",
      description.trim() || "_(no description provided)_",
      "",
      context,
      "",
      "### Activity log excerpt — most recent",
      "```",
      excerptLines.length ? excerptLines.join("\n") : "(no activity logged yet)",
      "```",
      `_Full log (${total} event${total === 1 ? "" : "s"}): attach the CSV downloaded from this dialog — drag & drop it into this text area._`,
    ].join("\n");

  const chrono = [...input.entries].reverse();
  const excerptLines = chrono.slice(-EXCERPT_LINES).map(fmtLine);

  return buildBugReportUrlShared({
    title,
    labels: LABELS,
    description: input.description,
    excerptLines,
    bodyFor,
  });
}

/** Trigger a browser download of the full activity log as CSV. */
export function downloadSandboxLogCsv(entries: SandboxLogEntry[]): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([logEntriesToCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unbrewed-sandbox-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
