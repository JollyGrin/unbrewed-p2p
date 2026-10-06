/** Link/slug helpers with no heavy imports: the navbar chip imports this (#1265). */
import type { NextMatch } from "./types";

export const matchHref = (slug: string, matchId: string): string =>
  `/tournaments?t=${encodeURIComponent(slug)}&m=${encodeURIComponent(matchId)}`;

/** The bracket size, from the row's own field or the player's tournament list. */
export const sizeOf = (n: NextMatch, listed: readonly { id: string; size: number }[] = []) =>
  n.tournament.size ?? listed.find((t) => t.id === n.tournament.id)?.size ?? null;
