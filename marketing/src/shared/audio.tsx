import { Audio } from "@remotion/media";
import { interpolate, Sequence, staticFile } from "remotion";

/**
 * The audio primitives every composition scores with: the committed CC0
 * chiptune beds, one-shot SFX cues, and the ducking maths that keeps the bed
 * out of the way of a hit.
 *
 * Every file under public/audio is CC0 (see public/audio/LICENSES.md). Nothing
 * that needs attribution or a "free for personal use" grant goes in here: the
 * videos are posted publicly and forever, and we keep zero licence bookkeeping.
 */

/** Committed tracks — Juhani Junkala's 5 Chiptunes (Action), CC0. */
export const MUSIC_TRACKS = ["level-1", "level-2", "level-3"] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];

/** Level 1 is the driving character-select-y one; the default everywhere. */
export const DEFAULT_MUSIC_TRACK: MusicTrack = "level-1";

// The tracks are mastered hot (~-7 LUFS) and the SFX peak near 0dBFS, so the
// bed sits low and dips further under each hit.
export const MUSIC_BASE = 0.2;
export const MUSIC_FADE_IN = 24;
const DUCK_DEPTH = 0.5;
const DUCK_IN = 3;
const DUCK_OUT = 20;

export const clampBoth = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** One SFX hit. No `durationInFrames`: the file ends when it ends. */
export const Cue: React.FC<{
  sfx: string;
  from: number;
  volume?: number;
  playbackRate?: number;
}> = ({ sfx, from, volume = 1, playbackRate }) => (
  <Sequence from={from} layout="none" name={`sfx: ${sfx} @${from}`}>
    <Audio
      src={staticFile(`audio/sfx/${sfx}.wav`)}
      volume={volume}
      playbackRate={playbackRate}
    />
  </Sequence>
);

/** Deepest dip of any hit that is close to this frame. */
export const duckAmount = (frame: number, hits: number[]) =>
  hits.reduce(
    (deepest, hit) =>
      Math.max(
        deepest,
        interpolate(frame, [hit - DUCK_IN, hit, hit + DUCK_OUT], [0, 1, 0], {
          ...clampBoth,
        }),
      ),
    0,
  );

/** How much a hit near `frame` pulls the bed down: 1 = untouched. */
export const duckedGain = (frame: number, hits: number[]) =>
  1 - DUCK_DEPTH * duckAmount(frame, hits);

/**
 * The chiptune bed. `loop` only matters if a composition ever outruns the ~73s
 * track — none does today, and it stays correct if one does. The fade/duck
 * curve is in absolute frames, so it must not restart with the loop.
 */
export const MusicBed: React.FC<{
  track: MusicTrack;
  volume: (frame: number) => number;
}> = ({ track, volume }) => (
  <Audio
    src={staticFile(`audio/music/junkala-${track}.mp3`)}
    loop
    loopVolumeCurveBehavior="extend"
    volume={volume}
  />
);
