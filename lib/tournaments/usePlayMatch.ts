/**
 * "I'm ready" / "Join now" on the match page (#1218): `POST …/ready` grants a
 * ticket and says create or join; the page then goes to `/pro/game` with it
 * (lib/pro/tournamentTicket). A `join` whose room is still opening (both pressed
 * at once — settled rule 6) polls `GET …/ticket` until the room has an id, or
 * the api hands back `create` after its 90s grace.
 */
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";

import { ticketGameHref } from "@/lib/pro/tournamentTicket";

import { getMatch, getMatchTicket, readyForMatch, type Result } from "./api";
import type { MatchDetail, TicketGrant } from "./types";

export type PlayPhase =
  | { kind: "idle" }
  | { kind: "busy" }
  /** Join, but the other room has no id yet. */
  | { kind: "opening" }
  | { kind: "error"; message: string };

/** Readable copy for a failed ready / ticket call. */
export const playErrorMessage = (r: Extract<Result<unknown>, { ok: false }>): string => {
  switch (r.reason) {
    case "unauthorized":
      return "Your session ended. Sign in with Discord again.";
    case "forbidden":
      return "Only the two players in this match can play it.";
    case "not_found":
      return "This match no longer exists.";
    case "rate_limited":
      return "Too many tries at once. Wait a moment, then try again.";
    case "conflict":
      if (r.code === "match_in_play") return "A game for this match is already in play.";
      if (r.code === "seat_held")
        return "Your seat is held in this match's room on another tab or device. Carry on there, or try again here once the 15-minute hold runs out.";
      if (r.code === "not_running") return "This tournament isn't running.";
      return r.message ? `This match isn't open: ${r.message}.` : "This match isn't open to play.";
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
 * A ticket for a retry or a poll. `GET …/ticket` records nothing, so it is only
 * good for a JOIN (the other room is recorded already). Whenever the answer is
 * — or turns into — `create`, ask again with `POST …/ready`, which records the
 * ready-check the new room is filed under: otherwise the room is invisible to
 * the api and the opponent can open a second one (settled rule 6). And never
 * while the caller's own room is live: that would be a second room (#1233 review).
 */
export const freshGrant = async (
  slug: string,
  matchId: string,
  now: () => number = Date.now,
): Promise<Result<TicketGrant>> => {
  const t = await getMatchTicket(slug, matchId);
  if (!t.ok || t.value.action === "join") return t;
  // A `create` while the caller's OWN seat hold is live (an opponent's would
  // have been a `join`): that room is open on another tab or device. A new
  // ready-check would open a second room for the same match — never record
  // one. (Taking that seat over here needs the engine: a ticket JOIN from an
  // already-seated player is TICKET_MISMATCH, and only the first tab holds the
  // reconnect token.)
  const d = await getMatch(slug, matchId);
  if (d.ok && ownHoldLive(d.value, t.value.slot, now())) return { ok: false, reason: "conflict", code: "seat_held" };
  return readyForMatch(slug, matchId);
};

/** The caller (`slot`) has a live `create` ready-check — a room of theirs is open or opening. */
export const ownHoldLive = (d: MatchDetail, slot: "a" | "b", now: number): boolean => {
  const mine = slot === "a" ? d.match?.slotA : d.match?.slotB;
  if (!mine) return false;
  if (d.liveRoom && d.liveRoom.readyEntryId === mine && Date.parse(d.liveRoom.expiresAt) > now) return true;
  return d.readyChecks.some(
    (c) => c.entryId === mine && c.role === "create" && c.outcome === "pending" && Date.parse(c.expiresAt) > now,
  );
};

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
        setPhase({ kind: "error", message: playErrorMessage(r) });
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
      const navigating = await follow(await readyForMatch(slug, matchId), 0);
      // Navigating away: stay locked so a second tap can't mint a second ticket.
      if (!navigating) inFlight.current = false;
    } catch {
      inFlight.current = false;
    }
  }, [follow, slug, matchId]);

  return { phase, play };
};
