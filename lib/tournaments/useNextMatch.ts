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

import { getMatch, getMyTournaments } from "./api";
import { nextMatchView, sizeOf, type NextMatchView } from "./nextMatch";
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
  if (!match) return { mine: r.value, next: null };
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

/** The view, re-derived each second so the seat-hold and deadline clocks tick. */
export const useNextMatch = (): NextMatchView | null => {
  const data = useMyTournaments();
  const [now, setNow] = useState(() => Date.now());
  const next = data?.next ?? null;
  useEffect(() => {
    if (!next) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [next]);
  return next ? nextMatchView(next.match, next.detail, next.size, now) : null;
};

/** The match whose room this is, from the next-match load (its live room or a game's room). */
export const matchOfRoom = (data: MyTournamentsData | null, roomId: string): { slug: string; matchId: string } | null => {
  const next = data?.next;
  if (!next?.detail) return null;
  const d = next.detail;
  const hit = d.liveRoom?.roomId === roomId || d.match.games.some((g) => g.roomId === roomId);
  return hit ? { slug: d.tournament.slug, matchId: d.match.id } : null;
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
): { pending: boolean; at: { slug: string; matchId: string } | null } => {
  const { status, account } = useAccount();
  const userId = status === "signed-in" ? account.id : null;
  const [res, setRes] = useState<{ key: string; at: { slug: string; matchId: string } | null } | null>(null);
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
    void loadMyTournaments(userId).then((d) => alive && setRes({ key, at: matchOfRoom(d, roomId) }));
    return () => {
      alive = false;
    };
  }, [active, roomId, userId, key]);
  if (!active) return { pending: false, at: null };
  const at = res?.key === key ? res.at : null;
  const settled = res?.key === key || status === "guest" || status === "offline";
  return { pending: !settled && !waitOver, at };
};
