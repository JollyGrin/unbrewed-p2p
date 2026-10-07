/**
 * "I'm ready" / "Join now" on the match page (#1218): `POST …/ready` grants a
 * ticket and says create or join; the page then goes to `/pro/game` with it
 * (lib/pro/tournamentTicket). A `join` whose room is still opening (both pressed
 * at once — settled rule 6) polls `POST …/ticket` until the room has an id, or
 * the api hands back `create` after its 90s grace.
 */
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { roomForMatch, ticketGameHref } from "@/lib/pro/tournamentTicket";

import { refreshAccount } from "@/lib/account/useAccount";

import { getMatch, getMatchTicket, rateLimitText, readyForMatch, reportRoomGone, type Result, type TournamentFailure } from "./api";
import { reseatCooldownText } from "./copy";
import { currentChecks } from "./matchPage";
import { clockOf } from "./organizer";
import type { MatchDetail, TicketGrant } from "./types";

export type PlayPhase =
  | { kind: "idle" }
  | { kind: "busy" }
  /** Join, but the other room has no id yet. */
  | { kind: "opening" }
  /** This player already holds a live seat for the match: never a second room. */
  | { kind: "seat_held"; roomId: string | null }
  /** `reason: "unauthorized"` = the session ended: the page offers "Sign in with Discord" (UX B3). */
  | { kind: "error"; message: string; reason?: TournamentFailure; code?: string; at?: number };

/** A ready/ticket call that timed out may still have happened server-side (p2p #1269). */
export const PLAY_TIMEOUT_MESSAGE =
  "The server didn't answer in time. It may still have gone through: check the match page before pressing Play again.";

/** Readable copy for a failed ready / ticket call. */
export const playErrorMessage = (r: Extract<Result<unknown>, { ok: false }>): string => {
  if (r.code === "timeout") return PLAY_TIMEOUT_MESSAGE;
  switch (r.reason) {
    case "unauthorized":
      return "Your session ended. Sign in with Discord again.";
    case "forbidden":
      return "Only the two players in this match can play it.";
    case "not_found":
      return "This match no longer exists.";
    case "rate_limited":
      return rateLimitText(r);
    case "conflict":
      if (r.code === "match_in_play") return "A game for this match is already in play.";
      if (r.code === "seat_held")
        return "Your seat is held in this match's room on another tab or device. Carry on there, or try again here once the 15-minute hold runs out.";
      if (r.code === "not_running") return "This tournament isn't running.";
      // The api's own sentence says the time in UTC: say it in the viewer's (UX S1).
      if (r.code === "reseat_cooldown")
        return r.ticketsExpireAt ? reseatCooldownText(r.ticketsExpireAt) : "This match was re-seated. Play opens again in a few minutes.";
      // A stale tab after the match moved on (UX S19): `match_not_open` "the match is decided|pending".
      if (r.code === "match_not_open" && /decided/i.test(r.message ?? ""))
        return "This match has already been decided. Reload the page to see the result.";
      if (r.code === "match_not_open" && /pending/i.test(r.message ?? ""))
        return "This match isn't open yet: your opponent isn't known.";
      return "This match isn't open to play right now. Reload the page to see where it stands.";
    default:
      return r.code === "tournaments_disabled"
        ? "Tournament games aren't available right now."
        : "Couldn't reach the server. Try again.";
  }
};

/** Where a grant sends the player, or null while the other room is still opening. */
export const grantHref = (g: TicketGrant, slug: string, matchId: string): string | null =>
  g.action === "join" && !g.roomId
    ? null
    : ticketGameHref({
        ticket: g.ticket,
        slug,
        matchId,
        room: g.action === "join" ? g.roomId : null,
        heroId: g.heroId,
        map: g.map,
      });

/**
 * A ticket for a retry or a poll. `POST …/ticket` records nothing, so it is only
 * good for a JOIN (the other room is recorded already) or for the caller's own
 * create that is still opening (`seat_held`, nothing new to record). Whenever
 * the answer is — or turns into — a plain `create`, ask again with `POST
 * …/ready`, which records the ready-check the new room is filed under:
 * otherwise the room is invisible to the api and the opponent can open a second
 * one (settled rule 6). The api never records a second create while the
 * caller's own is the newest live one: that answers `seat_held` (p2p #1250).
 */
