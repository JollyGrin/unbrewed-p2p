/**
 * Organizer tools (#1219): what each "Needs your attention" item says and
 * offers, the matchup form → rule mapping, and api error text. Pure; the
 * components render it and call ./api.
 *
 * The matchup is stored as a RULE (`MatchupRule`), never as per-game fields —
 * the form below only decides which rule to send. What a game then looks like
 * is `assignment()`'s job (./matchup).
 */
import type { AttentionItem, TournamentFailure } from "./api";
import { matchCode } from "./bracket";
import type { Entry, MapRef, Match, MatchupRule } from "./types";

export type AttentionTone = "gold" | "ink" | "red";

/** Which buttons a queue row offers (the component maps them to api calls). */
export type AttentionAction =
  | { type: "confirm"; gameIndex: number; label: string }
  | { type: "award"; entryId: string; label: string; note: string }
  /** Reject an unverified game ("Not valid", api #75): one call, no override. */
  | { type: "reject"; gameIndex: number; label: string }
  | { type: "override"; label: string }
  | { type: "matchup"; label: string }
  | { type: "open"; label: string };

export interface AttentionRow {
  key: string;
  matchId: string;
  tone: AttentionTone;
  title: string;
  context: string;
  body: string;
  /** ISO time the row resolves itself, if it does. */
  due: string | null;
  dueLabel: string;
  actions: AttentionAction[];
}

export const clockOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const nameOf = (entries: readonly Entry[], id: string | null): string =>
  entries.find((e) => e.id === id)?.username ?? "a player";

/** Round-robin group matches and the top-2 final have no "next round": the winner just wins the match. */
const RULE_COPY = (verb: string): Record<string, string> => ({
  deadline_ready_check: `Rule 1 applied: one player pressed Play and the other never answered, so the ready player ${verb}.`,
  deadline_higher_seed: `Rule 2 applied: no game was played and the organizer did not decide in 24h, so the higher seed ${verb}.`,
});

