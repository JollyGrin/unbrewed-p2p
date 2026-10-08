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
