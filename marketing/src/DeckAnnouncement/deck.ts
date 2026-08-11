import { staticFile } from "remotion";
import type { DeckAnnouncementInput } from "./schema";

/**
 * Reads a shipped evergreen deck out of the APP's public folder — which
 * `marketing/public/evergreen-decks` symlinks to, so a deck launch never
 * needs its JSON or art copied in here. Everything the video says about a
 * deck (palette, statline, ability text, card faces) comes from this file;
 * the props only pick the deck and write the marketing copy.
 */

/** A card exactly as CardFactory wants it, with art pointed at a local file. */
export type PromoCard = {
  title: string;
  characterName: string;
  type: string;
  /** absent on schemes, which print no combat value */
  value?: number;
  boost: number;
  quantity: number;
  imageUrl?: string;
  basicText: string;
  immediateText: string;
  duringText: string;
  afterText: string;
};

export type Ability = { name?: string; text: string };

export type DeckPromo = {
  slug: string;
  deckName: string;
  borderColour: string;
  highlightColour: string;
  cardbackUrl?: string;
  hero: {
    name: string;
    hp: number;
    move: number;
    isRanged: boolean;
    quote: string;
    abilities: Ability[];
    portraitUrl?: string;
  };
  featured: { card: PromoCard; caption: string }[];
};

const fail = (message: string): never => {
  throw new Error(`DeckAnnouncement: ${message}`);
};

const ART_ROOT = "evergreen-decks/";

/**
 * Deck JSONs carry art either absolute (`https://unbrewed.xyz/evergreen-decks/…`,
 * taranis) or repo-relative (`/evergreen-decks/…`, doppelganger). Both are the
 * same file on disk — resolve them to a staticFile so renders never hit the
 * network. Anything outside the art root is left as-is (or dropped).
 */
export const resolveArt = (
  url: string | undefined | null,
): string | undefined => {
  if (!url) return undefined;
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/+/, "");
  if (path.startsWith(ART_ROOT)) return staticFile(path);
  return /^https?:\/\//.test(url) ? url : undefined;
};

/**
 * "STORMCHANNEL\nWhen King Taranis attacks…" → a heading plus its body, with
 * blank-line-separated blocks (the Doppelgänger has two) kept apart.
 */
const parseAbilities = (raw: string | undefined): Ability[] => {
  if (!raw?.trim()) return [];
  return raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [first, ...rest] = block.split("\n");
      const heading = first.trim();
      const body = rest.join(" ").replace(/\s+/g, " ").trim();
      const looksLikeHeading =
        body.length > 0 &&
        heading.length <= 42 &&
        heading === heading.toUpperCase();
      return looksLikeHeading
        ? { name: heading, text: body }
        : { text: block.replace(/\s+/g, " ").trim() };
    });
};

const asCard = (raw: Record<string, unknown>): PromoCard => ({
  title: String(raw.title ?? ""),
  characterName: String(raw.characterName ?? ""),
  type: String(raw.type ?? "attack"),
  value: raw.value == null ? undefined : Number(raw.value),
  boost: Number(raw.boost ?? 0),
  quantity: Number(raw.quantity ?? 1),
  imageUrl: resolveArt(raw.imageUrl as string | undefined),
  basicText: String(raw.basicText ?? ""),
  immediateText: String(raw.immediateText ?? ""),
  duringText: String(raw.duringText ?? ""),
  afterText: String(raw.afterText ?? ""),
});

const key = (title: string) => title.trim().toLowerCase();

/**
 * Loads + validates the deck. Every failure throws with the offending value in
 * the message: a bad `deckSlug` or a mistyped card title has to stop the render
 * (this runs in calculateMetadata, before frame 0), never render blank.
 */
export const loadDeckPromo = async (
  { deckSlug, featuredCards }: DeckAnnouncementInput,
  signal?: AbortSignal,
): Promise<DeckPromo> => {
  const src = `evergreen-decks/${deckSlug}.json`;
  const res = await fetch(staticFile(src), { signal });
  if (!res.ok) {
    return fail(
      `no deck JSON at public/${src} (HTTP ${res.status}). Check deckSlug — it must match a file name in the app's public/evergreen-decks.`,
    );
  }

  const json = (await res.json()) as { deck_data?: Record<string, unknown> };
  const data = json.deck_data;
  if (!data) return fail(`public/${src} has no deck_data block.`);

  const hero = data.hero as Record<string, unknown> | undefined;
  if (!hero?.name) return fail(`public/${src} has no deck_data.hero.name.`);

  const rawCards = Array.isArray(data.cards)
    ? (data.cards as Record<string, unknown>[])
    : [];
  if (rawCards.length === 0) return fail(`public/${src} has no cards.`);

  const byTitle = new Map(
    rawCards.map((card) => [key(String(card.title ?? "")), card]),
  );
  const featured = featuredCards.map(({ title, caption }) => {
    const match = byTitle.get(key(title));
    if (!match) {
      const known = rawCards.map((card) => String(card.title)).join(", ");
      return fail(
        `"${title}" is not a card in ${deckSlug}. Available: ${known}`,
      );
    }
    return { card: asCard(match), caption };
  });

  const appearance = (data.appearance ?? {}) as Record<
    string,
    string | undefined
  >;
  return {
    slug: deckSlug,
    deckName: String(data.name ?? hero.name),
    borderColour: appearance.borderColour || "#3A2140",
    highlightColour: appearance.highlightColour || "#E0A82E",
    cardbackUrl: resolveArt(appearance.cardbackUrl),
    hero: {
      name: String(hero.name),
      hp: Number(hero.hp ?? 0),
      move: Number(hero.move ?? 0),
      isRanged: Boolean(hero.isRanged),
      quote: String(hero.quote ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      abilities: parseAbilities(hero.specialAbility as string | undefined),
      portraitUrl: resolveArt(hero.tokenImageUrl as string | undefined),
    },
    featured,
  };
};