/** Rows for the queue, most urgent first (the api's order is a tie-break). */
export const attentionRows = (
  items: readonly AttentionItem[],
  entries: readonly Entry[],
  matches: readonly Match[],
  rounds: number,
  now: number = Date.now(),
): AttentionRow[] => {
  const rows = items.flatMap((item, i): AttentionRow[] => {
    const m = matches.find((x) => x.id === item.matchId);
    // A cancelled tournament's open matches need nobody's decision.
    if (m?.cancelled) return [];
    const code =
      m?.stage === "final"
        ? "Final"
        : m?.stage === "group"
          ? `R${item.round} · ${item.position + 1}`
          : matchCode(item.round, item.position, rounds);
    const a = nameOf(entries, m?.slotA ?? null);
    const b = nameOf(entries, m?.slotB ?? null);
    const vs = `${a} vs ${b}`;
    const verb = m?.stage === "group" ? "wins the match" : m?.stage === "final" ? "wins the tournament" : "advances";
    const key = `${item.kind}:${item.matchId}:${i}`;
    const open: AttentionAction = { type: "open", label: "Open match →" };
    const base = { key, matchId: item.matchId, due: null, dueLabel: "" };
    switch (item.kind) {
      case "awaiting_organizer": {
        // api #88: `reason: ready_hold_pending` + `holdUntil` + `readyBy`; older builds sent `readyChecks` (or nothing).
        const hold = item.readyChecks?.find((c) => c.outcome === "pending" && Date.parse(c.expiresAt) > now);
        const holders = item.readyBy?.length ? item.readyBy : hold ? [hold.entryId] : [];
        const until = item.holdUntil ?? hold?.expiresAt ?? null;
        const lead =
          (item.reason === "ready_hold_pending" || hold) && holders.length && until
            ? `No game yet. ${holders.map((id) => nameOf(entries, id)).join(" and ")} pressed Play and ${holders.length > 1 ? "hold seats" : "holds a seat"} until ${clockOf(until)}; the rules decide after that.`
            : "No game was played. If a player is holding a seat, the rules decide when the hold ends; otherwise it's your call.";
        return [
          {
            ...base,
            tone: "red",
            title: `Your call · ${vs}`,
            context: `${code} · deadline passed`,
            body: `${lead} You have until the grace period ends; then the higher seed ${verb}.`,
            due: item.until,
            dueLabel: "left",
            actions: [
              ...(m?.slotA
                ? [
                    {
                      type: "award",
                      entryId: m.slotA,
                      label: `Award to ${a}`,
                      note: "Awarded by the organizer after the deadline.",
                    } as const,
                  ]
                : []),
              ...(m?.slotB
                ? [
                    {
                      type: "award",
                      entryId: m.slotB,
                      label: `Award to ${b}`,
                      note: "Awarded by the organizer after the deadline.",
                    } as const,
                  ]
                : []),
              open,
            ],
          },
        ];
      }
      case "deadline_passed":
        return [
          {
            ...base,
            tone: "ink",
            title: `Deadline passed · ${code} decided by rule`,
            context: `${vs}`,
            body: `${(item.decidedBy && RULE_COPY(verb)[item.decidedBy]) || "The deadline rule has decided this match."}${item.winner ? ` ${nameOf(entries, item.winner)} ${verb}.` : ""} Nothing to do unless you want to override.`,
            actions: [{ type: "override", label: "Override…" }, open],
          },
        ];
      case "unverified_game": {
        const w = nameOf(entries, item.winnerEntry);
        return [
          {
            ...base,
            tone: "gold",
            title: `Unverified result · ${code} ${vs}`,
            context: `${code} · played in a normal room, not from the match`,
            body: `${w} won, but the game wasn't started from the match. ${verb === "advances" ? "Nobody advances" : "Nobody gets the win"} until it's confirmed. If you do nothing it auto-confirms 24h after it was detected.`,
            actions: [
              ...(item.winnerEntry
                ? [
                    {
                      type: "confirm",
                      gameIndex: item.gameIndex,
                      label: `Confirm for ${w}`,
                    } as const,
                  ]
                : []),
              {
                type: "reject",
                gameIndex: item.gameIndex,
                label: "Not valid…",
              },
              open,
            ],
          },
        ];
      }
      case "entrant_left": {
        const left = nameOf(entries, item.entryId);
        const other = m?.slotA === item.entryId ? m?.slotB : m?.slotA;
        return [
          {
            ...base,
            tone: "red",
            title: `Player dropped · ${left}`,
            context: `${code} · ${vs}`,
            body: `${left} left with this match still to play.${other ? ` Award it to ${nameOf(entries, other)} as a forfeit, or decide it another way.` : ""}`,
            actions: [
              ...(other
                ? [
                    {
                      type: "award",
                      entryId: other,
                      label: `Forfeit to ${nameOf(entries, other)}`,
                      note: `${left} left the tournament.`,
                    } as const,
                  ]
                : []),
              open,
            ],
          },
        ];
      }
      case "no_matchup":
        return [
          {
            ...base,
            tone: "gold",
            title: `No matchup set · ${vs}`,
            context: `${code} · opened without a matchup`,
            body: `You chose "Organizer sets each match". Until you set one, they can press Play and pick their own heroes.`,
            actions: [{ type: "matchup", label: "Set matchup" }, open],
          },
        ];
      default:
        return [];
    }
  });
  const urgency = (r: AttentionRow) =>
    r.tone === "red" ? 0 : r.tone === "gold" ? 1 : 2;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => urgency(x.r) - urgency(y.r) || x.i - y.i)
    .map(({ r }) => r);
};

/** "18h left" / "40m left"; "" once the time has passed. */
export const dueText = (iso: string | null, now: number): string => {
  if (!iso) return "";
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms) || ms <= 0) return "";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1
    ? `${h}h left`
    : `${Math.max(1, Math.round(ms / 60_000))}m left`;
};

/** The rule the matchup form sends: free / map / fixed, from what was picked. */
export const buildMatchupRule = (pick: {
  a: string;
  b: string;
  map: MapRef | null;
}): MatchupRule => {
  const heroes: { a?: string; b?: string } = {};
  if (pick.a) heroes.a = pick.a;
  if (pick.b) heroes.b = pick.b;
  const hasHeroes = Object.keys(heroes).length > 0;
  if (hasHeroes)
    return { mode: "fixed", heroes, ...(pick.map ? { map: pick.map } : {}) };
  if (pick.map) return { mode: "map", map: pick.map };
  return { mode: "free" };
};

export const NOTE_MAX = 500;

const ROUND_MAPS_COPY = "The per-round maps don't fit that size. Pick a map for every round, then save.";