export const freshGrant = async (slug: string, matchId: string): Promise<Result<TicketGrant>> => {
  const t = await getMatchTicket(slug, matchId);
  if (!t.ok || t.value.action === "join" || t.value.decision === "seat_held") return t;
  return readyForMatch(slug, matchId);
};

export type DeadRoomGrant =
  | Result<TicketGrant>
  /** The api still points this match at the room the engine just said is gone. */
  | { ok: false; reason: "room_still_gone" };

/** Whether a grant (or a seat_held refusal) still sends the player into `roomId`. */
const pointsAt = (r: Result<TicketGrant>, roomId: string): boolean =>
  r.ok ? r.value.roomId === roomId && (r.value.action === "join" || r.value.decision === "seat_held") : r.code === "seat_held" && r.roomId === roomId;

/**
 * The engine answered ROOM_NOT_FOUND for this match's room (#1268, hardening
 * contract item 2): an engine restart dropped it, but the api still files the
 * match under it, so `freshGrant` alone answers join/seat_held into the same
 * dead room forever. Report it with `POST …/room-gone`.
 *  - `reported`: the api answered (cleared, or refused for good: not the room's
 *    creator, room not live, match in play, …). Remember it: never re-report.
 *  - `legacy`: an api without the route (404): the caller keeps today's behaviour.
 *  - `too_soon`: the api's 30s age gate (api #125) — worth ONE wait and retry.
 *  - `unavailable`: a network blip — not an answer, so not remembered (p2p #1269):
 *    the next press asks again instead of sticking on "hasn't released it".
 *  - `not_mine` (p2p #1279, journeys S1): the room is the OPPONENT's (or the api
 *    can't tell whose, or has moved on): only its creator may clear it, so a
 *    joiner's retry can't help — the opponent has to press Play again.
 * Either way the grant that follows goes through `grantAvoiding`, so nothing loops.
 */
export type DeadRoomReport = "reported" | "legacy" | "too_soon" | "unavailable" | "not_mine";
const NOT_MINE = new Set(["not_room_creator", "ambiguous_creator", "room_not_live"]);
export const reportDeadRoom = async (slug: string, matchId: string, deadRoomId: string): Promise<DeadRoomReport> => {
  const gone = await reportRoomGone(slug, matchId, deadRoomId);
  if (!gone.ok) return gone.reason === "not_found" ? "legacy" : gone.reason === "unavailable" ? "unavailable" : "reported";
  if (gone.value.cleared) return "reported";
  if (gone.value.reason === "too_soon") return "too_soon";
  return gone.value.reason && NOT_MINE.has(gone.value.reason) ? "not_mine" : "reported";
};

/** Only a real answer is remembered for the screen. */
export const settledReport = (r: DeadRoomReport): r is "reported" | "legacy" | "not_mine" =>
  r === "reported" || r === "legacy" || r === "not_mine";

/**
 * The joiner's copy for the opponent's dead room (journeys S1): who must act,
 * and until when their hold lasts. `ping` only when the Discord bot is live.
 */
