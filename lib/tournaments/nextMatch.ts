/**
 * "Your next match" (#1220): the banner on /pro and the account-menu card.
 * Pure — the api's `nextMatch` (+ the match detail when we have it) in, the
 * lines both surfaces draw out. States follow mockup v2's banner: it is your
 * turn to play, your opponent is ready (join now), you're ready (seat held),
 * or the game is in play now — and, once the deadline is behind us with no
 * game started, the organizer is deciding (#1230). Play stays open then until
 * they decide (UX B1), unless rule 1 is about to apply.
 */
import { matchHref, sizeOf } from "./links";
import { DEADLINE_PASSED_TEXT, deadlinePassedRule, deadlineReadyCheckText, lastSeen, reseatCooldownText } from "./copy";
import {
  activeReseatCooldown,
  deadlineHolder,
  deadlineHoldUntil,
  deadlineOutcome,
  deadlinePassed,
  heldRoom,
  matchTitle,
  matchupLine,
  organizerCutoff,
  seatLeft,
} from "./matchPage";
import { spanText, timeText } from "./when";
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
  /** "bountyhuntr is ready · join within 11 min 48 s" and the like. */
  caption: string;
  /** "You play Kenshiro" — null when the matchup leaves heroes open. */
  youPlay: string | null;
  map: string | null;
  /** "Online now" / "Last seen in this match 12 min ago"; null when unknown. */
  opponentActive: string | null;
  /** "1d 17h left" / "5h 12m left" / "42m left". */
  timeLeft: string | null;
  /** Deadline passed: "The deadline has passed. You can still play…" + the organizer's cutoff; or the re-seat cooldown. */
  notice: string | null;
  /** A re-seat cooldown's end (api #126, interactions F4): the main button is disabled until then. */
  playOpensAt: string | null;
  href: string;
  /** What the main button does. */
  primary: "ready" | "join" | "view";
  primaryLabel: string;
}

const deadlineNotice = (detail: MatchDetail | null, myEntry: string, m: NextMatch["match"], now: number) => {
  const out = detail ? deadlineOutcome(detail, now) : null;
  return out?.kind === "ready_check" && detail
    ? deadlineReadyCheckText(detail, out.winner, myEntry)
    : `${DEADLINE_PASSED_TEXT} ${deadlinePassedRule(m.stage, organizerCutoff(m.deadlineAt))}`;
};

/** "1d 2h left" / "5h 12m left" / "42m left" — zero units dropped (UX P1). */
export const timeLeftText = (deadlineAt: string | null, now: number): string | null => {
  const span = spanText(deadlineAt ? Date.parse(deadlineAt) - now : NaN);
  return span ? `${span} left` : null;
};

export { sizeOf };

/**
 * Past the deadline with a pre-deadline seat hold still live (UX B1): the
 * holder advances by rule 1 if the other player never joins. Null for a hold
 * made after the deadline (no rule 1 then).
 */
const holdNotice = (detail: MatchDetail, myEntry: string, state: "opponent_ready" | "you_ready", now: number): string | null => {
  if (deadlineOutcome(detail, now).kind !== "hold") return null;
  const holder = deadlineHolder(detail, now);
  const until = timeText(deadlineHoldUntil(detail, holder, now));
  const name = holder === detail.match.slotA ? detail.players.a?.username : detail.players.b?.username;
  const verb = detail.match.stage === "group" ? ["win the match", "wins the match"] : detail.match.stage === "final" ? ["win the tournament", "wins the tournament"] : ["advance", "advances"];
  if (state === "you_ready" && holder === myEntry) return `You're waiting in your room until ${until}. If nobody joins, you ${verb[0]}.`;
  if (state === "opponent_ready" && holder && holder !== myEntry)
    return `${name ?? "Your opponent"} is waiting in your room until ${until}. If you don't join, ${name ?? "your opponent"} ${verb[1]}.`;
  return null;
};

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
  const past = deadlinePassed(m.deadlineAt, now);
  // Without the detail's ready-checks, assume the organizer is deciding (still playable).
  const outcome = detail ? deadlineOutcome(detail, now).kind : past ? "organizer" : "open";
  const state: NextMatchState =
    !m.cancelled && (m.inPlay || m.status === "in_play")
      ? "in_play"
      : outcome === "ready_check"
        ? "deadline_passed"
        : room
          ? room.readyEntryId === n.myEntryId
            ? "you_ready"
            : "opponent_ready"
          : past
            ? "deadline_passed"
            : "open";
  // Rule 1 about to apply is the only past-deadline state with nothing to press.
  const canPlay = state === "open" || (state === "deadline_passed" && outcome !== "ready_check");
  // `/me/tournaments` doesn't carry the re-seat cooldown; the match detail does.
  const playOpensAt = canPlay || state === "opponent_ready" ? activeReseatCooldown(m, detail?.match.reseatCooldownUntil ?? null, now) : null;

  const mu = matchupLine(m.matchup);
  const mine = mineIsA ? mu.heroA : mu.heroB;
  const timeLeft = timeLeftText(m.deadlineAt, now);
  const seat = room ? seatLeft(room.expiresAt, now) : "";
  const active = lastSeen(oppSide?.lastSeenAt, now);
  const title = size ? matchTitle(m.round, m.position, size, m.stage) : `Round ${m.round}`;

  const caption =
    state === "opponent_ready"
      ? `${opponent} is ready · join within ${seat}`
      : state === "you_ready"
        ? `You're ready · seat held · ${seat} left`
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
    notice: playOpensAt
      ? reseatCooldownText(playOpensAt)
      : state === "deadline_passed"
        ? deadlineNotice(detail, n.myEntryId, m, now)
        : past && detail && (state === "opponent_ready" || state === "you_ready")
          ? holdNotice(detail, n.myEntryId, state, now)
          : null,
    playOpensAt,
    href: matchHref(n.tournament.slug, m.id),
    primary: canPlay ? "ready" : state === "opponent_ready" ? "join" : "view",
    primaryLabel: canPlay ? "I'm ready to play" : state === "opponent_ready" ? "Join now" : "View match",
  };
};
