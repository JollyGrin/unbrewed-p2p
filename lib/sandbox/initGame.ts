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
  spawnSavedTokens,
} from "@/components/Positions/position.type";
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
 * (issue #467), otherwise the lone starter disc. The loadout REPLACES the
 * starter disc — a player who saved tokens saved exactly what they want.
 */
export const initPositionBlob = (
  deck: DeckImportType | undefined,
  self: string,
): PositionBlob => {
  const saved = deck?.savedTokens ?? [];
  return saved.length
    ? {
        color: deck?.savedTokenColor ?? DEFAULT_PLAYER_COLOR,
        tokens: spawnSavedTokens(saved, self),
      }
    : {
        color: DEFAULT_PLAYER_COLOR,
        tokens: [{ id: newTokenId(self), x: 150, y: 100 }],
      };
};

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