export const opponentRoomGoneText = (opponent: string | null, holdUntil: string | null, ping: boolean): string =>
  [
    `The room ${opponent ?? "your opponent"} opened is gone (the server restarted).`,
    `${opponent ?? "Your opponent"} needs to press Play again to open a new one${ping ? "; you'll get a ping" : "; check the match page in a minute"}.`,
    holdUntil ? `Their hold runs out at ${clockOf(holdUntil)}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

/**
 * The same dead room when its recorded creator is the VIEWER (#1279 review):
 * after an engine restart with both players holding tickets (`ambiguous_creator`)
 * the api can file the room under either of them.
 */
export const OWN_ROOM_GONE = "Your room is gone (the server restarted). Go back to the match and press Play again to open a new one.";

/** Who opened `roomId` and when their hold ends, read off the match (S1). */
export const deadRoomOwner = (
  d: MatchDetail,
  roomId: string,
): { name: string | null; userId: string | null; holdUntil: string | null } => {
  const live = d.liveRoom && d.liveRoom.roomId === roomId ? d.liveRoom : null;
  const check = (d.readyChecks ?? []).find((c) => c.roomId === roomId && c.role === "create");
  const entryId = live?.readyEntryId ?? check?.entryId ?? null;
  const side = [d.players?.a, d.players?.b].find((p) => p && p.id === entryId);
  return { name: side?.username ?? null, userId: side?.userId ?? null, holdUntil: live?.expiresAt ?? check?.expiresAt ?? null };
};

/** The api's room-gone age gate (ROOM_GONE_MIN_AGE_MS, api #125). */
export const ROOM_GONE_MIN_AGE_MS = 30 * 1000;

/**
 * How long until the age gate lets `roomId` go: 30s from the room's create
 * check (its ticket was issued then), plus 1s of slack — never more than 31s,
 * and the full 31s when the match doesn't show the check.
 */
export const roomReleaseWaitMs = (d: MatchDetail | null, roomId: string, now: number): number => {
  const created = (d ? currentChecks(d) : [])
    .filter((c) => c.roomId === roomId && c.role === "create")
    .map((c) => Date.parse(c.createdAt))
    .filter(Number.isFinite);
  const from = created.length ? Math.min(...created) : now;
  return Math.min(ROOM_GONE_MIN_AGE_MS, Math.max(0, from + ROOM_GONE_MIN_AGE_MS - now)) + 1000;
};

/** "This match's room closed. Releasing it in 12 s…" */
export const releasingText = (seconds: number): string => `This match's room closed. Releasing it in ${seconds} s…`;

/**
 * A fresh grant after a dead room was reported — a cleared room makes it a
 * recorded create. One that still points at the dead room is refused here
 * instead of sending the player back into it (RECONNECT → ROOM_NOT_FOUND → …).
 */
export const grantAvoiding = async (slug: string, matchId: string, deadRoomId: string): Promise<DeadRoomGrant> => {
  const r = await freshGrant(slug, matchId);
  return pointsAt(r, deadRoomId) ? { ok: false, reason: "room_still_gone" } : r;
};

/** Copy for a dead room the api won't let go of yet. */
export const ROOM_STILL_GONE =
  "This match's room closed and the server hasn't released it yet. Go back to the match and press Play again in a minute; if it keeps happening, ask the organizer.";

/** The api's 90s wait for an opponent's room to open (ROOM_OPEN_GRACE_MS). */
export const ROOM_OPEN_GRACE_MS = 90 * 1000;

export type ReadyDecision =
  | { kind: "create" }
  | { kind: "join"; roomId: string | null }
  | { kind: "seat_held"; roomId: string | null };

/**
 * The api's `decideReady` (feature/tournaments-api src/tournaments/readyCheck.ts)
 * on the match page's ready-checks, rule for rule: the caller's seat is held
 * only when the caller's OWN create is the newest live create for the game —
 * an older one of the caller's (room_opened stamps every live check with the
 * room) is no hold, and the caller joins the opponent's room like anyone else.
 */
export const readyDecision = (d: MatchDetail, slot: "a" | "b", gameIndex: number, now: number): ReadyDecision => {
  const self = (slot === "a" ? d.match?.slotA : d.match?.slotB) ?? null;
  const opponent = (slot === "a" ? d.match?.slotB : d.match?.slotA) ?? null;
  const newestLiveCreate = (entryId: string | null) =>
    currentChecks(d)
      .filter(
        (c) =>
          (entryId === null || c.entryId === entryId) &&
          c.gameIndex === gameIndex &&
          c.role === "create" &&
          c.outcome === "pending" &&
          Date.parse(c.expiresAt) > now,
      )
      .sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt))[0];
  const newest = newestLiveCreate(null);
  const own = self !== null && newest?.entryId === self ? newest : undefined;
  if (own && own.roomId !== null) return { kind: "seat_held", roomId: own.roomId };
  const theirs = opponent !== null ? newestLiveCreate(opponent) : undefined;
  const fromOpponent: ReadyDecision =
    !theirs || (theirs.roomId === null && now - Date.parse(theirs.createdAt) >= ROOM_OPEN_GRACE_MS)
      ? { kind: "create" }
      : { kind: "join", roomId: theirs.roomId };
  if (own && fromOpponent.kind === "create") return { kind: "seat_held", roomId: null };
  return fromOpponent;
};

/** The api's answer that the caller's own room is open: hold, never a second seat. */
const grantedSeatRoom = (g: TicketGrant): string | null => (g.decision === "seat_held" ? g.roomId : null);

export const POLL_MS = 3000;
/** 40 × 3s = 2 minutes: past the api's 90s grace for an opening room. */
export const MAX_POLLS = 40;

