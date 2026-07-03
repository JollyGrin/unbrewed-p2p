import axios from "axios";
import { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { POPULAR_DECKS, PopularDeckMeta } from "@/lib/constants/top-decks";
import { DEFAULT_SERVER, LS_KEY } from "@/lib/hooks/useLocalStorage";

const DECK_API = "https://unbrewed-api.vercel.app/api/unmatched-deck/";

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

/** One of the community's 30 most-liked decks, at random. */
export const randomPopularDeck = (): PopularDeckMeta =>
  POPULAR_DECKS[Math.floor(Math.random() * POPULAR_DECKS.length)];

/**
 * Fetch a deck by id or version_id: live API first (latest version),
 * bundled /public/top-decks snapshot as fallback (top-30 only).
 */
export const fetchDeckById = async (id: string): Promise<DeckImportType> => {
  try {
    const result = await axios.get<DeckImportType>(DECK_API + id);
    return result.data;
  } catch (err) {
    console.warn("deck api failed, trying bundled snapshot", err);
    const result = await axios.get<DeckImportType>(`/top-decks/${id}.json`);
    return result.data;
  }
};

/**
 * Save a deck to the bag and star it, writing localStorage synchronously so
 * it's guaranteed to be there when /game mounts right after (the hook-based
 * setters flush on a later render, which a router.push can outrun).
 */
export const persistAndStarDeck = (deck: DeckImportType): void => {
  const raw = localStorage.getItem(LS_KEY.DECKS);
  const decks: DeckImportType[] = raw ? JSON.parse(raw) : [];
  if (!decks.some((d) => d.id === deck.id)) {
    decks.push(deck);
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify(decks));
  }
  localStorage.setItem(LS_KEY.STAR_DECK, deck.id);
};
