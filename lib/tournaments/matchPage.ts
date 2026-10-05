/**
 * The match page's model (#1218): one api match in, the state card and every
 * line the page draws out. Pure — no React, no clock except the `now` passed in.
 *
 * Six states, named as mockup v2 names them (Dean, 2026-10-05):
 * waiting for a game · opponent ready (join now) · you're ready (seat held) ·
 * in play now · decided · decided by deadline rule — plus deadline passed
 * (organizer deciding, #1230): nothing to play, the api hasn't decided yet.
 *
 * A match is `firstTo` + an ordered `games[]` (never one game id); a game's
 * heroes/map are its own `assignment`, else the match's `matchup`.
 */
import { heroDisplayName } from "@/lib/stats/roster";

import { DECIDED_NOTE, countsGame, scoredGame, roundCount, roundName } from "./bracket";
import { mapTitle } from "./options";
import type { Assignment, Game, Match, MatchDetail, MatchPlayer } from "./types";

export type MatchPageState =
  | "waiting"
  | "opponent_ready"
  | "you_ready"
  | "in_play"
  | "deadline_passed"
  | "deadline_hold"
  | "decided"
  | "decided_by_rule"
  | "cancelled";

/** The names the mockup and the ticket use. */
export const MATCH_STATE_NAME: Record<MatchPageState, string> = {
  waiting: "waiting for a game",
  opponent_ready: "opponent ready (join now)",
  you_ready: "you're ready (seat held)",
  in_play: "in play now",
  deadline_passed: "deadline passed (organizer deciding)",
  deadline_hold: "deadline passed (pre-deadline seat hold live)",
  decided: "decided",
  decided_by_rule: "decided by deadline rule",
  cancelled: "cancelled",
};

/** Which side of the match the viewer is, or null for a spectator. */
export const mySide = (d: MatchDetail, myUserId: string | null): "a" | "b" | null => {
  if (!myUserId) return null;
  if (d.players.a?.userId === myUserId) return "a";
  if (d.players.b?.userId === myUserId) return "b";
  return null;
};

/**
 * Ready-checks of the match's CURRENT slot entries. An organizer re-seat can
 * leave a displaced player's check behind; it is nobody's in this match (#1256).
 */
export const currentChecks = (d: MatchDetail): MatchDetail["readyChecks"] =>
  d.readyChecks.filter((c) => c.entryId === d.match.slotA || c.entryId === d.match.slotB);

/** The live room still holding a seat (its 15 minutes not yet up) and made by a current slot entry, or null. */
export const heldRoom = (d: MatchDetail, now: number) =>
  d.liveRoom &&
  Date.parse(d.liveRoom.expiresAt) > now &&
  (d.liveRoom.readyEntryId === d.match.slotA || d.liveRoom.readyEntryId === d.match.slotB)
    ? d.liveRoom
    : null;

/** True once the match deadline is behind `now` (no deadline = never). */
export const deadlinePassed = (deadlineAt: string | null, now: number): boolean => {
  const t = deadlineAt ? Date.parse(deadlineAt) : NaN;
  return Number.isFinite(t) && t <= now;
};

/**
 * Past the deadline with no game in play, what the api's `resolveDeadline`
 * (unbrewed-api src/tournaments/deadline.ts) will do — only ready-checks made
 * at or before the deadline count:
 *  - `ready_check`: exactly one player has an unanswered check (marked so, or
 *    pending with its hold run out — the 60s loop hasn't swept it yet) → that
 *    player wins by rule 1, on the loop's next tick.
 *  - `hold`: otherwise, a pre-deadline seat hold is still live → the opponent
 *    can still join it; keep the ready / join states.
 *  - `organizer`: neither or both → the organizer has 24h, then the higher seed.
 * `open` = the deadline hasn't passed (or a game is in play).
 */
export type DeadlineOutcome =
  | { kind: "open" }
  | { kind: "hold" }
  | { kind: "ready_check"; winner: string }
  | { kind: "organizer" };

