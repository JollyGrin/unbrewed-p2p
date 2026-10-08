/**
 * The tournaments pages' words: fixed strings and the small builders that put
 * names, dates and rules into sentences. No state machine here — matchPage
 * decides which state a match is in, this file says it.
 */
import type { Game, Match, MatchDetail, MatchPlayer } from "./types";
import { dayText, timeText, whenText } from "./when";

export const playerName = (p: MatchPlayer | null): string => p?.username ?? (p ? "Player" : "TBD");

/** The player in a match slot, or null for an empty or unknown entry. */
export const entryPlayer = (d: MatchDetail, entry: string | null): MatchPlayer | null =>
  !entry ? null : entry === d.match.slotA ? d.players.a : entry === d.match.slotB ? d.players.b : null;

/**
 * The deadline-passed copy (#1230, UX B1), shared by the match page, the /pro
 * banner and the account menu: play stays open until the organizer decides.
 */
export const DEADLINE_PASSED_TEXT = "The deadline has passed. You can still play until the organizer decides.";
/** The same for someone who isn't playing this match. */
export const DEADLINE_PASSED_SPECTATOR_TEXT = "The deadline has passed. They can still play until the organizer decides.";

/** What happens with no game and no decision. A round-robin top-2 final goes to the better standings rank (slot A, #1). */
const fallbackOutcome = (stage?: Match["stage"]): string =>
  stage === "group"
    ? "the higher seed wins the match"
    : stage === "final"
      ? "the player ranked higher in the standings wins the tournament"
      : "the higher seed advances";

/** "The organizer decides by Tue, Oct 6, 1:00 PM, otherwise the higher seed advances." (UX S3: always the date when known.) */
export const deadlinePassedRule = (stage?: Match["stage"], cutoff?: string | null): string =>
  `The organizer decides ${cutoff ? `by ${whenText(cutoff)}` : "within 24 hours"}, otherwise ${fallbackOutcome(stage)}.`;

/** The organizer's own view (D5): they are the one deciding, with the cutoff spelled out. */
export const DEADLINE_PASSED_ORGANIZER_TEXT = "The deadline has passed. You are deciding this match.";
export const deadlinePassedOrganizerRule = (stage?: Match["stage"], cutoff?: string | null): string =>
  `Decide ${cutoff ? `by ${whenText(cutoff)}` : "within 24 hours"}, or ${fallbackOutcome(stage)}. The players can still play until you do.`;

/** Rule 1, in plain words (UX S6). */
export const RULE_1_LINE = "Rule 1 · one player was ready, the other never joined";

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

/** "This match was re-seated. Play opens at 18:30 (local time)." */
export const reseatCooldownText = (until: string): string =>
  `This match was re-seated. Play opens at ${timeText(until)} (local time).`;

/**
 * An in-play match whose room may have died (p2p #1269): the api reopens it once
 * the stalled game times out (api #123, 2.5 h after it started). Names the
 * organizer when known. The organizer can't "confirm" a tagged game: they
 * decide the match (override), so that is what it says (interactions F5).
 */
export const stalledGameText = (organizer: string | null): string =>
  `If your game room closed, the match reopens by itself once the stalled game times out (2½ hours after it started), or ask ${organizer ? `the organizer (${organizer})` : "the organizer"} to decide the match.`;

/** "Online now" only within the last 60s, else "Last seen in this match 12 min ago" (api `lastSeenAt` = latest ready-check press in this match); null when never. */
export const lastSeen = (iso: string | null | undefined, now: number): { online: boolean; text: string } | null => {
  if (!iso) return null;
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 60_000) return { online: true, text: "Online now" };
  const min = Math.floor(ms / 60_000);
  if (min < 60) return { online: false, text: `Last seen in this match ${min} min ago` };
  if (min < 24 * 60) return { online: false, text: `Last seen in this match ${Math.floor(min / 60)}h ago` };
  return { online: false, text: `Last seen in this match ${dayText(iso)}` };
};

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

/** The one rule line a rule-decided match keeps (D6): "Decided by Rule 1 · one player was ready, the other never joined". */
export const decidedByRuleLine = (d: MatchDetail): string | null =>
  d.match.decidedBy === "deadline_ready_check"
    ? `Decided by ${RULE_1_LINE}.`
    : d.match.decidedBy === "deadline_higher_seed"
      ? `Decided by Rule 2 · ${d.match.stage === "final" ? "the organizer did not decide in 24h, so the better standings rank won" : "the organizer did not decide in 24h, so the higher seed won"}.`
      : null;

/** Why a game ended, when the api says (api A5 `endReason`): "opponent disconnected", "both players left", …; null for a normal finish. */
export const endReasonText = (g: Pick<Game, "endReason">): string | null => {
  switch (g.endReason) {
    case "disconnect":
      return "opponent disconnected";
    case "abandoned":
      return "both players left";
    case "swept":
    case "stalled":
      return "the game stalled and was closed";
    default:
      return null;
  }
};

/** A ready-check, as the side card lists it. */
export const readyCheckLine = (
  d: MatchDetail,
  rc: MatchDetail["readyChecks"][number],
  myUserId: string | null,
  now: number = Date.now(),
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
        ? // The hold ran out and the api's sweep hasn't marked it yet (UX P11).
          Date.parse(rc.expiresAt) <= now
          ? you
            ? "Your hold ran out"
            : `${who}'s hold ran out`
          : `${who} ${you ? "are" : "is"} ready now`
        : `${who} ${verb}`;
  return { text, at: whenText(rc.createdAt), missed: rc.outcome === "unanswered" };
};

/** The Play area's button words. */
export const PLAY_LABEL = {
  ready: "I'm ready to play",
  join: "Join now",
  takeSeat: "Take your seat here",
  backToRoom: "Back to your room",
  backToGame: "Back to game",
  replay: "Watch the replay",
} as const;

/** "Join now · 11:48 left": a countdown, never mistakable for a clock time (UX B2). */
export const withTimeLeft = (label: string, clock: string | null): string => (clock ? `${label} · ${clock} left` : label);

/** Where a finished or closed match points a phone: the bracket, or a round robin's standings. */
export const resultsLabel = (standings: boolean): string => (standings ? "See the standings" : "See the bracket");
