import { useRouter } from "next/router";
import { useContext, useEffect, useRef } from "react";

import { PoolType } from "@/components/DeckPool/PoolFns";
import { PositionBlob } from "@/components/Positions/position.type";
import { WebGameContext } from "@/lib/contexts/WebGameProvider";
import {
  DeckRefresh,
  poolIsFrom,
  refreshPool,
  refreshTokens,
} from "@/lib/deckRefresh";

/**
 * Put a refreshed deck (#996) on a table that is already playing the saved
 * copy: every card keeps its place and takes its new face, and a hero-card
 * token keeps its spot and takes its new render (lib/deckRefresh.ts).
 * Nothing is dealt, moved or spawned.
 *
 * A table that hasn't been dealt or seeded yet needs nothing from here: the
 * hand and the board build from the starred deck, which is already the new
 * one. A table since switched to another deck is left alone.
 */
export const DeckRefreshOnTable = ({ refresh }: { refresh?: DeckRefresh }) => {
  // Read softly: outside a game provider there is no table to update.
  const game = useContext(WebGameContext);
  const name = useRouter().query.name;
  const self = Array.isArray(name) ? name[0] : name;
  const applied = useRef<DeckRefresh>();

  useEffect(() => {
    if (!game || !refresh || !self || applied.current === refresh) return;
    applied.current = refresh;
    const { gameState, gamePositions, setPlayerState, setPlayerPosition } = game;
    const players = gameState?.content?.players as
      | Record<string, { pool?: PoolType }>
      | undefined;
    const pool = players?.[self]?.pool;
    if (pool && !poolIsFrom(pool, refresh.from)) return;
    if (pool) setPlayerState()({ pool: refreshPool(pool, refresh) });
    const blob = (gamePositions?.content as Record<string, PositionBlob> | undefined)?.[
      self
    ];
    if (blob?.tokens) {
      setPlayerPosition.current({
        ...blob,
        tokens: refreshTokens(blob.tokens, refresh),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, self]);

  return null;
};