export const deadlineOutcome = (d: MatchDetail, now: number): DeadlineOutcome => {
  const m = d.match;
  if (m.cancelled || m.inPlay || m.status === "in_play" || !m.slotA || !m.slotB || !deadlinePassed(m.deadlineAt, now))
    return { kind: "open" };
  const deadline = Date.parse(m.deadlineAt!);
  const before = currentChecks(d).filter((c) => Date.parse(c.createdAt) <= deadline);
  const expired = (c: MatchDetail["readyChecks"][number]) => Date.parse(c.expiresAt) <= now;
  const unanswered = [m.slotA, m.slotB].filter((e) =>
    before.some((c) => c.entryId === e && (c.outcome === "unanswered" || (c.outcome === "pending" && expired(c)))),
  );
  if (unanswered.length === 1) return { kind: "ready_check", winner: unanswered[0] };
  if (before.some((c) => c.outcome === "pending" && !expired(c))) return { kind: "hold" };
  return { kind: "organizer" };
};

/** The deadline-passed copy (#1230), shared by the match page, the /pro banner and the account menu. */
export const DEADLINE_PASSED_TEXT = "The deadline has passed. The organizer is deciding this match.";
/**
 * The organizer's fallback. A round-robin top-2 final goes to the better
 * standings rank (slot A, #1), not the original seed.
 */
export const deadlinePassedRule = (stage?: Match["stage"], cutoff?: string | null): string => {
  const when = cutoff ? `by ${dateTime(cutoff)}` : "within 24h";
  return stage === "group"
    ? `If they don't decide ${when}, the higher seed wins the match.`
    : stage === "final"
      ? `If they don't decide ${when}, the player ranked higher in the standings wins the tournament.`
      : `If they don't decide ${when}, the higher seed advances.`;
};

/** The organizer's own view (D5): they are the one deciding, with the cutoff spelled out. */
export const DEADLINE_PASSED_ORGANIZER_TEXT = "The deadline has passed. You are deciding this match.";
export const deadlinePassedOrganizerRule = (stage?: Match["stage"], cutoff?: string | null): string => {
  const when = cutoff ? `by ${dateTime(cutoff)}` : "within 24h";
  const after =
    stage === "group"
      ? "the higher seed wins the match"
      : stage === "final"
        ? "the player ranked higher in the standings wins the tournament"
        : "the higher seed advances";
  return `Decide ${when}, or ${after}.`;
};

/** Rule 1 waiting on the loop: "The deadline has passed. bob was ready and carol never joined, so bob advances." */
export const deadlineReadyCheckText = (d: MatchDetail, winner: string, myEntry: string | null): string => {
  const won = winner === d.match.slotA ? d.players.a : d.players.b;
  const lost = winner === d.match.slotA ? d.players.b : d.players.a;
  const [verb, youVerb] =
    d.match.stage === "group"
      ? ["wins the match", "win the match"]
      : d.match.stage === "final"
        ? ["wins the tournament", "win the tournament"]
        : ["advances", "advance"];
  const lead = "The deadline has passed.";
  if (myEntry === winner) return `${lead} You were ready and ${playerName(lost)} never joined, so you ${youVerb}.`;
  if (myEntry) return `${lead} ${playerName(won)} was ready and you never joined, so ${playerName(won)} ${verb}.`;
  return `${lead} ${playerName(won)} was ready and ${playerName(lost)} never joined, so ${playerName(won)} ${verb}.`;
};

/** Entry of the player whose pre-deadline seat hold is still live (past the deadline), or null. */
export const deadlineHolder = (d: MatchDetail, now: number): string | null => {
  const deadline = d.match.deadlineAt ? Date.parse(d.match.deadlineAt) : NaN;
  const c = currentChecks(d).find(
    (x) => x.outcome === "pending" && Date.parse(x.createdAt) <= deadline && Date.parse(x.expiresAt) > now,
  );
  return c?.entryId ?? null;
};

