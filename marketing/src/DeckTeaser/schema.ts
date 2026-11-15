import { z } from "zod";
import { BONUS_EFFECTS } from "../BonusShowcase/schema";
import { MUSIC_TRACKS } from "../shared/audio";
import { PARTICLE_STYLES } from "../shared/particles";

/**
 * What a main-deck card DOES when the teaser plays it, as a named mechanic.
 * As with the showcase, the props only pick the picture: every number in it
 * (spaces, health, cards, damage, value) is read from the card's own text.
 */
export const PLAY_EFFECTS = [
  /** move your fighters, heal one, draw — a regroup turn */
  "regroup",
  /** after combat, damage split across the opposing fighter's zone */
  "splash",
  /** value climbs per completed side-deck card, then fires */
  "scaling",
] as const;
export type PlayEffect = (typeof PLAY_EFFECTS)[number];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "colours must be #rrggbb hex strings");

/**
 * Props for the teaser: a playthrough montage of one deck. The hero opens;
 * the first highlights are played as turns; the side deck advances across the
 * top, with `featured` pairs played in full and the rest flashed; the LAST
 * highlight is the payoff; then the usual call to action.
 */
export const deckTeaserSchema = z.object({
  deckSlug: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'deckSlug must be a bare file name like "1y_5"'),
  highlights: z
    .array(
      z.object({
        /** exact main-deck card title */
        title: z.string().min(1),
        effect: z.enum(PLAY_EFFECTS),
        /** one short line read under the card while it plays */
        kicker: z.string().min(1).max(64),
      }),
    )
    .min(2)
    .max(4),
  pairs: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
        effect: z.enum(BONUS_EFFECTS),
        /** true = played in full (a RewardBeat); false = a quick flash */
        featured: z.boolean(),
        /** the featured beat's caption; unused on a flash */
        caption: z.string().min(1).max(110),
        still: z
          .string()
          .regex(/^[a-zA-Z0-9_/.-]+$/, "still must be a public/ relative path")
          .optional(),
      }),
    )
    .min(3)
    .max(5)
    .refine((pairs) => pairs.some((pair) => pair.featured), {
      message: "at least one pair must be featured",
    }),
  stripeColours: z.tuple([hex, hex]).optional(),
  musicTrack: z.enum(MUSIC_TRACKS).optional(),
  particleStyle: z.enum(PARTICLE_STYLES).optional(),
  backdropColour: hex.optional(),
});

export type DeckTeaserInput = z.infer<typeof deckTeaserSchema>;
