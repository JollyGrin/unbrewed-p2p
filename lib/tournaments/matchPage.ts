/**
 * The match page's model (#1218): one api match in, the state card and every
 * line the page draws out. Pure — no React, no clock except the `now` passed in.
 *
 * Six states, named as mockup v2 names them (Dean, 2026-10-05):
 * waiting for a game · opponent ready (join now) · you're ready (seat held) ·
 * in play now · decided · decided by deadline rule.
 *
 * A match is `firstTo` + an ordered `games[]` (never one game id); a game's
 * heroes/map are its own `assignment`, else the match's `matchup`.
 */
import { heroDisplayName } from "@/lib/stats/roster";

import { DECIDED_NOTE, roundCount, roundName } from "./bracket";
import { mapTitle } from "./options";
import type { Assignment, Game, Match, MatchDetail, MatchPlayer } from "./types";

export type MatchPageState =
  | "waiting"
  | "opponent_ready"
  | "you_ready"
  | "in_play"
  | "decided"
  | "decided_by_rule";

/** The names the mockup and the ticket use. */
export const MATCH_STATE_NAME: Record<MatchPageState, string> = {
  waiting: "waiting for a game",
  opponent_ready: "opponent ready (join now)",
  you_ready: "you're ready (seat held)",
  in_play: "in play now",
  decided: "decided",
  decided_by_rule: "decided by deadline rule",
};

/** Which side of the match the viewer is, or null for a spectator. */
export const mySide = (d: MatchDetail, myUserId: string | null): "a" | "b" | null => {
  if (!myUserId) return null;
  if (d.players.a?.userId === myUserId) return "a";
  if (d.players.b?.userId === myUserId) return "b";
  return null;
};

/** The live room still holding a seat (its 15 minutes not yet up), or null. */
export const heldRoom = (d: MatchDetail, now: number) =>
  d.liveRoom && Date.parse(d.liveRoom.expiresAt) > now ? d.liveRoom : null;

export const matchPageState = (d: MatchDetail, myUserId: string | null, now: number): MatchPageState => {
  const m = d.match;
  if (m.status === "decided" || m.winner)
    return m.decidedBy === "deadline_ready_check" || m.decidedBy === "deadline_higher_seed"
      ? "decided_by_rule"
      : "decided";
  if (m.inPlay || m.status === "in_play") return "in_play";
  const room = heldRoom(d, now);
  const side = mySide(d, myUserId);
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

/** "Online now" within 5 minutes, else "Last active 12 min ago" / "… Mon 5 Oct". */
export const lastActive = (iso: string | null, now: number): { online: boolean; text: string } | null => {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 5 * 60_000) return { online: true, text: "Online now" };
  const min = Math.floor(ms / 60_000);
  if (min < 60) return { online: false, text: `Last active ${min} min ago` };
  if (min < 24 * 60) return { online: false, text: `Last active ${Math.floor(min / 60)}h ago` };
  return { online: false, text: `Last active ${shortDate(iso)}` };
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

export interface GameRow {
  game: Game;
  /** 1-based, as players count. */
  n: number;
  state: "in_play" | "won" | "unverified" | "rejected";
  winnerName: string | null;
  heroes: string | null;
}

/** The games list, oldest first. Unstarted games aren't rows. */
export const gameRows = (d: MatchDetail): GameRow[] =>
  d.match.games.map((g) => {
    const mu = matchupLine(gameAssignment(d, g));
    const winner =
      g.winnerEntry === d.match.slotA ? d.players.a : g.winnerEntry === d.match.slotB ? d.players.b : null;
    return {
      game: g,
      n: g.gameIndex + 1,
      state: g.rejectedAt ? "rejected" : !g.finishedAt ? "in_play" : g.verified ? "won" : "unverified",
      winnerName: winner ? playerName(winner) : null,
      heroes: mu.heroA && mu.heroB ? `${mu.heroA} vs ${mu.heroB}` : null,
    };
  });

/** "24 min" between a game's start and finish. */
export const gameLength = (g: Game): string | null => {
  if (!g.startedAt || !g.finishedAt) return null;
  const min = Math.round((Date.parse(g.finishedAt) - Date.parse(g.startedAt)) / 60_000);
  return Number.isFinite(min) && min >= 0 ? `${min} min` : null;
};

/** Games won per side — the score a decided match shows ("1–0"). */
export const score = (d: MatchDetail): { a: number; b: number } => {
  const won = (entry: string | null) =>
    entry ? d.match.games.filter((g) => g.finishedAt && !g.rejectedAt && g.winnerEntry === entry).length : 0;
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
  const text =
    rc.outcome === "unanswered"
      ? `${who} ${verb} · no answer`
      : rc.outcome === "pending"
        ? `${who} ${you ? "are" : "is"} ready now`
        : `${who} ${verb}`;
  return { text, at: `${shortDate(rc.createdAt)} ${clock(rc.createdAt)}`, missed: rc.outcome === "unanswered" };
};
