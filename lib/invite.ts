import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import { DEFAULT_SERVER } from "@/lib/hooks/useLocalStorage";
import {
  addItem,
  bagItems,
  loadLocal,
  setStar,
  stores,
} from "@/lib/bag/bagStore";

// re-exported so existing callers keep their import path; evergreen decks
// (rule-enforced in Pro) resolve from the committed snapshot first
export { fetchDeckById } from "@/lib/evergreenDecks";

/**
 * Build a one-click invite link for the /join page. Carries everything a
 * friend needs to land in the same room: lobby name, the host's gameserver
 * (omitted when it's the default, to keep links short) and optionally a
 * deck the host picked for them.
 */
export const buildInviteUrl = (opts: {
  gid: string;
  server?: string;
  deckId?: string;
}): string => {
  const params = new URLSearchParams({ gid: opts.gid });
  if (opts.server && opts.server !== DEFAULT_SERVER) {
    params.set("server", opts.server);
  }
  if (opts.deckId) params.set("deckId", opts.deckId);
  return `${window.location.origin}/join?${params.toString()}`;
};

/** Mirrors the validation in the gameserver settings modal. */
export const isValidServerUrl = (server: string): boolean => {
  const urlRegexPattern = new RegExp(
    "^https?:\\/\\/[a-z0-9-]+(\\.[a-z0-9-]+)+([/?].*)?$",
    "i",
  );
  return urlRegexPattern.test(server) || server.startsWith("http://localhost");
};

const ADJECTIVES = [
  "Swift",
  "Cunning",
  "Brave",
  "Sly",
  "Grim",
  "Merry",
  "Bold",
  "Quiet",
  "Wild",
  "Lucky",
  "Fierce",
  "Nimble",
  "Daring",
  "Clever",
  "Shadowy",
  "Gallant",
];

const CREATURES = [
  "Raven",
  "Badger",
  "Fox",
  "Wolf",
  "Sparrow",
  "Knight",
  "Rogue",
  "Bard",
  "Drake",
  "Otter",
  "Lynx",
  "Hare",
  "Falcon",
  "Squire",
  "Corsair",
  "Wanderer",
];

/** e.g. "SwiftRaven" — a ready-to-play name for invited friends. */
export const randomPlayerName = (): string => {
  const pick = (list: string[]) =>
    list[Math.floor(Math.random() * list.length)];
  return `${pick(ADJECTIVES)}${pick(CREATURES)}`;
};

/** One of the visible community decks, at random. */
export const randomPopularDeck = (): PopularDeckMeta => {
  const visibleDecks = POPULAR_DECKS.filter((deck) => deck.tier !== "reflavored" && deck.tier !== "lab");
  return visibleDecks[Math.floor(Math.random() * visibleDecks.length)]!;
};

/**
 * Save a deck to the bag and star it, then hand back once the write has
 * actually landed — callers navigate to /game immediately afterwards, so the
 * deck has to be resolvable by the time the table mounts.
 *
 * It goes through the bag store rather than localStorage (#644), so a signed-in
 * player's invite deck lands in their account like every other add, and a guest
 * (or an unreachable API) gets the identical synchronous localStorage write
 * this has always done. The star is set first: it is a local pointer either
 * way, and a slow upload must not leave the player deckless at the table.
 */
export const persistAndStarDeck = async (
  deck: DeckImportType,
): Promise<void> => {
  setStar(deck.id);
  loadLocal(stores.decks);
  const already = bagItems(stores.decks).some((d) => d?.id === deck.id);
  if (!already) await addItem(stores.decks, deck);
};
