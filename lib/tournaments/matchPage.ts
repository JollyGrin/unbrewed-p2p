/**
 * The match page's model (#1218): one api match in, the state card and every
 * line the page draws out. Pure — no React, no clock except the `now` passed in.
 *
 * Six states, named as mockup v2 names them (Dean, 2026-10-05):
 * waiting for a game · opponent ready (join now) · you're ready (seat held) ·
 * in play now · decided · decided by deadline rule — plus deadline passed
 * (organizer deciding, #1230). Play stays OPEN after the deadline until the
 * organizer decides (decided product rule, 2026-10-07, UX B1): a game started
 * then still counts; with no game and no decision the higher seed advances.
 *
 * A match is `firstTo` + an ordered `games[]` (never one game id); a game's
 * heroes/map are its own `assignment`, else the match's `matchup`.
 * The words the page says live in ./copy.
 */
import { heroDisplayName } from "@/lib/stats/roster";

import { scoredGame, roundCount, roundName } from "./bracket";
import { playerName, PLAY_LABEL, resultsLabel, withTimeLeft } from "./copy";
import { mapTitle } from "./mapTitle";
import type { Assignment, Game, LiveRoom, Match, MatchDetail } from "./types";
import type { PlayPhase } from "./usePlayMatch";
import { minSecSpoken, minSecText } from "./when";

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
export const heldRoom = (d: MatchDetail, now: number): LiveRoom | null =>
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

/** When the live pre-deadline hold of `holder` runs out: its room's expiry, else its check's. */
export const deadlineHoldUntil = (d: MatchDetail, holder: string | null, now: number): string | null =>
  heldRoom(d, now)?.expiresAt ?? currentChecks(d).find((c) => c.entryId === holder && c.outcome === "pending")?.expiresAt ?? null;

/** Entry of the player whose pre-deadline seat hold is still live (past the deadline), or null. */
export const deadlineHolder = (d: MatchDetail, now: number): string | null => {
  const deadline = d.match.deadlineAt ? Date.parse(d.match.deadlineAt) : NaN;
  const c = currentChecks(d).find(
    (x) => x.outcome === "pending" && Date.parse(x.createdAt) <= deadline && Date.parse(x.expiresAt) > now,
  );
  return c?.entryId ?? null;
};

/** What every state knows, whichever it is. */
interface StateFacts {
  /** The live room still holding a seat (`heldRoom`), in any state: the page links back to it. */
  room: LiveRoom | null;
  /** The tournament was cancelled. A match it left undecided is `cancelled`; a decided one keeps its result. */
  eventCancelled: boolean;
}

/**
 * The match page's state, built once per render by `matchPageState`, carrying
 * what the page draws for it so nothing downstream re-derives it.
 */
export type MatchPageState = StateFacts &
  (
    | { kind: "waiting" }
    | { kind: "opponent_ready"; room: LiveRoom }
    /** `holdingPastDeadline`: the holder of a pre-deadline hold that outlived the deadline (UX B1). */
    | { kind: "you_ready"; room: LiveRoom; holdingPastDeadline: boolean }
    | { kind: "in_play"; startedAt: string | null }
    /** Rule 1 about to apply (nothing to press), or the organizer deciding (still playable, UX B1). */
    | { kind: "deadline_passed"; outcome: Extract<DeadlineOutcome, { kind: "ready_check" | "organizer" }> }
    /** A pre-deadline seat hold still live past the deadline: whose, and when it runs out. */
    | { kind: "deadline_hold"; holder: string | null; until: string | null }
    | { kind: "decided" }
    | { kind: "decided_by_rule"; rule: "deadline_ready_check" | "deadline_higher_seed" }
    | { kind: "cancelled" }
  );

/** The state names (the page's `data-state`, the fixtures' keys). */
export type MatchPageKind = MatchPageState["kind"];

/** The match has a result, played or by a deadline rule. */
export const isDecided = (s: MatchPageState): boolean => s.kind === "decided" || s.kind === "decided_by_rule";

/** Still to be settled: neither decided nor cancelled. */
export const isOpen = (s: MatchPageState): boolean => !isDecided(s) && s.kind !== "cancelled";

/** Cancelled itself, or decided inside a tournament that was then cancelled. */
export const isCancelled = (s: MatchPageState): boolean => s.kind === "cancelled" || s.eventCancelled;

/** Past the deadline with the organizer deciding: Play stays open until they do (UX B1). */
export const isLateOpen = (s: MatchPageState): boolean => s.kind === "deadline_passed" && s.outcome.kind === "organizer";

/** A player could press Play (or Join) now. */
export const isPlayable = (s: MatchPageState): boolean =>
  s.kind === "waiting" || s.kind === "opponent_ready" || s.kind === "you_ready" || s.kind === "deadline_hold" || isLateOpen(s);

