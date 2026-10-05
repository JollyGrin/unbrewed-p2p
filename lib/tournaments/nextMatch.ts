/**
 * "Your next match" (#1220): the banner on /pro and the account-menu card.
 * Pure — the api's `nextMatch` (+ the match detail when we have it) in, the
 * lines both surfaces draw out. States follow mockup v2's banner: it is your
 * turn to play, your opponent is ready (join now), you're ready (seat held),
 * or the game is in play now — and, once the deadline is behind us with no
 * game started, the organizer is deciding (#1230): nothing to press.
 */
import { matchHref } from "./bracket";
import {
  DEADLINE_PASSED_TEXT,
  deadlineOutcome,
  deadlineParts,
  deadlinePassed,
  deadlinePassedRule,
  deadlineReadyCheckText,
  heldRoom,
  lastSeen,
  matchTitle,
  matchupLine,
  seatClock,
} from "./matchPage";
import type { MatchDetail, NextMatch } from "./types";

export type NextMatchState = "open" | "opponent_ready" | "you_ready" | "in_play" | "deadline_passed";

export interface NextMatchView {
  state: NextMatchState;
  slug: string;
  matchId: string;
  tournamentName: string;
  /** "Semifinal 2 vs bountyhuntr". */
  title: string;
  opponent: string;
  opponentAvatar: string;
  /** "bountyhuntr is ready · seat held 11:48" and the like. */
  caption: string;
  /** "You play Kenshiro" — null when the matchup leaves heroes open. */
  youPlay: string | null;
  map: string | null;
  /** "Online now" / "Last seen in this match 12 min ago"; null when unknown. */
  opponentActive: string | null;
  /** "1d 17h left" / "5h 12m left" / "42m left". */
  timeLeft: string | null;
  /** Deadline passed: "The deadline has passed. The organizer is deciding…" + the 24h rule. */
  notice: string | null;
  href: string;
  /** What the main button does. */
  primary: "ready" | "join" | "view";
  primaryLabel: string;
}

const deadlineNotice = (detail: MatchDetail | null, myEntry: string, stage: NextMatch["match"]["stage"], now: number) => {
  const out = detail ? deadlineOutcome(detail, now) : null;
  return out?.kind === "ready_check" && detail
    ? deadlineReadyCheckText(detail, out.winner, myEntry)
    : `${DEADLINE_PASSED_TEXT} ${deadlinePassedRule(stage)}`;
};

export const timeLeftText = (deadlineAt: string | null, now: number): string | null => {
  const p = deadlineParts(deadlineAt, now);
  if (!p) return null;
  if (p.d > 0) return `${p.d}d ${p.h}h left`;
  if (p.h > 0) return `${p.h}h ${p.m}m left`;
  return `${Math.max(1, p.m)}m left`;
};

/** The bracket size, from the row's own field or the player's tournament list. */
export const sizeOf = (n: NextMatch, listed: readonly { id: string; size: number }[] = []) =>
  n.tournament.size ?? listed.find((t) => t.id === n.tournament.id)?.size ?? null;

export const nextMatchView = (
  n: NextMatch,
  detail: MatchDetail | null,
  size: number | null,
  now: number,
): NextMatchView => {
  const m = n.match;
  const mineIsA = m.slotA === n.myEntryId;
  const oppSide = detail ? (mineIsA ? detail.players.b : detail.players.a) : null;
  const opponent = oppSide?.username ?? n.opponent?.username ?? "your opponent";

  const room = detail ? heldRoom(detail, now) : null;
  const state: NextMatchState =
    !m.cancelled && (m.inPlay || m.status === "in_play")
      ? "in_play"
      : // Past the deadline: playable only while a pre-deadline seat hold is live
        // (needs the detail's ready-checks; without it, assume the organizer).
        deadlinePassed(m.deadlineAt, now) && (!detail || deadlineOutcome(detail, now).kind !== "hold")
        ? "deadline_passed"
        : room
        ? room.readyEntryId === n.myEntryId
          ? "you_ready"
          : "opponent_ready"
        : "open";

  const mu = matchupLine(m.matchup);
  const mine = mineIsA ? mu.heroA : mu.heroB;
  const timeLeft = timeLeftText(m.deadlineAt, now);
  const seat = room ? seatClock(room.expiresAt, now) : "";
  const active = lastSeen(oppSide?.lastSeenAt, now);
  const title = size ? matchTitle(m.round, m.position, size, m.stage) : `Round ${m.round}`;

  const caption =
    state === "opponent_ready"
      ? `${opponent} is ready · seat held ${seat}`
      : state === "you_ready"
        ? `You're ready · seat held ${seat}`
        : state === "in_play"
          ? "In play now"
          : state === "deadline_passed"
            ? `Deadline passed · ${n.tournament.name}`
            : `Your next match · ${n.tournament.name}`;

  return {
    state,
    slug: n.tournament.slug,
    matchId: m.id,
    tournamentName: n.tournament.name,
    title: state === "opponent_ready" ? `${title} is waiting for you` : `${title} vs ${opponent}`,
    opponent,
    opponentAvatar: oppSide?.avatarUrl ?? n.opponent?.avatarUrl ?? "",
    caption,
    youPlay: mine ? `You play ${mine}` : null,
    map: mu.map,
    opponentActive: active ? (active.online ? `${opponent} online now` : active.text.replace("Last seen", `${opponent} last seen`)) : null,
    timeLeft,
    notice: state === "deadline_passed" ? deadlineNotice(detail, n.myEntryId, m.stage, now) : null,
    href: matchHref(n.tournament.slug, m.id),
    primary: state === "open" ? "ready" : state === "opponent_ready" ? "join" : "view",
    primaryLabel: state === "open" ? "I'm ready to play" : state === "opponent_ready" ? "Join now" : "View match",
  };
};
