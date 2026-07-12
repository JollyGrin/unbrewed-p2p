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

import { PROTOCOL_VERSION, PlayerId, PlayerView, ViewPlayer } from "./protocol";
import { ProLogEntry, logEntriesToCsv } from "./gameLog";
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

/**
 * Compact seat tag for a report line: "you" for the reporter, "opp" for the
 * single other seat in a duel (keeping duel reports reading exactly as before),
 * and the raw seat id ("p3") in any >2-player game so every seat is named.
 */
const seatTag = (view: PlayerView, player: PlayerId): string => {
  if (player === view.you) return "you";
  return view.players.length <= 2 ? "opp" : player;
};

/** Hero id for a seat — the reporter's own comes from `self`, others from `players[]`. */
const heroForSeat = (view: PlayerView, p: ViewPlayer): string =>
  p.you ? view.self.heroId : p.heroId;

/** Non-null counter entries, `"name:value"` joined — omitted when empty. */
const counterTag = (counters: Record<string, number>): string => {
  const entries = Object.entries(counters ?? {}).filter(([, v]) => v !== 0);
  return entries.length ? ` · counters ${entries.map(([k, v]) => `${k}:${v}`).join(", ")}` : "";
};

/** Per-seat HP roster: hero + sidekicks for EVERY seat, so a report shows the board. */
const fighterLines = (view: PlayerView): string =>
  view.players
    .map((p) => {
      const tag = seatTag(view, p.id);
      return view.fighters
        .filter((f) => f.owner === p.id)
        .map(
          (f) =>
            `  - ${tag}: ${f.name} (${f.kind.toLowerCase()}): ${f.hp}/${f.maxHp} HP${
              f.defeated ? " — DEFEATED" : ""
            }${f.space ? ` @ ${f.space}` : ""}`
        )
        .join("\n");
    })
    .filter(Boolean)
    .join("\n");

/** Per-seat card counts (never contents) for EVERY seat — no hidden info leaks. */
const cardLines = (view: PlayerView): string =>
  view.players
    .map((p) => {
      const tag = seatTag(view, p.id);
      // The reporter's own row is authoritative from `self` (the full redacted
      // self view); other seats expose counts only — their hand contents are
      // redacted out of the view, so nothing hidden can leak.
      const { hand, deck, discard, counters } = p.you
        ? { hand: view.self.hand.length, deck: view.self.deckCount, discard: view.self.discard.length, counters: view.self.counters }
        : { hand: p.handCount, deck: p.deckCount, discard: p.discard.length, counters: p.counters };
      return `  - ${tag}: hand ${hand} · deck ${deck} · discard ${discard}${counterTag(counters)}`;
    })
    .join("\n");

/** "Baba Yaga (opp), Thrall (p3)" — every seat but the reporter, hero + tag. */
const opponentSummary = (view: PlayerView): string =>
  view.players
    .filter((p) => !p.you)
    .map((p) => `${prettyHero(heroForSeat(view, p))} (${seatTag(view, p.id)})`)
    .join(", ") || "(none)";

/** The auto-captured `<details>` block — readable, folded, no free-text noise. */
const contextBlock = (input: BugReportInput): string => {
  const { view, roomId, commit, appVersion, userAgent } = input;
  const phase = `${view.phase}${view.turnPhase ? ` / ${view.turnPhase}` : ""}`;
  return [
    "<details>",
    "<summary>Auto-captured game context</summary>",
    "",
    `- **Reporter:** ${prettyHero(view.self.heroId)} (${view.you}, ${view.fighters.find((f) => f.owner === view.you && f.kind === "HERO")?.reach ?? "?"})`,
    `- **Opponents:** ${opponentSummary(view)}`,
    `- **Last combat:** ${combatRole(view)}`,
    `- **Turn:** ${view.turnNumber} · ${phase} · ${view.actionsRemaining} action(s) left · active: ${
      view.activePlayer === view.you ? "you" : seatTag(view, view.activePlayer)
    }`,
    view.winner ? `- **Winner:** ${view.winner === view.you ? "you" : seatTag(view, view.winner)}` : null,
    "",
    "**Fighters**",
    fighterLines(view),
    "",
    "**Cards (counts only — no hidden info)**",
    cardLines(view),
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
  const first = input.description.trim().split("\n")[0].slice(0, 80).trim();
  // Reporter first, then every other seat — a duel reads "King Kong vs Baba
  // Yaga"; a 3P game reads "King Kong vs Baba Yaga vs Thrall".
  const others = view.players.filter((p) => !p.you).map((p) => prettyHero(heroForSeat(view, p)));
  const matchup = [prettyHero(view.self.heroId), ...others].join(" vs ");
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
