import { z } from "zod";
import { MUSIC_TRACKS } from "../shared/audio";
import { PARTICLE_STYLES } from "../shared/particles";

/**
 * What each reward DOES, as a named mechanic. The composition draws one
 * animated vignette per mechanic, and reads every number in it (how many
 * cards, what health, what move) out of the reward's own text in the deck
 * JSON — the props only say which picture to draw.
 */
export const BONUS_EFFECTS = [
  /** the hero becomes a ranged fighter: a reach line extends */
  "reach",
  /** up to N cards torn out of an opponent's discard pile */
  "exile",
  /** a defeated friendly fighter returns at N health */
  "revive",
  /** the hero's move value rises to N */
  "move",
  /** a face-down boost slides under the attack, then to the deck bottom */
  "blindBoost",
] as const;
export type BonusEffect = (typeof BONUS_EFFECTS)[number];

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "colours must be #rrggbb hex strings");

/**
 * Props for the side-deck showcase: one deck, 3–5 front/back pairs from its
 * `extraCards`, and the marketing copy. Card faces, texts, the hero, the
 * sidekick and the rule-card title all come from the deck JSON.
 */
export const bonusShowcaseSchema = z.object({
  /** File name (without .json) under public/evergreen-decks. */
  deckSlug: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      'deckSlug must be a bare file name like "1y_5" (no slashes or .json)',
    ),
  /** The line under the side deck's title on the intro. */
  intro: z.string().min(1).max(90),
  /** The closing line above the url. */
  outro: z.string().min(1).max(70),
  beats: z
    .array(
      z.object({
        /** exact `title` of the face the card starts on (e.g. the Adventure) */
        front: z.string().min(1),
        /** exact `title` of the face it flips to (e.g. its Reward) */
        back: z.string().min(1),
        effect: z.enum(BONUS_EFFECTS),
        /** why the reward matters, read beside the vignette */
        caption: z.string().min(1).max(110),
        /**
         * Optional real client render, under public/ (e.g.
         * "img/showcase/pomni/reward2.webp"), shown as a framed insert.
         */
        still: z
          .string()
          .regex(/^[a-zA-Z0-9_/.-]+$/, "still must be a public/ relative path")
          .optional(),
      }),
    )
    .min(3)
    .max(5),
  /** The two stripe colours of the backdrop's big-top sunburst. */
  stripeColours: z.tuple([hex, hex]).optional(),
  musicTrack: z.enum(MUSIC_TRACKS).optional(),
  particleStyle: z.enum(PARTICLE_STYLES).optional(),
  /** Same as DeckAnnouncement: replaces the deck border colour as the base. */
  backdropColour: hex.optional(),
});

export type BonusShowcaseInput = z.infer<typeof bonusShowcaseSchema>;
