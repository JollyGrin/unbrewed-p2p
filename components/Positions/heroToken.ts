import { hasFieldedSidekick } from "@/components/DeckPool/PoolFns";
import {
  BoardToken,
  DEFAULT_TOKEN_SIZE,
  SavedToken,
  clampLabel,
} from "./position.type";

/** A deck fighter that can be offered as a one-press image token. */
export type HeroTokenSource = {
  kind: "hero" | "sidekick";
  name: string;
  imageUrl: string;
};

type Fighter = { name?: string | null; tokenImageUrl?: string | null };

/**
 * Absolute `https` art, or a site-relative path ("/evergreen-decks/...") to the
 * app's own static files. Kept as the deck has it, never made absolute.
 * Refuses http, data:, protocol-relative "//" and blank values.
 */
const usableImage = (url?: string | null): string | undefined => {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/"))
    return trimmed.startsWith("//") || trimmed.startsWith("/\\") ? undefined : trimmed;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The hero, and an enabled sidekick, that carry a usable `tokenImageUrl`.
 * Empty when the deck has none, which hides the library button.
 */
export const heroTokenSources = (
  deckData?: {
    hero?: Fighter | null;
    sidekick?: (Fighter & { hp?: number | null; quantity?: number | null }) | null;
  } | null,
): HeroTokenSource[] => {
  const out: HeroTokenSource[] = [];
  const hero = deckData?.hero;
  const heroUrl = usableImage(hero?.tokenImageUrl);
  if (hero && heroUrl) out.push({ kind: "hero", name: hero.name?.trim() || "Hero", imageUrl: heroUrl });

  const sidekick = deckData?.sidekick;
  const sidekickUrl = usableImage(sidekick?.tokenImageUrl);
  if (sidekick && sidekickUrl && hasFieldedSidekick(sidekick))
    out.push({ kind: "sidekick", name: sidekick.name?.trim() || "Sidekick", imageUrl: sidekickUrl });
  return out;
};

/** Round, labelled image piece. `imageUrl` stays set so older clients draw it. */
export const heroToken = (
  source: HeroTokenSource,
): Omit<BoardToken, "id" | "x" | "y"> => ({
  imageUrl: source.imageUrl,
  clip: "circle",
  label: clampLabel(source.name),
  size: DEFAULT_TOKEN_SIZE,
  h: DEFAULT_TOKEN_SIZE,
});

/** A fresh table's hero piece, and its smaller sidekick pieces. */
export const HERO_MEDALLION_SIZE = 88;
export const SIDEKICK_MEDALLION_SIZE = 64;
/** Sidekick pieces a fresh table lays out at most (Clone Troopers field 6). */
export const MAX_SIDEKICK_MEDALLIONS = 8;
/** Rim for a deck with no usable border colour: the table's gold. */
export const DEFAULT_RIM = "#E7CC98";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SMALL_WORDS = new Set(["the", "of", "a", "an", "and", "de", "la"]);

/**
 * Up to two letters for a fighter's monogram: the first letters of its first
 * two words that matter ("The Piper of the Underroads" = "PU"), or the one
 * letter of a one-word name. Blank name = "".
 */
export const fighterInitials = (name?: string | null): string => {
  const words = (name ?? "")
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  const main = words.filter((w) => !SMALL_WORDS.has(w.toLowerCase()));
  return (main.length ? main : words)
    .slice(0, 2)
    .map((w) => Array.from(w)[0].toUpperCase())
    .join("");
};

type FighterDeckData = {
  hero?: (Fighter & { hp?: number | null }) | null;
  sidekick?: (Fighter & { hp?: number | null; quantity?: number | null }) | null;
  appearance?: { borderColour?: string | null; highlightColour?: string | null } | null;
};

/**
 * The pieces a fresh table starts with, hero first: one medallion for the
 * hero and one per fielded sidekick, each round, rimmed in the deck's colour
 * and showing its art, or its initials when the deck has none (most community
 * decks). Empty without a hero.
 *
 * Health rides on the piece as a linked counter, so it and the HUD show and
 * change the same number: the hero's always, and a lone sidekick's too (0
 * when the deck prints none, as on the HUD). Several sidekicks share one HUD number that counts FIGHTERS, not
 * health, so each of those carries its own detached counter (only when one
 * can take more than a single hit) and no name, which would repeat down the
 * row.
 *
 * Every piece keeps `imageUrl` / `label` / `counter` as older clients read
 * them; `rim` and `initials` are the only new fields (see BoardToken).
 */
export const fighterTokens = (deckData?: FighterDeckData | null): SavedToken[] => {
  const hero = deckData?.hero;
  if (!hero) return [];
  const colours = deckData?.appearance;
  const rim =
    [colours?.borderColour, colours?.highlightColour]
      .map((c) => c?.trim())
      .find((c): c is string => !!c && HEX.test(c)) ?? DEFAULT_RIM;

  const piece = (fighter: Fighter, size: number, named: boolean): SavedToken => {
    const name = fighter.name?.trim() ?? "";
    const imageUrl = usableImage(fighter.tokenImageUrl);
    return {
      ...(imageUrl ? { imageUrl, clip: "circle" as const } : {}),
      ...(named && name ? { label: clampLabel(name) } : {}),
      rim,
      initials: fighterInitials(name),
      size,
      h: size,
    };
  };

  const out: SavedToken[] = [
    { ...piece(hero, HERO_MEDALLION_SIZE, true), counter: { link: "hero" } },
  ];

  const sidekick = deckData?.sidekick;
  const count = Math.min(
    Math.max(0, Math.floor(sidekick?.quantity ?? 0)),
    MAX_SIDEKICK_MEDALLIONS,
  );
  if (!sidekick || count === 0) return out;
  const hp = typeof sidekick.hp === "number" ? sidekick.hp : undefined;
  for (let i = 0; i < count; i += 1) {
    const token = piece(sidekick, SIDEKICK_MEDALLION_SIZE, count === 1);
    // A lone sidekick always carries its heart, as the HUD always shows one:
    // with no printed health both read 0 and both can be adjusted.
    if (count === 1) token.counter = { link: "sidekick" };
    else if (count > 1 && hp !== undefined && hp > 1)
      token.counter = { value: hp, min: 0 };
    out.push(token);
  }
  return out;
};