export const matchPageState = (d: MatchDetail, myUserId: string | null, now: number): MatchPageState => {
  const m = d.match;
  const room = heldRoom(d, now);
  const facts: StateFacts = { room, eventCancelled: d.tournament.status === "cancelled" || !!m.cancelled };
  if (m.status === "decided" || m.winner)
    return m.decidedBy === "deadline_ready_check" || m.decidedBy === "deadline_higher_seed"
      ? { ...facts, kind: "decided_by_rule", rule: m.decidedBy }
      : { ...facts, kind: "decided" };
  // An undecided match of a cancelled tournament reads cancelled whatever its raw status says.
  if (m.cancelled) return { ...facts, kind: "cancelled" };
  // A game that started before the deadline finishes and counts (settled rule 3).
  if (m.inPlay || m.status === "in_play")
    return { ...facts, kind: "in_play", startedAt: m.games.find((g) => g.startedAt && !g.finishedAt)?.startedAt ?? null };
  // Rule 1 is about to apply (the loop's next tick): nothing left to play.
  const outcome = deadlineOutcome(d, now);
  if (outcome.kind === "ready_check") return { ...facts, kind: "deadline_passed", outcome };
  const side = mySide(d, myUserId);
  const mine = side === "a" ? m.slotA : side === "b" ? m.slotB : null;
  // A pre-deadline seat hold still live past the deadline (p2p #1253): the
  // holder keeps waiting in their room (you_ready); everyone else sees the hold,
  // and the other player can still join it (UX B1).
  if (outcome.kind === "hold") {
    const holder = deadlineHolder(d, now);
    if (!mine || mine !== holder) return { ...facts, kind: "deadline_hold", holder, until: deadlineHoldUntil(d, holder, now) };
  }
  if (room && side)
    return room.readyEntryId === mine
      ? { ...facts, room, kind: "you_ready", holdingPastDeadline: outcome.kind === "hold" }
      : { ...facts, room, kind: "opponent_ready" };
  // Past the deadline with no hold: still playable until the organizer decides.
  if (outcome.kind === "organizer" && !room) return { ...facts, kind: "deadline_passed", outcome };
  return { ...facts, kind: "waiting" };
};

/** One thing the Play area offers. `press` calls the play hook and is the only kind `disabled` applies to. */
export type PlayAction =
  | { kind: "press"; label: string }
  | { kind: "back_to_room"; label: string }
  | { kind: "back_to_game"; label: string }
  | { kind: "seat_held_note" }
  | { kind: "replay"; label: string }
  | { kind: "results"; label: string };

export interface PlayButtonModel {
  /**
   * The Play panel inside the page, for a seated player only; null when there
   * is nothing to play. `look` picks its copy; `late` = past the deadline, still
   * playable; `hold` = a pre-deadline hold the viewer can still join.
   */
  panel: {
    look: "ready" | "join" | "seated" | "running";
    late: boolean;
    hold: { holder: string | null; until: string | null } | null;
    action: PlayAction | null;
  } | null;
  /** The phone's one action, pinned to the bottom of the screen; null = none. */
  sticky: PlayAction | null;
  /** Why a `press` is disabled: a re-seat cooldown, or a press already in flight; null = enabled. */
  disabled: "cooldown" | "busy" | null;
  /** The line under the panel's copy: cooldown first, then the play hook's phase. */
  notice: "cooldown" | "opening" | "seat_held" | "error" | null;
}

/**
 * What the Play area shows for a state. Pure: the browser's seat token for
 * the room comes in as `backHref`, the seat clock as `seatClock`.
 */
