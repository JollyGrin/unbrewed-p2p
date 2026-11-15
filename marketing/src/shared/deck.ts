import { staticFile } from "remotion";

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
  /**
   * Whole-card art (grievous, darth-vader and luke-skywalker ship full
   * printed card renders). The app's Card draws this full-bleed instead of
   * the generated template — dropping it prints title and rules text twice.
   */
  cardImage?: { url: string; cols?: number; rows?: number; index?: number };
  basicText: string;
  immediateText: string;
  duringText: string;
  afterText: string;
};

export type Ability = { name?: string; text: string };

/**
 * What to pull out of a deck: the JSON file name plus the cards a composition
 * wants faces for. `DeckAnnouncement` passes its props file straight in;
 * `CosmeticsAnnouncement` passes a fixed cast written into the composition.
 */
export type DeckSelection = {
  deckSlug: string;
  featuredCards: { title: string; caption: string }[];
};

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
 * A card's whole-card image, with its url pointed at the local file. Sprite
 * sheet fields (Tabletop Simulator exports) ride along untouched — they are
 * cell coordinates, not paths. A cardImage whose url will not resolve is
 * dropped rather than carried: Card only falls back to the generated
 * template when the url is absent or the image errors.
 */
const asCardImage = (raw: unknown): PromoCard["cardImage"] => {
  if (!raw || typeof raw !== "object") return undefined;
  const { url, cols, rows, index } = raw as Record<string, unknown>;
  const resolved = resolveArt(typeof url === "string" ? url : undefined);
  if (!resolved) return undefined;
  return {
    url: resolved,
    ...(cols == null ? {} : { cols: Number(cols) }),
    ...(rows == null ? {} : { rows: Number(rows) }),
    ...(index == null ? {} : { index: Number(index) }),
  };
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

/**
 * Rule cards ("The Clock Tower") carry the mechanic a hero ability only
 * references, so they join the ability panel as further blocks — title as
 * the heading, body collapsed to one paragraph.
 */
const parseRuleCards = (raw: unknown): Ability[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((card) => card as Record<string, unknown>)
    .map((card) => ({
      name:
        String(card.title ?? "")
          .trim()
          .toUpperCase() || undefined,
      text: String(card.content ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    }))
    .filter((a) => a.text.length > 0);
};

const asCard = (raw: Record<string, unknown>): PromoCard => ({
  title: String(raw.title ?? ""),
  characterName: String(raw.characterName ?? ""),
  type: String(raw.type ?? "attack"),
  value: raw.value == null ? undefined : Number(raw.value),
  boost: Number(raw.boost ?? 0),
  quantity: Number(raw.quantity ?? 1),
  imageUrl: resolveArt(raw.imageUrl as string | undefined),
  cardImage: asCardImage(raw.cardImage),
  basicText: String(raw.basicText ?? ""),
  immediateText: String(raw.immediateText ?? ""),
  duringText: String(raw.duringText ?? ""),
  afterText: String(raw.afterText ?? ""),
});

const key = (title: string) => title.trim().toLowerCase();

type DeckData = Record<string, unknown>;

/**
 * Fetches `public/evergreen-decks/<deckSlug>.json` and returns its
 * `deck_data`. Throws with the path on a bad slug or a JSON with no hero.
 */
const fetchDeckData = async (
  deckSlug: string,
  signal?: AbortSignal,
): Promise<DeckData> => {
  const src = `evergreen-decks/${deckSlug}.json`;
  const res = await fetch(staticFile(src), { signal });
  if (!res.ok) {
    return fail(
      `no deck JSON at public/${src} (HTTP ${res.status}). Check deckSlug — it must match a file name in the app's public/evergreen-decks.`,
    );
  }

  const json = (await res.json()) as { deck_data?: DeckData };
  const data = json.deck_data;
  if (!data) return fail(`public/${src} has no deck_data block.`);

  const hero = data.hero as Record<string, unknown> | undefined;
  if (!hero?.name) return fail(`public/${src} has no deck_data.hero.name.`);
  return data;
};

/** The deck promo's view of an already-fetched `deck_data`. */
const deckPromoFrom = (
  data: DeckData,
  { deckSlug, featuredCards }: DeckSelection,
): DeckPromo => {
  const hero = data.hero as Record<string, unknown>;
  const rawCards = Array.isArray(data.cards)
    ? (data.cards as Record<string, unknown>[])
    : [];
  if (rawCards.length === 0) {
    return fail(`public/evergreen-decks/${deckSlug}.json has no cards.`);
  }

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
    // `name` is an empty string on most launch decks, not absent — `||` so
    // those fall back to the hero name instead of slamming a blank title.
    deckName: String(data.name || hero.name).trim(),
    borderColour: appearance.borderColour || "#3A2140",
    highlightColour: appearance.highlightColour || "#E0A82E",
    cardbackUrl: resolveArt(appearance.cardbackUrl),
    hero: {
      name: String(hero.name).trim(),
      hp: Number(hero.hp ?? 0),
      move: Number(hero.move ?? 0),
      isRanged: Boolean(hero.isRanged),
      quote: String(hero.quote ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      abilities: [
        ...parseAbilities(hero.specialAbility as string | undefined),
        ...parseRuleCards(data.ruleCards),
      ],
      portraitUrl: resolveArt(hero.tokenImageUrl as string | undefined),
    },
    featured,
  };
};

/**
 * Loads + validates the deck. Every failure throws with the offending value in
 * the message: a bad `deckSlug` or a mistyped card title has to stop the render
 * (this runs in calculateMetadata, before frame 0), never render blank.
 */
export const loadDeckPromo = async (
  selection: DeckSelection,
  signal?: AbortSignal,
): Promise<DeckPromo> =>
  deckPromoFrom(await fetchDeckData(selection.deckSlug, signal), selection);

// ---- bonus cards (side decks: Adventures, Rewards, …) ----

/**
 * A card from the deck's `extraCards` — the side-deck faces that are not
 * shuffled into the draw pile (POMNI's Adventure and Reward cards). They ship
 * as whole-card art, often rotated to landscape: `turn` says which way the
 * printed art has to be spun to read upright.
 */
export type BonusCard = PromoCard & { turn?: "cw" | "ccw" };

export type Fighter = { name: string; hp: number; portraitUrl?: string };

export type BonusDeck = DeckPromo & {
  sidekick?: Fighter;
  /** the deck's first rule card — for POMNI, "Caine's Adventures" */
  ruleCard?: { title: string; text: string };
  /** front/back pairs in the order the props listed them */
  pairs: { front: BonusCard; back: BonusCard }[];
};

/** Titles in extraCards carry stray newlines and no-break spaces. */
const bonusKey = (title: string) =>
  title.replace(/\s+/g, " ").trim().toLowerCase();

const asBonusCard = (raw: Record<string, unknown>): BonusCard => {
  const turn = (raw.cardImage as Record<string, unknown> | undefined)?.turn;
  return {
    ...asCard(raw),
    ...(turn === "cw" || turn === "ccw" ? { turn } : {}),
  };
};

/**
 * The deck plus the side-deck pairs a showcase asked for, by title, from
 * `extraCards`. A missing title fails before frame 0 with every real title
 * listed — same contract as the featured cards.
 */
export const loadBonusDeck = async (
  {
    deckSlug,
    pairs,
    featuredCards = [],
  }: {
    deckSlug: string;
    pairs: { front: string; back: string }[];
    /** main-deck cards to load faces for too (the teaser plays some) */
    featuredCards?: DeckSelection["featuredCards"];
  },
  signal?: AbortSignal,
): Promise<BonusDeck> => {
  const data = await fetchDeckData(deckSlug, signal);
  const deck = deckPromoFrom(data, { deckSlug, featuredCards });

  const extras = Array.isArray(data.extraCards)
    ? (data.extraCards as Record<string, unknown>[])
    : [];
  if (extras.length === 0) {
    return fail(
      `${deckSlug} has no extraCards, so there is no side deck to show.`,
    );
  }
  const byTitle = new Map(
    extras.map((card) => [bonusKey(String(card.title ?? "")), card]),
  );
  const find = (title: string) => {
    const match = byTitle.get(bonusKey(title));
    if (!match) {
      const known = extras
        .map((card) => JSON.stringify(bonusKey(String(card.title))))
        .join(", ");
      return fail(
        `"${title}" is not in ${deckSlug}'s extraCards. Available: ${known}`,
      );
    }
    return asBonusCard(match);
  };

  const sidekick = data.sidekick as Record<string, unknown> | undefined;
  const rule = Array.isArray(data.ruleCards)
    ? (data.ruleCards[0] as Record<string, unknown> | undefined)
    : undefined;

  return {
    ...deck,
    sidekick: sidekick?.name
      ? {
          name: String(sidekick.name).trim(),
          hp: Number(sidekick.hp ?? 0),
          portraitUrl: resolveArt(sidekick.tokenImageUrl as string | undefined),
        }
      : undefined,
    ruleCard: rule?.title
      ? {
          title: String(rule.title).trim(),
          text: String(rule.content ?? "")
            .replace(/\s+/g, " ")
            .trim(),
        }
      : undefined,
    pairs: pairs.map(({ front, back }) => ({
      front: find(front),
      back: find(back),
    })),
  };
};
