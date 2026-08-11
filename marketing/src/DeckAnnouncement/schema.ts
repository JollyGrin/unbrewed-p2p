import { z } from "zod";
import { MUSIC_TRACKS } from "./audio";
import { PARTICLE_STYLES } from "./particles";

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
  /**
   * Which committed chiptune runs under the video (public/audio/music). All
   * CC0 — see public/audio/LICENSES.md. Omit for the default, "level-1".
   */
  musicTrack: z.enum(MUSIC_TRACKS).optional(),
  /**
   * Which ambient particle field drifts behind the video, tinted from the
   * deck's own highlight colour: "motes" (neutral dust — the default),
   * "embers" (rising warm sparks), "aura" (slow orbiting wisps), "ash"
   * (falling dark flakes). Omit unless a deck clearly wants one.
   */
  particleStyle: z.enum(PARTICLE_STYLES).optional(),
});

export type DeckAnnouncementInput = z.infer<typeof deckAnnouncementSchema>;
