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
import { LS_KEY } from "@/lib/hooks/useLocalStorage";

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
 * Read the starred deck straight out of localStorage.
 *
 * `useLocalDeckStorage` instances don't sync with each other after mount, so a
 * deck switched in-game ("Change my deck") would leave every OTHER hook
 * instance — including the provider's — holding the old deck. Reading at the
 * moment of use sidesteps that entirely.
 */
export const readStarredDeck = (): DeckImportType | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const id = localStorage.getItem(LS_KEY.STAR_DECK);
    if (!id) return undefined;
    const raw = localStorage.getItem(LS_KEY.DECKS);
    const decks: DeckImportType[] = raw ? JSON.parse(raw) : [];
    return decks.find((deck) => deck?.id === id);
  } catch {
    return undefined;
  }
};