const ERRORS: Record<string, string> = {
  match_already_decided:
    "This match was decided while you were looking. Reload to see the result.",
  match_changed:
    "This match changed while you were looking. Reload and try again.",
  next_match_started:
    "The next match has already started, so this result can't be changed.",
  bye_match: "A bye can't be overridden.",
  players_not_known: "Both players must be known first.",
  not_running: "This tournament isn't running.",
  invalid_note: `The note can be at most ${NOTE_MAX} characters.`,
  winner_not_in_match: "That player isn't in this match.",
  unsupported_matchup_mode: "That matchup mode isn't available yet.",
  invalid_matchup_rule: "That matchup isn't valid.",
  game_not_finished: "That game hasn't finished yet.",
  already_verified:
    "That result is already confirmed. To change it, override the match instead.",
  already_rejected: "That result was already rejected.",
  game_rejected: "That result was rejected, so it can't be confirmed.",
  forbidden: "Only the organizer can do that.",
  already_started: "The tournament has already started, so it can't be edited.",
  size_below_entries: "More players have already joined than that size allows.",
  invalid_status_transition: "The tournament can't be changed that way from its current state.",
  invalid_signupClosesAt: "Pick a signup close time in the future.",
  invalid_name: "Give it a valid name.",
  invalid_size: "That size isn't available.",
  invalid_roundMaps: ROUND_MAPS_COPY,
  invalid_round_maps: ROUND_MAPS_COPY,
  invalid_match_window: "That match window isn't available.",
  immutable_field: "That setting can't be changed.",
};

export const organizerErrorText = (
  r: { reason: TournamentFailure; code?: string; message?: string },
  /** The tournament's status after a re-fetch, when known. */
  status?: string,
): string =>
  (r.code === "already_started" && status === "cancelled" ? "This tournament was cancelled." : null) ||
  (r.code && ERRORS[r.code]) ||
  // round-map refusals arrive as raw api sentences; say them in our own words
  (r.reason === "invalid" && r.message && /round keys|'final' key|roundMaps|round maps/i.test(r.message) ? ROUND_MAPS_COPY : null) ||
  // A refusal we have no copy for (e.g. cancel-running before api #91): show the api's own words.
  (r.message && (r.reason === "conflict" || r.reason === "invalid") ? r.message : null) ||
  (r.reason === "unauthorized"
    ? "Your session ended. Sign in with Discord again."
    : r.reason === "rate_limited"
      ? "Slow down a moment, then try again."
      : r.reason === "conflict" || r.reason === "invalid"
        ? "The server refused that change."
        : "Couldn't reach the server. Try again.");

/**
 * The override body. Re-deciding a decided match must carry `replacesWinner` =
 * the current winner (api #73).
 */
export const overrideBody = (
  m: Pick<Match, "winner">,
  winnerEntry: string,
  note: string,
) => ({
  winnerEntry,
  ...(note.trim() ? { note: note.trim() } : {}),
  ...(m.winner ? { replacesWinner: m.winner } : {}),
});

/** True when `userId` is the tournament's organizer — the only viewer organizer tools render for. */
export const isOrganizerOf = (
  t: { organizer?: { userId: string } } | null | undefined,
  userId: string | null,
): boolean => !!t?.organizer && !!userId && t.organizer.userId === userId;

/**
 * Matches whose ready-check hold started before the deadline and is still live, keyed by match id
 * (organizer's attention queue, api #88). The bracket shows them instead of a bare "Deadline passed".
 */
export const liveHolds = (
  items: readonly AttentionItem[],
  entries: readonly Entry[],
  now: number,
): Record<string, { name: string; until: string }> => {
  const out: Record<string, { name: string; until: string }> = {};
  for (const item of items) {
    if (item.kind !== "awaiting_organizer") continue;
    const hold = item.readyChecks?.find((c) => c.outcome === "pending" && Date.parse(c.expiresAt) > now);
    const holders = item.readyBy?.length ? item.readyBy : hold ? [hold.entryId] : [];
    const until = item.holdUntil ?? hold?.expiresAt ?? null;
    if (!holders.length || !until || Date.parse(until) <= now) continue;
    out[item.matchId] = { name: holders.map((id) => nameOf(entries, id)).join(" and "), until };
  }
  return out;
};