export const usePlayMatch = (slug: string, matchId: string, onSettled?: () => void) => {
  const router = useRouter();
  const [phase, setPhase] = useState<PlayPhase>({ kind: "idle" });
  const alive = useRef(true);
  // One press at a time: a double click must not record two ready-checks.
  const inFlight = useRef(false);
  // Set in the body too: StrictMode (dev) mounts, unmounts and remounts, so a
  // cleanup-only effect would leave the flag false and never navigate (#1230).
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

  const follow = useCallback(
    async (r: Result<TicketGrant>, polls: number): Promise<boolean> => {
      if (!alive.current) return false;
      if (!r.ok) {
        if (r.code === "seat_held") {
          setPhase({ kind: "seat_held", roomId: r.roomId ?? roomForMatch({ slug, matchId }) });
          onSettled?.();
          return false;
        }
        setPhase({ kind: "error", message: playErrorMessage(r), reason: r.reason, code: r.code, at: Date.now() });
        // A dead session: re-probe /me so the page flips to its signed-out layout (UX B3).
        if (r.reason === "unauthorized") void refreshAccount().catch(() => {});
        onSettled?.();
        return false;
      }
      // The caller's own room is open (p2p #1250): say so, with the way back.
      const held = grantedSeatRoom(r.value);
      if (held) {
        setPhase({ kind: "seat_held", roomId: held });
        onSettled?.();
        return false;
      }
      const href = grantHref(r.value, slug, matchId);
      if (href) {
        void router.push(href);
        return true;
      }
      if (polls >= MAX_POLLS) {
        setPhase({ kind: "error", message: "The other room didn't open. Try again." });
        onSettled?.(); // the match has moved on meanwhile: show what it is now
        return false;
      }
      setPhase({ kind: "opening" });
      await new Promise((ok) => setTimeout(ok, POLL_MS));
      if (!alive.current) return false;
      return follow(await freshGrant(slug, matchId), polls + 1);
    },
    [router, slug, matchId, onSettled],
  );

  const play = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: "busy" });
    try {
      // Converge a stale tab first (#1248): when this player's own room is open
      // by the api's rule AND the api's `/ticket` answer agrees, show the held
      // seat without a POST. Anything else is the api's to decide (p2p #1250):
      // `POST /ready` answers join (the opponent's newer room), create, or
      // seat_held — never a second room.
      const [d, t] = await Promise.all([getMatch(slug, matchId), getMatchTicket(slug, matchId)]);
      if (alive.current && d.ok && t.ok) {
        const mine = readyDecision(d.value, t.value.slot, t.value.gameIndex, Date.now());
        if (
          mine.kind === "seat_held" &&
          mine.roomId &&
          (t.value.decision === undefined || grantedSeatRoom(t.value) === mine.roomId)
        ) {
          setPhase({ kind: "seat_held", roomId: mine.roomId });
          onSettled?.();
          inFlight.current = false;
          return;
        }
      }
      const navigating = await follow(await readyForMatch(slug, matchId), 0);
      // Navigating away: stay locked so a second tap can't mint a second ticket.
      if (!navigating) inFlight.current = false;
    } catch {
      inFlight.current = false;
    }
  }, [follow, slug, matchId, onSettled]);

  /** "Check again" on the seat-held card: re-read the match and let Play be pressed afresh. */
  const retry = useCallback(() => {
    inFlight.current = false;
    setPhase({ kind: "idle" });
    onSettled?.();
  }, [onSettled]);

  /**
   * "Back to your room" (p2p #1250): carry a fresh join ticket, so a seat the
   * engine released (a dead stored token) is taken back instead of a bare
   * BAD_TOKEN. The game page RECONNECTs with any stored token first and only
   * spends the ticket when the engine no longer knows it.
   */
  const backToRoom = useCallback(
    async (roomId: string) => {
      const t = await getMatchTicket(slug, matchId);
      if (!alive.current) return;
      const href = t.ok && t.value.action === "join" && t.value.roomId === roomId ? grantHref(t.value, slug, matchId) : null;
      void router.push(href ?? `/pro/game?room=${encodeURIComponent(roomId)}`);
    },
    [router, slug, matchId],
  );

  /**
   * Drop a stale error once the situation changed (journeys S3): the banner's
   * cooldown ended, or the api answered again after a network failure. Never
   * while a press is in flight; nothing to re-read, unlike `retry`.
   */
  const dismiss = useCallback(() => {
    if (inFlight.current) return;
    setPhase((p) => (p.kind === "error" ? { kind: "idle" } : p));
  }, []);

  return { phase, play, retry, backToRoom, dismiss };
};
