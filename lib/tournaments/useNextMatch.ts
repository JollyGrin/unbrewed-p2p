/**
 * Loads the signed-in player's next tournament match (#1220) for the /pro
 * banner and the account menu. Guests, a player with no open match and any api
 * failure all come out as `null` — the surfaces render nothing, never an error.
 *
 * The match detail (ready-room, opponent's last-active) is a best-effort extra:
 * if it fails the banner still draws from `/me/tournaments` alone. The two
 * surfaces on /pro share one in-flight load, and a result is reused for 20s.
 */
import { useEffect, useState } from "react";

import { useAccount } from "@/lib/account/useAccount";

import { getMatch, getMyTournaments, getTournament } from "./api";
import { sizeOf } from "./links";
import type { MatchDetail, MyTournaments, NextMatch } from "./types";

export interface MyTournamentsData {
  mine: MyTournaments;
  /** The raw inputs of the view: components derive it against a ticking clock. */
  next: { match: NextMatch; detail: MatchDetail | null; size: number | null } | null;
}

const TTL_MS = 20_000;
let cache: { at: number; userId: string; p: Promise<MyTournamentsData | null> } | null = null;

const load = async (): Promise<MyTournamentsData | null> => {
  const r = await getMyTournaments();
  if (!r.ok) return null;
  const match = r.value.nextMatch;
  // A cancelled tournament's open match is nothing to play: no banner, no menu card.
  if (!match || match.match.cancelled) return { mine: r.value, next: null };
  const d = await getMatch(match.tournament.slug, match.match.id);
  return {
    mine: r.value,
    next: { match, detail: d.ok ? d.value : null, size: sizeOf(match, r.value.tournaments) },
  };
};

export const loadMyTournaments = (userId: string, force = false) => {
  if (!force && cache && cache.userId === userId && Date.now() - cache.at < TTL_MS) return cache.p;
  const p = load();
  cache = { at: Date.now(), userId, p };
  return p;
};

export const __resetNextMatchForTests = () => {
  cache = null;
};

/** `null` while loading, for guests, with no open match, or when the api is down. */
export const useMyTournaments = (enabled = true): MyTournamentsData | null => {
  const { status, account } = useAccount();
  const userId = enabled && status === "signed-in" ? account.id : null;
  const [data, setData] = useState<MyTournamentsData | null>(null);
  useEffect(() => {
    setData(null);
    if (!userId) return;
    let alive = true;
    void loadMyTournaments(userId).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [userId]);
  return data;
};

type MatchRef = { slug: string; matchId: string };

/** The match whose room this is, from the next-match load (its live room or a game's room). */
export const matchOfRoom = (data: MyTournamentsData | null, roomId: string): MatchRef | null => {
  const next = data?.next;
  if (!next?.detail) return null;
  const d = next.detail;
  const hit = d.liveRoom?.roomId === roomId || d.match.games.some((g) => g.roomId === roomId);
  return hit ? { slug: d.tournament.slug, matchId: d.match.id } : null;
};

/**
 * Which of MY matches owns this room. `nextMatch` is only the soonest one, so
 * past it walk every running tournament I'm entered in: a started game names
 * its room in the bracket, a room still waiting for its second seat only in
 * the match detail (`liveRoom`).
 */
export const findMyMatchForRoom = async (userId: string, roomId: string): Promise<MatchRef | null> => {
  const data = await loadMyTournaments(userId);
  // No running tournament of mine (every casual player): stop at the one call.
  const mine = data?.mine.tournaments.filter((t) => t.myEntryId && t.status === "running") ?? [];
  if (mine.length === 0) return null;
  const fast = matchOfRoom(data, roomId);
  if (fast) return fast;
  const hits = await Promise.all(
    mine.map(async (t): Promise<MatchRef | null> => {
      const r = await getTournament(t.slug);
      if (!r.ok) return null;
      const open = r.value.matches.filter(
        (m) => (m.slotA === t.myEntryId || m.slotB === t.myEntryId) && !m.cancelled && (m.status === "open" || m.status === "in_play"),
      );
      const started = open.find((m) => m.games.some((g) => g.roomId === roomId));
      if (started) return { slug: t.slug, matchId: started.id };
      const details = await Promise.all(open.map((m) => getMatch(t.slug, m.id)));
      const waiting = details.find((d) => d.ok && d.value.liveRoom?.roomId === roomId);
      return waiting?.ok ? { slug: t.slug, matchId: waiting.value.match.id } : null;
    }),
  );
  return hits.find(Boolean) ?? null;
};

/** How long a `?room=` link waits on the lookup before showing the picker anyway. */
export const TAGGED_ROOM_WAIT_MS = 3000;

/**
 * A raw `?room=` link on a device without the seat (#1230): is this one of MY
 * tournament rooms? The engine only says so after a ticketless JOIN_ROOM
 * (TICKET_REQUIRED), so ask `GET /me/tournaments` first — the page holds the
 * hero picker while `pending`. Guests and api failures settle as `null`.
 */
export const useTaggedRoomLookup = (
  roomId: string | null,
  enabled: boolean,
): { pending: boolean; at: MatchRef | null } => {
  const { status, account } = useAccount();
  const userId = status === "signed-in" ? account.id : null;
  const [res, setRes] = useState<{ key: string; at: MatchRef | null } | null>(null);
  const [waitOver, setWaitOver] = useState(false);
  const active = enabled && !!roomId;
  const key = `${userId ?? ""}:${roomId ?? ""}`;
  useEffect(() => {
    if (!active) return;
    setWaitOver(false);
    const t = setTimeout(() => setWaitOver(true), TAGGED_ROOM_WAIT_MS);
    return () => clearTimeout(t);
  }, [active, roomId]);
  useEffect(() => {
    if (!active || !roomId || !userId) return;
    let alive = true;
    void findMyMatchForRoom(userId, roomId)
      .catch(() => null)
      .then((at) => alive && setRes({ key, at }));
    return () => {
      alive = false;
    };
  }, [active, roomId, userId, key]);
  if (!active) return { pending: false, at: null };
  const at = res?.key === key ? res.at : null;
  const settled = res?.key === key || status === "guest" || status === "offline";
  return { pending: !settled && !waitOver, at };
};
