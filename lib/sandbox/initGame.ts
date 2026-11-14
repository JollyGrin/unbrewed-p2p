import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import {
  PoolType,
  draw,
  makeDeck,
  newPool,
  shuffleDeck,
} from "@/components/DeckPool/PoolFns";
import {
  BOARD_SIZE,
  BoardToken,
  DEFAULT_PLAYER_COLOR,
  DEFAULT_TOKEN_SIZE,
  FIGHTER_ROW_STEP,
  FIGHTER_ROW_TOP,
  PositionBlob,
  SPAWN_ORIGIN,
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
 * The join seed does not use this alone (see joinSeat): a late joiner must
 * not sort in ahead of someone already seated.
 */
export const seatAmong = (names: Iterable<string>, self: string): number =>
  Array.from(new Set([...Array.from(names), self]))
    .sort()
    .indexOf(self);

/**
 * A newcomer's seat (the board's join seed): one past the players who already
 * have a board, so nobody sorts in on top of someone seated. Players who are
 * at the table without a board yet are joining at the same moment and would
 * all count the same boards, so those take the free seats in name order:
 * two players entering an empty room together get seats 0 and 1 on both
 * clients, whichever seed fires first.
 */
export const joinSeat = (
  boards: Iterable<string>,
  players: Iterable<string>,
  self: string,
): number => {
  const seated = new Set(Array.from(boards).filter((name) => name !== self));
  const arriving = Array.from(players).filter((name) => !seated.has(name));
  return seated.size + seatAmong(arriving, self);
};

/**
 * The seat whose corner a board's fighters are in now, so a deck change puts
 * the new ones where the old ones were (the join seat and the re-seed rank
 * can differ). A hero still on its spawn spot gives the exact seat back; one
 * that was moved gives the corner of the map it stands in. Undefined when
 * the board has no fighter pieces (a saved loadout, the starter disc).
 */
export const seatOnBoard = (
  tokens: readonly BoardToken[] | undefined,
): number | undefined => {
  const fighters = (tokens ?? []).filter((t) => !t.card && !!t.rim);
  const hero =
    fighters.find((t) => t.counter?.link === "hero") ?? fighters[0];
  if (!hero) return undefined;
  const w = hero.size ?? DEFAULT_TOKEN_SIZE;
  const h = hero.h ?? w;
  const right = hero.x + w / 2 > BOARD_SIZE.w / 2;
  const bottom = hero.y + h / 2 > BOARD_SIZE.h / 2;
  const corner = right ? (bottom ? 1 : 2) : bottom ? 3 : 0;
  // spawnFighterRow puts the hero at the row's start, `ring` rows in
  const atStart =
    hero.x === (right ? BOARD_SIZE.w - SPAWN_ORIGIN.x - w : SPAWN_ORIGIN.x);
  const rows =
    ((bottom ? BOARD_SIZE.h - hero.y - h : hero.y) - FIGHTER_ROW_TOP) /
    FIGHTER_ROW_STEP;
  const ring = atStart && Number.isInteger(rows) && rows > 0 ? rows : 0;
  return ring * 4 + corner;
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