export const playButtonModel = (
  state: MatchPageState,
  viewer: { side: "a" | "b" | null; seated: boolean },
  ctx: {
    phase: PlayPhase["kind"];
    cooldown: string | null;
    backHref: string | null;
    seatClock: string | null;
    canReplay: boolean;
    standings: boolean;
  },
): PlayButtonModel => {
  // Play needs both seats filled: a pending match's "I'm ready" could only 409.
  const player = !!viewer.side && viewer.seated;
  const late = isLateOpen(state);
  const ready = state.kind === "waiting" || late;
  const join = state.kind === "opponent_ready" || state.kind === "deadline_hold";
  const press = (label: string): PlayAction => ({ kind: "press", label });
  const disabled = ctx.cooldown ? "cooldown" : ctx.phase === "busy" || ctx.phase === "opening" ? "busy" : null;
  // A cooldown is also what a 409 reseat_cooldown becomes, whatever error the play hook gave it.
  const notice =
    ctx.cooldown ? "cooldown" : ctx.phase === "opening" || ctx.phase === "seat_held" || ctx.phase === "error" ? ctx.phase : null;

  let panel: PlayButtonModel["panel"] = null;
  if (player && ready) panel = { look: "ready", late, hold: null, action: press(PLAY_LABEL.ready) };
  else if (player && join)
    panel = {
      look: "join",
      late: false,
      hold: state.kind === "deadline_hold" ? { holder: state.holder, until: state.until } : null,
      action: press(PLAY_LABEL.join),
    };
  else if (player && state.kind === "you_ready")
    panel = {
      look: "seated",
      late: false,
      hold: null,
      // Seat held from another tab or device: take it here via a fresh ticket.
      action: ctx.backHref ? { kind: "back_to_room", label: PLAY_LABEL.backToRoom } : press(PLAY_LABEL.takeSeat),
    };
  else if (player && state.kind === "in_play")
    panel = { look: "running", late: false, hold: null, action: ctx.backHref ? { kind: "back_to_game", label: PLAY_LABEL.backToGame } : null };

  let sticky: PlayAction | null = null;
  if (player && ctx.phase === "seat_held") sticky = { kind: "seat_held_note" };
  else if (player && ready) sticky = press(PLAY_LABEL.ready);
  else if (player && join) sticky = press(withTimeLeft(PLAY_LABEL.join, ctx.seatClock));
  else if (player && state.kind === "you_ready")
    sticky = ctx.backHref
      ? { kind: "back_to_room", label: `Back to room · ${ctx.seatClock} left` }
      : press(`${PLAY_LABEL.takeSeat} · ${ctx.seatClock} left`);
  // A seat token for the room is enough: a lapsed session still gets back in (S5).
  else if (state.kind === "in_play" && ctx.backHref) sticky = { kind: "back_to_game", label: PLAY_LABEL.backToGame };
  else if (state.kind === "decided" && ctx.canReplay) sticky = { kind: "replay", label: PLAY_LABEL.replay };
  else if (!isOpen(state) || state.kind === "deadline_hold" || (state.kind === "deadline_passed" && !late))
    sticky = { kind: "results", label: resultsLabel(ctx.standings) };

  return { panel, sticky, disabled, notice };
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

/**
 * The re-seat cooldown still running at `now` (api #126), from the match JSON's
 * `reseatCooldownUntil` or a `409 reseat_cooldown`'s `ticketsExpireAt` (`noticed`),
 * whichever ends later; null when there is none or it has run out.
 */
export const activeReseatCooldown = (m: Pick<Match, "reseatCooldownUntil">, noticed: string | null, now: number): string | null => {
  const ends = [m.reseatCooldownUntil ?? null, noticed]
    .filter((x): x is string => !!x && Number.isFinite(Date.parse(x)))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  return ends && Date.parse(ends) > now ? ends : null;
};

/** A healthy game says nothing about stalling: only one running this long (or one the api marks stalled) does (F5). */
export const STALL_NOTE_AFTER_MS = 60 * 60_000;
export const gameLooksStalled = (d: MatchDetail, now: number): boolean => {
  const live = d.match.games.find((g) => g.startedAt && !g.finishedAt);
  if (!live) return false;
  if (live.endReason === "stalled" || live.endReason === "swept") return true;
  const started = Date.parse(live.startedAt ?? "");
  return Number.isFinite(started) && now - started > STALL_NOTE_AFTER_MS;
};

/** Seat-hold countdown, `M:SS` (the mockup's format, for the big clock and buttons); "0:00" once up. */
export const seatClock = (expiresAt: string | null, now: number): string => {
  const ms = expiresAt ? Math.max(0, Date.parse(expiresAt) - now) : 0;
  const s = Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Seat-hold time left in words (UX B2), never mistakable for a clock time: "14 min 32 s". */
export const seatLeft = (expiresAt: string | null, now: number): string =>
  minSecText(expiresAt ? Date.parse(expiresAt) - now : 0);

/** The same for a screen reader: "14 minutes 32 seconds left". */
export const seatLeftSpoken = (expiresAt: string | null, now: number): string =>
  `${minSecSpoken(expiresAt ? Date.parse(expiresAt) - now : 0)} left`;

/** How much of the match window has gone, 0–100. */
export const windowSpent = (opensAt: string | null, deadlineAt: string | null, now: number): number => {
  const a = opensAt ? Date.parse(opensAt) : NaN;
  const b = deadlineAt ? Date.parse(deadlineAt) : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(Math.min(1, Math.max(0, (now - a) / (b - a))) * 100);
};

/** The organizer's cutoff after a missed deadline: deadline + 24h (settled rule 2); null without a deadline. */
export const organizerCutoff = (deadlineAt: string | null): string | null => {
  const t = deadlineAt ? Date.parse(deadlineAt) : NaN;
  return Number.isFinite(t) ? new Date(t + 24 * 3_600_000).toISOString() : null;
};

export interface GameRow {
  game: Game;
  /** 1-based, as players count. */
  n: number;
  /** `no_result`: finished with no winner (both left, swept, stalled — interactions S1): the match plays again. */
  state: "in_play" | "won" | "unverified" | "no_result" | "rejected" | "after_decision" | "overridden";
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
      state: g.rejectedAt
        ? "rejected"
        : (g.recordedAfterDecision || (decided && !g.verified && !!g.winnerEntry && d.match.decidedBy !== "unverified_confirmed")) && g.finishedAt
          ? "after_decision"
          : !g.finishedAt
            ? "in_play"
            : // Never "unverified": a game with no winner has nothing to confirm (interactions S1).
              !g.winnerEntry
              ? "no_result"
              : g.verified
                ? overriddenGame(d.match, g)
                  ? "overridden"
                  : "won"
                : "unverified",
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
