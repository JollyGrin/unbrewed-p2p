/**
 * the-unmatched.club deck import (#1538). Every club deck is served as JSON
 * at `https://www.the-unmatched.club/c/heroes/<slug>.<id>/export/__data.json`
 * (the slug is ignored; only `/export/` carries the cards). The club sends no
 * CORS headers, so the browser reads it through the accounts API proxy,
 * `GET ${API_URL}/club/heroes/<id>`, which passes the body through unchanged
 * (JollyGrin/unbrewed-api#152).
 *
 * The body is SvelteKit's `devalue`-flattened page data: a `nodes[]` list in
 * which the deck node's `data` is a flat array of values that refer to one
 * another by index (`-1` = undefined). Rehydrating from `data[0]` gives
 * `{ hero, cards, coverPreviewUrl, cardPreviewUrls }`; the club's own
 * rendered card images live in `cardPreviewUrls`, which is what makes the
 * deck an image deck here, the same shape as a Tabletop Simulator export.
 */
import { API_URL } from "@/lib/account/apiUrl";
import {
  DeckImportCardType,
  DeckImportType,
  UnmatchedCardType,
} from "@/components/DeckPool/deck-import.type";
import { ParsedTtsCard, buildImageDeck } from "@/lib/tts/parse-tts";

export const CLUB_ORIGIN = "https://www.the-unmatched.club";

/** `/c/heroes/<slug>.<id>` with any slug (or none), with or without `/export/…`. */
const CLUB_HERO_URL = /the-unmatched\.club\/c\/heroes\/(?:[^/?#]*?\.)?(\d+)(?:[/?#]|$)/i;

/** The club deck id in a pasted link, else undefined. */
export const parseClubLink = (text: string): string | undefined =>
  CLUB_HERO_URL.exec(text.trim())?.[1];

export const clubPageUrl = (id: string) => `${CLUB_ORIGIN}/c/heroes/x.${id}`;
export const clubProxyUrl = (id: string) => `${API_URL}/club/heroes/${encodeURIComponent(id)}`;

export class ClubImportError extends Error {
  constructor(
    /**
     * The proxy's HTTP status, `network` (fetch threw), `parse_error` (not a
     * deck body), or `unavailable`: a 404 that isn't the proxy's own
     * `{error:"not_found"}`, i.e. the route itself is missing (the API
     * version deployed predates the proxy).
     */
    public status: number | "network" | "parse_error" | "unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ClubImportError";
  }
}

export type ClubDeck = {
  deck: DeckImportType;
  author?: string;
  /** cards the club has no rendered image for (they show the template) */
  warnings: string[];
};

/* ----------------------------------------------------------------- devalue */

type Flat = unknown[];

const rehydrate = (data: Flat, index: unknown, depth = 0): unknown => {
  if (typeof index !== "number" || index < 0 || depth > 64) return undefined;
  const value = data[index];
  if (Array.isArray(value)) return value.map((i) => rehydrate(data, i, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, i]) => [
        k,
        rehydrate(data, i, depth + 1),
      ]),
    );
  }
  return value;
};

/** The deck node of a club page body, rehydrated; undefined when there is none. */
export const rehydrateClubExport = (body: unknown): ClubExport | undefined => {
  const nodes = (body as { nodes?: unknown } | null)?.nodes;
  if (!Array.isArray(nodes)) return undefined;
  for (const node of nodes) {
    const data = (node as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) continue;
    const root = data[0];
    if (root && typeof root === "object" && "hero" in (root as object)) {
      return rehydrate(data, 0) as ClubExport;
    }
  }
  return undefined;
};

/* ------------------------------------------------------------------ shapes */

/** A tiptap document: headings and effect blocks of paragraphs of text. */
type TiptapNode = { type?: string; text?: string; content?: TiptapNode[] };

type ClubCharacter = {
  id?: string;
  name?: string;
  hp?: number;
  move?: string | number;
  attack?: string;
  customImage?: string;
  externalAvatar?: string;
  quoteText?: string;
  specialAbility?: TiptapNode;
};

type ClubSidekick = {
  name?: string;
  count?: number;
  startHealth?: number;
  attack?: string;
  externalAvatar?: string;
  avatar?: string;
};

type ClubCard = {
  id?: number | string;
  type?: string;
  count?: number;
  value?: number;
  boostValue?: number;
  bannerName?: string;
  replacementImage?: string;
  art?: string;
  description?: TiptapNode;
};

export type ClubExport = {
  hero?: {
    id?: number;
    key?: string;
    title?: string;
    cardsBack?: string;
    characters?: ClubCharacter[];
    sidekicks?: ClubSidekick[];
    author?: { nickname?: string };
  };
  cards?: ClubCard[];
  coverPreviewUrl?: string;
  cardPreviewUrls?: {
    action?: Record<string, string>;
    character?: Record<string, string>;
  };
};

/* ------------------------------------------------------------------- text */

const textOf = (node: TiptapNode | undefined): string => {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  const parts = (node.content ?? []).map(textOf).filter(Boolean);
  // paragraphs inside a block read as lines
  return node.type === "paragraph" || node.type === "heading"
    ? parts.join("")
    : parts.join("\n");
};

/** `{ title, basic, immediate, during, after }` from a club card description. */
const cardText = (doc: TiptapNode | undefined) => {
  const blocks = doc?.content ?? [];
  const pick = (type: string) =>
    blocks
      .filter((b) => b.type === type)
      .map(textOf)
      .join("\n")
      .trim();
  return {
    title: pick("heading"),
    basic: pick("cardEffectDefault"),
    immediate: pick("cardEffectImmediately"),
    during: pick("cardEffectDuring"),
    after: pick("cardEffectAfter"),
    ongoing: pick("cardEffectOngoing"),
  };
};

