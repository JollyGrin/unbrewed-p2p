/**
 * Builds a prefilled GitHub "Report bug" issue URL for a live Pro game (issue
 * #87). The reporter types what happened; everything else — matchup, turn/HP
 * state, a windowed activity-log excerpt, app/protocol version, browser UA — is
 * auto-captured so a report arrives with the context an investigation like #85
 * needed by hand.
 *
 * Two hard constraints shape this module:
 * 1. URL length. GitHub caps a new-issue URL around ~8KB; browsers/proxies can
 *    be stricter. We keep the WHOLE url under MAX_URL_LEN and, if the excerpt
 *    pushes past it, shrink the log window until it fits — never emit a link
 *    GitHub would reject. The full log rides along as a manually-attached CSV.
 * 2. Privacy. The client only holds its own redacted view (the `redactFor`
 *    boundary), so nothing hidden can leak. We include COUNTS, not the
 *    reporter's own hand contents, and never the reconnect token or any opaque.
 */

import { PROTOCOL_VERSION, PlayerView } from "./protocol";
import { ProLogEntry, logEntriesToCsv } from "./gameLog";
import { requireOpponent } from "./viewCompat";
import { buildBugReportUrl as buildBugReportUrlShared, clock } from "../shared/bugReport";

const LABELS = "bug,player-report";

/** How many log lines to embed inline for each time-window choice. */
const JUST_NOW_LINES = 20;
const AROUND_TURN_RADIUS = 15;

export type BugTimeWindow = { kind: "just-now" } | { kind: "earlier"; turn: number };

export interface BugReportInput {
  description: string;
  when: BugTimeWindow;
  view: PlayerView;
  roomId: string | null;
  /** newest-first, exactly as the page stores the activity feed */
  entries: ProLogEntry[];
  /** short commit hash baked in at build time, or "dev" locally */
  commit: string;
  /** package.json version */
  appVersion: string;
  /** navigator.userAgent (or "" when unavailable, e.g. SSR) */
  userAgent: string;
}

const prettyHero = (heroId: string) =>
  heroId
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

/** "You were ATTACKER vs Baba Yaga" — from the live combat, best-effort. */
const combatRole = (view: PlayerView): string => {
  const c = view.combat;
  if (!c) return "no combat in progress";
  const oppName = (id: string) => view.fighters.find((f) => f.id === id)?.name ?? id.split("/").pop();
  if (c.attackerPlayer === view.you) return `you were ATTACKER (${oppName(c.attacker)} → ${oppName(c.target)})`;
  if (c.defenderPlayer === view.you) return `you were DEFENDER (${oppName(c.attacker)} → ${oppName(c.target)})`;
  return `spectated (${oppName(c.attacker)} → ${oppName(c.target)})`;
};

/** Per-side HP roster: hero + sidekicks, so a report shows the board at a glance. */
const fighterLines = (view: PlayerView): string => {
  const side = (owner: PlayerView["you"], label: string) =>
    view.fighters
      .filter((f) => f.owner === owner)
      .map(
        (f) =>
          `  - ${label} ${f.name} (${f.kind.toLowerCase()}): ${f.hp}/${f.maxHp} HP${
            f.defeated ? " — DEFEATED" : ""
          }${f.space ? ` @ ${f.space}` : ""}`
      )
      .join("\n");
  const opponent = requireOpponent(view);
  return [side(view.you, "you:"), side(opponent.id, "opp:")].filter(Boolean).join("\n");
};

/** The auto-captured `<details>` block — readable, folded, no free-text noise. */
const contextBlock = (input: BugReportInput): string => {
  const { view, roomId, commit, appVersion, userAgent } = input;
  const opponent = requireOpponent(view);
  const phase = `${view.phase}${view.turnPhase ? ` / ${view.turnPhase}` : ""}`;
  return [
    "<details>",
    "<summary>Auto-captured game context</summary>",
    "",
    `- **Reporter:** ${prettyHero(view.self.heroId)} (${view.you}, ${view.fighters.find((f) => f.owner === view.you && f.kind === "HERO")?.reach ?? "?"})`,
    `- **Opponent:** ${prettyHero(opponent.heroId)} (${opponent.id})`,
    `- **Last combat:** ${combatRole(view)}`,
    `- **Turn:** ${view.turnNumber} · ${phase} · ${view.actionsRemaining} action(s) left · active: ${
      view.activePlayer === view.you ? "you" : "opponent"
    }`,
    view.winner ? `- **Winner:** ${view.winner === view.you ? "you" : "opponent"}` : null,
    "",
    "**Fighters**",
    fighterLines(view),
    "",
    "**Cards (counts only — no hidden info)**",
    `  - you: hand ${view.self.hand.length} · deck ${view.self.deckCount} · discard ${view.self.discard.length}`,
    `  - opp: hand ${opponent.handCount} · deck ${opponent.deckCount} · discard ${opponent.discard.length}`,
    "",
    `- **Room:** ${roomId ?? "(unknown)"}`,
    `- **Protocol:** v${PROTOCOL_VERSION}`,
    `- **App:** ${appVersion} (${commit})`,
    `- **Browser:** ${userAgent || "(unknown)"}`,
    "</details>",
  ]
    .filter((l) => l !== null)
    .join("\n");
};