export const matchPageState = (d: MatchDetail, myUserId: string | null, now: number): MatchPageState => {
  const m = d.match;
  if (m.status === "decided" || m.winner)
    return m.decidedBy === "deadline_ready_check" || m.decidedBy === "deadline_higher_seed"
      ? "decided_by_rule"
      : "decided";
  // An undecided match of a cancelled tournament reads cancelled whatever its raw status says.
  if (m.cancelled) return "cancelled";
  // A game that started before the deadline finishes and counts (settled rule 3).
  if (m.inPlay || m.status === "in_play") return "in_play";
  // Past the deadline only a live pre-deadline seat hold keeps the match playable.
  const outcome = deadlineOutcome(d, now).kind;
  if (outcome === "ready_check" || outcome === "organizer") return "deadline_passed";
  const room = heldRoom(d, now);
  const side = mySide(d, myUserId);
  // Past the deadline the holder still has their seat, but the other player can't
  // join it: the holder wins by rule 1 if they never show (p2p #1253).
  if (outcome === "hold") {
    const holder = deadlineHolder(d, now);
    const mine = side === "a" ? m.slotA : side === "b" ? m.slotB : null;
    if (!mine || mine !== holder) return "deadline_hold";
  }
  if (room && side) {
    const mine = side === "a" ? m.slotA : m.slotB;
    return room.readyEntryId === mine ? "you_ready" : "opponent_ready";
  }
  return "waiting";
};

/** "Semifinal 2", "Quarterfinal 3", "Final", "Round of 16 · Match 4". */
export const matchTitle = (
  round: number,
  position: number,
  size: number,
  stage?: Match["stage"],
): string => {
  // Round robin (#1221): rounds are only a display grouping, there are no semifinals.
  if (stage === "final") return "Final";
  if (stage === "group") return `Round ${round} · Match ${position + 1}`;
  const rounds = roundCount(size);
  const name = roundName(round, rounds);
  if (name === "Final") return "Final";
  if (name === "Semifinals" || name === "Quarterfinals") return `${name.slice(0, -1)} ${position + 1}`;
  return `${name} · Match ${position + 1}`;
};

/** Where the winner goes: "Final", or the next match's title. */
export const nextMatchTitle = (d: MatchDetail, size: number): string | null =>
  d.match.nextMatchId ? matchTitle(d.match.round + 1, d.match.position >> 1, size) : null;

/** A game's heroes/map: its own assignment once it exists, else the match's. */
export const gameAssignment = (d: MatchDetail, game?: Game): Assignment => game?.assignment ?? d.match.matchup;

export interface MatchupLine {
  /** Null when players pick (`free`, or a side the rule leaves open). */
  heroA: string | null;
  heroB: string | null;
  map: string | null;
  /** Heroes are set → "you skip the hero picker". */
  heroesLocked: boolean;
}

export const matchupLine = (a: Assignment): MatchupLine => ({
  heroA: a.heroes.a ? heroDisplayName(a.heroes.a) : null,
  heroB: a.heroes.b ? heroDisplayName(a.heroes.b) : null,
  map: a.map ? mapTitle(a.map) : null,
  heroesLocked: !!(a.heroes.a && a.heroes.b),
});

export const playerName = (p: MatchPlayer | null): string => p?.username ?? (p ? "Player" : "TBD");

/** "Online now" only within the last 60s, else "Last seen in this match 12 min ago" (api `lastSeenAt` = latest ready-check press in this match); null when never. */
export const lastSeen = (iso: string | null | undefined, now: number): { online: boolean; text: string } | null => {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 60_000) return { online: true, text: "Online now" };
  const min = Math.floor(ms / 60_000);
  if (min < 60) return { online: false, text: `Last seen in this match ${min} min ago` };
  if (min < 24 * 60) return { online: false, text: `Last seen in this match ${Math.floor(min / 60)}h ago` };
  return { online: false, text: `Last seen in this match ${shortDate(iso)}` };
};

/** "Mon 5 Oct". */
export const shortDate = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
};

