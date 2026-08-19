import { z } from "zod";
import { MUSIC_TRACKS } from "../shared/audio";

/**
 * The cosmetics ad takes almost no props on purpose: it is ONE video about one
 * shipped feature, so the storyboard, the deck and the cast are written into
 * the composition (`cast.ts`) rather than parameterized. The only knob is which
 * committed CC0 chiptune runs under it.
 */
export const cosmeticsAnnouncementSchema = z.object({
  musicTrack: z.enum(MUSIC_TRACKS).optional(),
});

export type CosmeticsAnnouncementInput = z.infer<
  typeof cosmeticsAnnouncementSchema
>;
