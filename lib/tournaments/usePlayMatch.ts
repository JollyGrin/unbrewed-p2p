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

import { getMatchTicket, readyForMatch, type Result } from "./api";
import type { TicketGrant } from "./types";

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

const POLL_MS = 3000;
const MAX_POLLS = 40;

export const usePlayMatch = (slug: string, matchId: string, onSettled?: () => void) => {
  const router = useRouter();
  const [phase, setPhase] = useState<PlayPhase>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const follow = useCallback(
    async (r: Result<TicketGrant>, polls: number): Promise<void> => {
      if (!alive.current) return;
      if (!r.ok) {
        setPhase({ kind: "error", message: playErrorMessage(r) });
        onSettled?.();
        return;
      }
      const href = grantHref(r.value, slug, matchId);
      if (href) {
        void router.push(href);
        return;
      }
      if (polls >= MAX_POLLS) {
        setPhase({ kind: "error", message: "The other room didn't open. Try again." });
        return;
      }
      setPhase({ kind: "opening" });
      await new Promise((ok) => setTimeout(ok, POLL_MS));
      if (alive.current) await follow(await getMatchTicket(slug, matchId), polls + 1);
    },
    [router, slug, matchId, onSettled],
  );

  const play = useCallback(async () => {
    setPhase({ kind: "busy" });
    await follow(await readyForMatch(slug, matchId), 0);
  }, [follow, slug, matchId]);

  return { phase, play };
};