/** "Wed 7 Oct, 14:00". */
export const dateTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${shortDate(iso)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

/** "21:04". */
export const clock = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

/** Seat-hold countdown, `M:SS` (the mockup's format); "0:00" once up. */
export const seatClock = (expiresAt: string | null, now: number): string => {
  const ms = expiresAt ? Math.max(0, Date.parse(expiresAt) - now) : 0;
  const s = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Match-deadline countdown parts: days, hours, minutes; null once passed. */
export const deadlineParts = (deadline: string | null, now: number) => {
  const ms = deadline ? Date.parse(deadline) - now : NaN;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.floor(ms / 60_000);
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), m: m % 60 };
};

/** How much of the match window has gone, 0–100. */
export const windowSpent = (opensAt: string | null, deadlineAt: string | null, now: number): number => {
  const a = opensAt ? Date.parse(opensAt) : NaN;
  const b = deadlineAt ? Date.parse(deadlineAt) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(Math.min(1, Math.max(0, (now - a) / (b - a))) * 100);
};

/** The rule that decided the match, named — null for a played result. */
export const decidedRule = (d: MatchDetail): string | null =>
  d.match.decidedBy ? DECIDED_NOTE[d.match.decidedBy].rule : null;

/**
 * The decision line under the banner (D2): the organizer's override / confirm
 * with their note, or the 24h auto-confirm. A deadline rule has its own
 * one-liner in the rules card, so it adds nothing here. Null = nothing to say.
 */
export const decisionLine = (d: MatchDetail): string | null => {
  const dec = d.decision;
  if (!dec || d.match.status !== "decided") return null;
  if (dec.by === "organizer") return dec.note ? `Decided by the organizer: ${dec.note}` : "Decided by the organizer.";
  if (d.match.decidedBy === "unverified_confirmed") return "Result confirmed automatically, 24h after it was found.";
  return null;
};

/** The one rule line a rule-decided match keeps (D6): "Decided by Rule 1 · unanswered ready-check". */
export const decidedByRuleLine = (d: MatchDetail): string | null =>
  d.match.decidedBy === "deadline_ready_check"
    ? "Decided by Rule 1 · unanswered ready-check."
    : d.match.decidedBy === "deadline_higher_seed"
      ? `Decided by Rule 2 · ${d.match.stage === "final" ? "the organizer did not decide in 24h, so the better standings rank won" : "the organizer did not decide in 24h, so the higher seed won"}.`
      : null;

/** The organizer's cutoff after a missed deadline: deadline + 24h (settled rule 2); null without a deadline. */
export const organizerCutoff = (deadlineAt: string | null): string | null => {
  const t = deadlineAt ? Date.parse(deadlineAt) : NaN;
  return Number.isFinite(t) ? new Date(t + 24 * 3_600_000).toISOString() : null;
};

export interface GameRow {
  game: Game;
  /** 1-based, as players count. */
  n: number;
  state: "in_play" | "won" | "unverified" | "rejected" | "after_decision" | "overridden";
  winnerName: string | null;
  heroes: string | null;
}

/**
 * A finished game whose winner the organizer overrode (L2-2): the match was decided by the organizer
 * for the other entry, so the game stays on record but does not count.
 */
export const overriddenGame = (m: Match, g: Game): boolean =>
  m.decidedBy === "organizer" && !!g.finishedAt && !g.rejectedAt && !g.recordedAfterDecision && !!g.winnerEntry && !!m.winner && g.winnerEntry !== m.winner;

