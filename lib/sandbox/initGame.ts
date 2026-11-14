import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  draw,
  makeDeck,
  newPool,
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";
import {
  DEFAULT_PLAYER_COLOR,
  PositionBlob,
  newTokenId,
  spawnFighterRow,
  spawnSavedTokens,
} from "@/components/Positions/position.type";
import { fighterTokens } from "@/components/Positions/heroToken";
import { readStarredDeckFromBag } from "@/lib/bag/bagStore";

/**
 * Starting-state helpers shared by every path that has to put a player on a
 * fresh table: the hand's auto-init, the board's join seed, and the "New game"
 * reset (docs/game-reset-plan.md). The reset deliberately calls these rather
 * than nulling state and leaning on the auto-init timers — that race is what
 * made the rejoin path fragile.
 */

/** Build → shuffle → open hand of one. */
export const initPool = (deck: DeckImportType): PoolType =>
  draw(shuffleDeck(makeDeck(newPool(deck))));

/**
 * The board a player starts with: their deck's saved loadout if it has one
 * (issue #467), otherwise their fighters — the hero and each fielded
 * sidekick as medallions with their health attached (fighterTokens). The
 * loadout REPLACES the fighters, as it replaced the starter disc — a player
 * who saved tokens saved exactly what they want. With no deck at all there
 * is still the lone starter disc.
 *
 * `seat` is the player's place at the table (0 = first), which picks the
 * corner the fighters line up in, so two players' pieces don't land on top of
 * each other. Loadouts keep their one spot.
 */
export const initPositionBlob = (
  deck: DeckImportType | undefined,
  self: string,
  seat = 0,
): PositionBlob => {
  const saved = deck?.savedTokens ?? [];
  if (saved.length)
    return {
      color: deck?.savedTokenColor ?? DEFAULT_PLAYER_COLOR,
      tokens: spawnSavedTokens(saved, self),
    };
  const fighters = fighterTokens(deck?.deck_data);
  return {
    color: DEFAULT_PLAYER_COLOR,
    tokens: fighters.length
      ? spawnFighterRow(fighters, self, seat)
      : [{ id: newTokenId(self), x: 150, y: 100 }],
  };
};

/**
 * A player's seat when every client has to pick its own at the same moment
 * and none may collide: a room-wide "New game" re-seeds all boards at once,
 * so each client takes its rank among the names at the table, sorted. Every
 * client sees the same names, so every client gets a different corner.
 *
 * The join seed does not use this (GameShell counts the boards already
 * there): a late joiner must not sort in ahead of someone already seated.
 */
export const seatAmong = (names: Iterable<string>, self: string): number =>
  Array.from(new Set([...Array.from(names), self]))
    .sort()
    .indexOf(self);

/**
 * Read the starred deck out of the bag, at the moment it's needed.
 *
 * Hook instances don't sync with each other after mount, so a deck switched
 * in-game ("Change my deck") would leave every OTHER instance — including the
 * provider's — holding the old deck. Reading from the shared store at the point
 * of use sidesteps that entirely, and picks up an account deck as readily as a
 * device one (#644): both callers are user-triggered events on a page where the
 * bag has long since mounted and hydrated.
 */
export const readStarredDeck = (): DeckImportType | undefined => {
  try {
    return readStarredDeckFromBag();
  } catch {
    return undefined;
  }
};
