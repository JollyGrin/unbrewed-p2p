/**
 * Share-link data loading (issue #566) — the public side of the cloud bag.
 *
 * `/share/deck/<id>` and `/share/map/<id>` work for EVERYONE: no account, no
 * cookie, no localStorage prerequisite. The payload behind such a link is
 * untrusted input — anyone can craft one and send it to anyone — so nothing
 * here trusts the shape it gets back. A payload that isn't recognisably a deck
 * or a map is treated as a miss rather than written into the visitor's bag.
 */
import type {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import type { MapData } from "@/lib/hooks/useLocalStorage";
import { BagKind, CloudBagPayload, fetchSharedItem } from "@/lib/account/bagCloud";

export type SharedDeckPreview = {
  kind: "deck";
  id: string;
  /** The cloud item's name — what the sharer saved it as. */
  name: string;
  heroName?: string;
  sidekickName?: string;
  /** Shuffled cards only; hero/rule cards don't go in the draw deck. */
  cardCount: number;
  cardbackUrl?: string;
  highlightColour?: string;
  deck: DeckImportType;
};

export type SharedMapPreview = {
  kind: "map";
  id: string;
  name: string;
  imgUrl: string;
  author?: string;
  map: MapData;
};

export type SharedPreview = SharedDeckPreview | SharedMapPreview;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

/**
 * Only http(s) and repo-relative urls are allowed through into the bag: an
 * image url from a share link ends up in an `<img src>` and, for decks, gets
 * rebroadcast over the game websocket. `data:` urls are refused too — they
 * would blow the ~5 MB localStorage budget the bag lives inside.
 */
export const isSafeImageUrl = (value: unknown): value is string => {
  const url = nonEmptyString(value);
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  return /^https?:\/\//i.test(url);
};

/** Cards that actually get shuffled (hero/rule cards carry isCharacterCard). */
const countShuffledCards = (cards: DeckImportCardType[]): number =>
  cards.reduce(
    (total, card) =>
      card?.isCharacterCard ? total : total + (Number(card?.quantity) || 0),
    0,
  );

/**
 * A shared deck payload → preview, or null when it isn't a deck. The bar is the
 * same one the Bag's own bulk import applies (`id` + `deck_data`), plus a cards
 * array, since everything downstream maps over it.
 */
export const parseSharedDeck = (
  item: CloudBagPayload,
): SharedDeckPreview | null => {
  const data = item?.data;
  if (!isRecord(data)) return null;
  const id = nonEmptyString(data.id);
  const deckData = data.deck_data;
  if (!id || !isRecord(deckData) || !Array.isArray(deckData.cards)) return null;

  const hero = isRecord(deckData.hero) ? deckData.hero : undefined;
  const sidekick = isRecord(deckData.sidekick) ? deckData.sidekick : undefined;
  const appearance = isRecord(deckData.appearance) ? deckData.appearance : undefined;

  return {
    kind: "deck",
    id: item.id,
    name:
      nonEmptyString(item.name) ??
      nonEmptyString(data.name) ??
      nonEmptyString(deckData.name) ??
      "Shared deck",
    heroName: hero ? nonEmptyString(hero.name) : undefined,
    // A deck with no sidekick carries the builder's `quantity: 0` stub.
    sidekickName:
      sidekick && sidekick.quantity !== 0
        ? nonEmptyString(sidekick.name)
        : undefined,
    cardCount: countShuffledCards(deckData.cards as DeckImportCardType[]),
    cardbackUrl: appearance && isSafeImageUrl(appearance.cardbackUrl)
      ? (appearance.cardbackUrl as string)
      : undefined,
    highlightColour: appearance
      ? nonEmptyString(appearance.highlightColour)
      : undefined,
    deck: data as unknown as DeckImportType,
  };
};

/** A shared map payload → preview, or null. `imgUrl` IS the map's identity. */
export const parseSharedMap = (
  item: CloudBagPayload,
): SharedMapPreview | null => {
  const data = item?.data;
  if (!isRecord(data) || !isSafeImageUrl(data.imgUrl)) return null;
  const meta = isRecord(data.meta) ? data.meta : undefined;

  return {
    kind: "map",
    id: item.id,
    name:
      nonEmptyString(item.name) ??
      (meta ? nonEmptyString(meta.title) : undefined) ??
      "Shared map",
    imgUrl: data.imgUrl as string,
    author: meta ? nonEmptyString(meta.author) : undefined,
    map: data as unknown as MapData,
  };
};

/** Everything shareable by link: bag items plus pro replays (#567). */
export type ShareKind = "deck" | "map" | "replay";

/**
 * `/share/<kind>/<id>` → `{kind, id}`, and null for anything else.
 *
 * The site is a static export on GitHub Pages, so no `[id]` route can be
 * prerendered for an id minted at runtime: the host serves 404.html for the
 * unknown path (URL intact) and pages/404.tsx renders the right landing in
 * place — the same rescue the `/share/replay/<id>` links use, and the same
 * trick the older `/online/...` referral links rely on.
 *
 * `replay` is included so there is ONE parser behind that rescue;
 * `sharedReplayIdFromPath` in components/Pro/ReplayShareLanding delegates here.
 */
export const parseSharePath = (
  asPath: string,
): { kind: ShareKind; id: string } | null => {
  const pathname = asPath.split(/[?#]/)[0] ?? "";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "share") return null;
  const kind = segments[1];
  if (kind !== "deck" && kind !== "map" && kind !== "replay") return null;
  const raw = segments[2]!;
  const id = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      // A lone `%` isn't decodable; the id is junk either way, and the landing
      // page's 404 is a better answer than a thrown error on the 404 page.
      return raw;
    }
  })();
  return id ? { kind, id } : null;
};

export type SharedLoad =
  | { status: "loading"; preview: null }
  | { status: "ready"; preview: SharedPreview }
  /** The link is dead, or points at something that isn't a deck/map. */
  | { status: "not-found"; preview: null }
  /** We never reached the API — a retry might work, so say so differently. */
  | { status: "offline"; preview: null };

/** Client route segment → the API's plural path segment. */
export const bagKindForRoute = (route: "deck" | "map"): BagKind =>
  route === "deck" ? "decks" : "maps";

/**
 * Fetch one share link and validate it. Resolves — never rejects — so a caller
 * can render the outcome without a try/catch or an error boundary.
 */
export const loadSharedItem = async (
  route: "deck" | "map",
  id: string,
): Promise<SharedLoad> => {
  if (!id) return { status: "not-found", preview: null };
  const result = await fetchSharedItem(bagKindForRoute(route), id);
  if (!result.ok) {
    return result.reason === "not_found"
      ? { status: "not-found", preview: null }
      : { status: "offline", preview: null };
  }
  const preview =
    route === "deck"
      ? parseSharedDeck(result.value)
      : parseSharedMap(result.value);
  return preview
    ? { status: "ready", preview }
    : { status: "not-found", preview: null };
};
