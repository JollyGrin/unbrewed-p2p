/**
 * Is this /pro/game load a tournament game? One answer for the whole page:
 *
 *  - `ticket`: the match page sent a ticket; the room is that match's.
 *  - `tagged`: a room this browser remembers as a tournament room, or one the
 *    api says the signed-in player plays in (`GET /me/tournament-room/:roomId`).
 *  - `lookup`: still asking the api (at most TOURNAMENT_ROOM_LOOKUP_MS).
 *  - `none`: everything else, including every guest and every api failure.
 *
 * The api is asked only for a signed-in player's `?room=` link that this tab
 * holds no seat token for: the tab's own seat always resumes as it is, and a
 * guest can't play in a tournament. Once the wait is over the answer is final
 * for that room: a late reply never pulls the page out of a casual room.
 */
import { useEffect, useRef, useState } from "react";

import { useAccount } from "@/lib/account/useAccount";
import { getMyTournamentRoom } from "@/lib/tournaments/api";

import { getTabToken } from "./recentRooms";
import { rememberTournamentRoom, tournamentRoomOf } from "./tournamentTicket";
import type { TicketLaunch, TournamentRoom } from "./tournamentTicket";

export type TournamentRoomKind = "none" | "lookup" | "ticket" | "tagged";

export interface TournamentRoomState {
  kind: TournamentRoomKind;
  /** The match this room belongs to; null for `none` and `lookup`. */
  ref: TournamentRoom | null;
}

/** How long a `?room=` link waits on the lookup before it opens as a casual room. */
export const TOURNAMENT_ROOM_LOOKUP_MS = 1500;

const NONE: TournamentRoomState = { kind: "none", ref: null };

export function useTournamentRoom(room: string | null, ticket: TicketLaunch | null): TournamentRoomState {
  const { status, account } = useAccount();
  const userId = status === "signed-in" ? account.id : null;
  const note = ticket || !room ? null : tournamentRoomOf(room);
  const ask = !ticket && !!room && !note && !getTabToken(room) && status !== "guest" && status !== "offline";
  // The first answer for a room wins: the api's, or null once the wait ran out.
  const [answer, setAnswer] = useState<{ room: string; at: TournamentRoom | null } | null>(null);
  const settledRef = useRef<string | null>(null);
  const settle = (r: string, at: TournamentRoom | null) => {
    if (settledRef.current === r) return;
    settledRef.current = r;
    if (at) rememberTournamentRoom(r, at, Date.now(), false); // a refresh knows without asking again; no seat yet
    setAnswer({ room: r, at });
  };

  useEffect(() => {
    if (!ask || !room) return;
    const t = setTimeout(() => settle(room, null), TOURNAMENT_ROOM_LOOKUP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, room]);

  useEffect(() => {
    if (!ask || !room || !userId) return;
    let alive = true;
    void getMyTournamentRoom(room, TOURNAMENT_ROOM_LOOKUP_MS)
      .then((r) => (r.ok ? r.value : null), () => null)
      .then((at) => alive && settle(room, at));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, room, userId]);

  if (ticket) return { kind: "ticket", ref: { slug: ticket.slug, matchId: ticket.matchId } };
  if (!room) return NONE;
  if (note) return { kind: "tagged", ref: note };
  if (!ask) return NONE;
  if (answer?.room !== room) return { kind: "lookup", ref: null };
  return answer.at ? { kind: "tagged", ref: answer.at } : NONE;
}
