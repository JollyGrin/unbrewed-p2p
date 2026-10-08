import { z } from "zod";
import { MUSIC_TRACKS } from "../shared/audio";

/**
 * Like the cosmetics, tabletop and stats ads, almost no props on purpose: ONE
 * video about one shipped feature. The knobs are the chiptune and the end
 * card's url, the line most likely to change between cutting and shipping.
 */
export const tournamentsAnnouncementSchema = z.object({
  musicTrack: z.enum(MUSIC_TRACKS).optional(),
  /** the end card's url */
  url: z.string().optional(),
});

export type TournamentsAnnouncementInput = z.infer<
  typeof tournamentsAnnouncementSchema
>;