/** The games list, oldest first. Unstarted games aren't rows. */
export const gameRows = (d: MatchDetail): GameRow[] => {
  // An unverified game can never confirm once the match is decided: it reads not counted (#1256).
  const decided = d.match.status === "decided" || !!d.match.winner;
  return d.match.games.map((g) => {
    const mu = matchupLine(gameAssignment(d, g));
    const winner =
      g.winnerEntry === d.match.slotA ? d.players.a : g.winnerEntry === d.match.slotB ? d.players.b : null;
    return {
      game: g,
      n: g.gameIndex + 1,
      state: g.rejectedAt ? "rejected" : (g.recordedAfterDecision || (decided && !g.verified && d.match.decidedBy !== "unverified_confirmed")) && g.finishedAt ? "after_decision" : !g.finishedAt ? "in_play" : g.verified ? (overriddenGame(d.match, g) ? "overridden" : "won") : "unverified",
      winnerName: winner ? playerName(winner) : null,
      heroes: mu.heroA && mu.heroB ? `${mu.heroA} vs ${mu.heroB}` : null,
    };
  });
};

/** "24 min" between a game's start and finish. */
export const gameLength = (g: Game): string | null => {
  if (!g.startedAt || !g.finishedAt) return null;
  const min = Math.round((Date.parse(g.finishedAt) - Date.parse(g.startedAt)) / 60_000);
  return Number.isFinite(min) && min >= 0 ? `${min} min` : null;
};

/** Games won per side — the score a decided match shows ("1–0"). */
export const score = (d: MatchDetail): { a: number; b: number } => {
  const won = (entry: string | null) =>
    entry ? d.match.games.filter((g) => scoredGame(d.match, g) && g.winnerEntry === entry).length : 0;
  return { a: won(d.match.slotA), b: won(d.match.slotB) };
};

/** A ready-check, as the side card lists it. */
export const readyCheckLine = (
  d: MatchDetail,
  rc: MatchDetail["readyChecks"][number],
  myUserId: string | null,
): { text: string; at: string; missed: boolean } => {
  const p = rc.entryId === d.match.slotA ? d.players.a : rc.entryId === d.match.slotB ? d.players.b : null;
  const you = !!p && p.userId === myUserId;
  const who = you ? "You" : playerName(p);
  const verb = rc.role === "join" ? "joined" : "pressed Play";
  // The viewer is the OTHER player of the pair: they are the one who never answered.
  const viewerIsOther = !you && !!myUserId && [d.players.a, d.players.b].some((q) => q?.userId === myUserId);
  const text =
    rc.outcome === "unanswered"
      ? you
        ? "Your opponent didn't join"
        : viewerIsOther
          ? "You didn't join"
          : `${who} ${verb} · no answer`
      : rc.outcome === "pending"
        ? `${who} ${you ? "are" : "is"} ready now`
        : `${who} ${verb}`;
  return { text, at: `${shortDate(rc.createdAt)} ${clock(rc.createdAt)}`, missed: rc.outcome === "unanswered" };
};

/**
 * Seat names for a replay watched by someone who played neither side (D12):
 * "YOU"/"OPPONENT" means nothing to them, so both seats read as the players.
 * Which runtime seat is which entry comes from the game's winner, else from
 * the assigned heroes when they differ; null when neither pins it down (a
 * mirror with no winner), so the HUD keeps its neutral labels.
 */
export const replaySeatNames = (
  d: MatchDetail,
  game: Game,
  meta: { winner: string | null; heroes: Partial<Record<string, string>> },
): Record<string, string> | null => {
  const { slotA, slotB } = d.match;
  const names = { a: playerName(d.players.a), b: playerName(d.players.b) };
  const seats = Object.keys(meta.heroes);
  if (seats.length !== 2) return null;
  const other = (s: string) => seats.find((x) => x !== s)!;
  let seatA: string | null = null;
  if (meta.winner && seats.includes(meta.winner) && game.winnerEntry) {
    if (game.winnerEntry === slotA) seatA = meta.winner;
    else if (game.winnerEntry === slotB) seatA = other(meta.winner);
  }
  const { a, b } = game.assignment.heroes;
  if (!seatA && a && b && a !== b) {
    seatA = seats.find((s) => meta.heroes[s] === a) ?? null;
    if (seatA && meta.heroes[other(seatA)] !== b) seatA = null;
  }
  return seatA ? { [seatA]: names.a, [other(seatA)]: names.b } : null;
};