/** Some club art is site-relative (`/drive/files/<id>/raw`). */
export const absoluteClubUrl = (url: string | undefined): string | undefined => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("/") ? `${CLUB_ORIGIN}${trimmed}` : trimmed;
};

const CARD_TYPES: Record<string, UnmatchedCardType> = {
  attack: "attack",
  defense: "defence",
  defence: "defence",
  scheme: "scheme",
  versatile: "versatile",
};

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
};

/* ----------------------------------------------------------------- decode */

/**
 * A club page body as a bag deck. Cards use the club's rendered images
 * (falling back to the card's replacement art), the hero card is a
 * reference token on the table, the template fields are filled in so the
 * card list and the preview still read right.
 */
export const decodeClubExport = (body: unknown, id?: string): ClubDeck => {
  const root = rehydrateClubExport(body);
  const hero = root?.hero;
  if (!root || !hero) throw new ClubImportError("parse_error", "That isn't a club deck page");

  const warnings: string[] = [];
  const character = hero.characters?.[0];
  const heroName = character?.name?.trim() || hero.title?.trim() || "Club deck";
  const deckName = hero.title?.trim() || heroName;
  const sidekick = hero.sidekicks?.[0];
  const previews = root.cardPreviewUrls ?? {};
  const cardbackUrl = absoluteClubUrl(hero.cardsBack) ?? absoluteClubUrl(root.coverPreviewUrl);

  const cards: ParsedTtsCard[] = [];
  const heroCardUrl = character?.id ? absoluteClubUrl(previews.character?.[character.id]) : undefined;
  if (heroCardUrl) {
    cards.push({ title: heroName, quantity: 1, image: { url: heroCardUrl }, isCharacterCard: true });
  }
  const texts: ReturnType<typeof cardText>[] = [];
  const raw = root.cards ?? [];
  for (const card of raw) {
    const text = cardText(card.description);
    const url =
      absoluteClubUrl(card.id !== undefined ? previews.action?.[String(card.id)] : undefined) ??
      absoluteClubUrl(card.replacementImage) ??
      absoluteClubUrl(card.art);
    const title = text.title || card.bannerName || "Card";
    if (!url) warnings.push(`${title} has no card image on the club; it shows as text`);
    texts.push(text);
    cards.push({
      title,
      quantity: Math.max(1, num(card.count, 1)),
      image: { url: url ?? "" },
    });
  }
  if (raw.length === 0) throw new ClubImportError("parse_error", "That club deck has no cards");

  const deck = buildImageDeck({
    name: deckName,
    heroName,
    hp: num(character?.hp, 15),
    move: num(character?.move, 2),
    isRanged: character?.attack === "range",
    specialAbility: textOf(character?.specialAbility) || undefined,
    sidekickName: sidekick?.name,
    sidekickQuantity: sidekick ? num(sidekick.count, 1) : 0,
    sidekickHp: sidekick ? num(sidekick.startHealth, 1) : undefined,
    sidekickIsRanged: sidekick?.attack === "range",
    cardbackUrl,
    cards,
  });

  // The template fields, from the club's own data, under the image.
  const offset = heroCardUrl ? 1 : 0;
  deck.deck_data.cards = deck.deck_data.cards.map((card, i): DeckImportCardType => {
    const source = raw[i - offset];
    const text = texts[i - offset];
    if (!source || !text) return card;
    const noImage = !card.cardImage?.url;
    return {
      ...card,
      // an imageless card falls back to the template draw
      cardImage: noImage ? undefined : card.cardImage,
      type: CARD_TYPES[source.type ?? ""] ?? "versatile",
      value: typeof source.value === "number" ? source.value : null,
      boost: num(source.boostValue, 0),
      characterName: source.bannerName?.trim() || heroName,
      basicText: [text.basic, text.ongoing].filter(Boolean).join("\n"),
      immediateText: text.immediate,
      duringText: text.during,
      afterText: text.after,
    };
  });

  const clubId = id ?? (hero.id !== undefined ? String(hero.id) : undefined);
  deck.id = clubId ? `club-${clubId}` : deck.id;
  deck.family_id = deck.id;
  deck.user = hero.author?.nickname?.trim() || deck.user;
  deck.note = `Imported from the-unmatched.club${hero.author?.nickname ? ` — by ${hero.author.nickname}` : ""}`;
  deck.tags = ["image-deck", "the-unmatched.club"];
  if (clubId) deck.sourceUrl = clubPageUrl(clubId);

  return { deck, author: hero.author?.nickname?.trim() || undefined, warnings };
};

/** Fetch a club deck through the API proxy. Throws ClubImportError. */
export const fetchClubDeck = async (id: string): Promise<ClubDeck> => {
  let res: Response;
  try {
    res = await fetch(clubProxyUrl(id));
  } catch (err) {
    throw new ClubImportError("network", `Couldn't reach the club: ${(err as Error)?.message ?? err}`);
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    if (!res.ok) throw new ClubImportError(res.status, `Club proxy answered ${res.status}`);
    throw new ClubImportError("parse_error", "The club answered with something that isn't JSON");
  }
  if (res.status === 404 && (body as { error?: unknown } | null)?.error !== "not_found") {
    // the API's generic router 404: the proxy route isn't deployed there
    throw new ClubImportError("unavailable", "The club proxy isn't available on this API");
  }
  if (!res.ok) throw new ClubImportError(res.status, `Club proxy answered ${res.status}`);
  return decodeClubExport(body, id);
};