/**
 * Oldest-first slice of the feed for the chosen window, capped to `limit`
 * lines. `entries` arrive newest-first; we reverse to read chronologically.
 * - just-now: the most recent `limit` lines.
 * - earlier(turn N): the lines of turn N plus context on either side, centered.
 */
const windowEntries = (
  entries: ProLogEntry[],
  when: BugTimeWindow,
  limit: number
): ProLogEntry[] => {
  const chrono = [...entries].reverse();
  if (chrono.length === 0) return [];
  if (when.kind === "just-now") return chrono.slice(-limit);

  const idxs = chrono.flatMap((e, i) => (e.turn === when.turn ? [i] : []));
  if (idxs.length === 0) return chrono.slice(-limit); // turn not found — degrade to recent
  const first = idxs[0];
  const last = idxs[idxs.length - 1];
  let start = Math.max(0, first - AROUND_TURN_RADIUS);
  let end = Math.min(chrono.length, last + 1 + AROUND_TURN_RADIUS);
  // If the turn's own span already exceeds the budget, keep the most recent
  // `limit` of it rather than the oldest.
  if (end - start > limit) start = end - limit;
  return chrono.slice(start, end);
};

/** One inline log line: `12:03:41 [you] King Kong took 3 damage (15/18)`. */
const fmtLine = (e: ProLogEntry): string => `${clock(e.ts)} [${e.who}] ${e.text}`;

const titleFor = (input: BugReportInput): string => {
  const { view } = input;
  const opponent = requireOpponent(view);
  const first = input.description.trim().split("\n")[0].slice(0, 80).trim();
  const matchup = `${prettyHero(view.self.heroId)} vs ${prettyHero(opponent.heroId)}`;
  return `[pro] ${first || "Bug report"} — ${matchup} (turn ${view.turnNumber})`;
};

const windowLabel = (when: BugTimeWindow): string =>
  when.kind === "just-now" ? "last events (just now)" : `around turn ${when.turn}`;

/**
 * Assemble title + body and return a GitHub new-issue URL guaranteed under
 * MAX_URL_LEN. Starts with the requested window and shrinks the inline excerpt
 * until it fits; the full log is attached as CSV, so trimming inline lines
 * never loses data. If even zero excerpt lines overflow (a pathological
 * description), the description itself is truncated as a last resort.
 */
export function buildBugReportUrl(input: BugReportInput): string {
  const title = titleFor(input);
  const context = contextBlock(input);
  const total = input.entries.length;

  const bodyFor = (excerptLines: string[], description: string): string =>
    [
      description.trim() || "_(no description provided)_",
      "",
      context,
      "",
      `### Activity log excerpt — ${windowLabel(input.when)}`,
      "```",
      excerptLines.length ? excerptLines.join("\n") : "(no activity logged yet)",
      "```",
      `_Full log (${total} event${total === 1 ? "" : "s"}): attach the CSV downloaded from this dialog — drag & drop it into this text area._`,
    ].join("\n");

  const excerptLines = windowEntries(input.entries, input.when, JUST_NOW_LINES).map(fmtLine);

  return buildBugReportUrlShared({
    title,
    labels: LABELS,
    description: input.description,
    excerptLines,
    bodyFor,
  });
}

/** Turn numbers present in the feed, newest first — powers the "earlier" picker. */
export function turnsInLog(entries: ProLogEntry[]): number[] {
  const seen = new Set<number>();
  for (const e of entries) if (typeof e.turn === "number") seen.add(e.turn);
  return [...seen].sort((a, b) => b - a);
}

/** Trigger a browser download of the full activity log as CSV. */
export function downloadLogCsv(entries: ProLogEntry[]): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([logEntriesToCsv(entries)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unbrewed-pro-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
