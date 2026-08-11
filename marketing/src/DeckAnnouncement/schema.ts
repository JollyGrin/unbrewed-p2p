import { z } from "zod";

/**
 * Props for the parameterized deck-announcement promo. A launch video is one
 * of these files in `props/` plus one render command — nothing else per deck.
 */
export const deckAnnouncementSchema = z.object({
  /** File name (without .json) under public/evergreen-decks — e.g. "taranis". */
  deckSlug: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'deckSlug must be a bare file name like "taranis" (no slashes or .json)',
    ),
  /** One line on what the deck is FOR — the niche, not the lore. */
  tagline: z.string().min(1).max(140),
  /**
   * 3–4 cards to show off, by their exact `title` in the deck JSON. The
   * caption is the "why it matters" line read alongside the card face.
   */
  featuredCards: z
    .array(
      z.object({
        title: z.string().min(1),
        caption: z.string().min(1).max(180),
      }),
    )
    .min(3)
    .max(4),
});

export type DeckAnnouncementInput = z.infer<typeof deckAnnouncementSchema>;
