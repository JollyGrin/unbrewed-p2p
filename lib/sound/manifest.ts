/**
 * GENERATED with the pack (see public/sounds/table/SOURCES.md): do not edit by
 * hand. Byte ranges [offset, length] of each take inside the one MP3 file. The
 * file is plain MP3 frames back to back, so it also plays as a whole in any
 * player; the engine slices it and decodes each take on its own.
 */
import type { TakeGroup } from "./events";

export const SOUND_PACK_URL = "/sounds/table/table-sounds.mp3";
export const SOUND_PACK_BYTES = 92448;

export const SOUND_TAKES: Record<TakeGroup, readonly (readonly [number, number])[]> = {
  draw: [[0, 1080], [1080, 2376], [3456, 1296], [4752, 2376], [7128, 2376], [9504, 2376]],
  place: [[11880, 1080], [12960, 1296], [14256, 2376], [16632, 2592]],
  discard: [[19224, 3024], [22248, 3024], [25272, 3024], [28296, 3024]],
  flip: [[31320, 2160], [33480, 1512], [34992, 2160]],
  shuffle: [[37152, 4968], [42120, 6264], [48384, 5184], [53568, 3888]],
  tokenDown: [[57456, 1080], [58536, 1296], [59832, 1512], [61344, 1296]],
  tokenUp: [[62640, 1512], [64152, 2160], [66312, 1080]],
  hp: [[67392, 1080], [68472, 1080], [69552, 1080], [70632, 864], [71496, 1080]],
  die: [[72576, 2376], [74952, 3240], [78192, 3456], [81648, 2376]],
  dice: [[84024, 3024], [87048, 2160], [89208, 3240]],
};
