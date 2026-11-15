import { interpolate } from "remotion";
import {
  clampBoth,
  Cue,
  DEFAULT_MUSIC_TRACK,
  duckedGain,
  MUSIC_BASE,
  MUSIC_FADE_IN,
  MusicBed,
  type MusicTrack,
} from "../shared/audio";
import { effectCues, type EffectParams } from "./effects";
import { showcaseCues } from "./flourish";
import { CUE, type ShowcaseTimeline } from "./timeline";

/**
 * The showcase's audio: the same CC0 chiptune bed and Kenney SFX the deck
 * promo uses (public/audio/LICENSES.md) — no new files. Every cue is a scene's
 * own animation frame from `timeline.ts` (or a vignette's, from
 * `effects.ts`), offset by its beat's start.
 */

// riser.wav is 0.54s; at 0.6x it runs ~27f and tops out on the title slam
const RISER_RATE = 0.6;
const RISER_LENGTH = Math.round((0.54 * 30) / RISER_RATE);
/** The bed is gone by the sting — the jingle buttons the video. */
const MUSIC_FADE_OUT_FROM = 40;

/**
 * One RewardBeat's sound, from the beat's first frame: out of the track, the
 * goal blip, the COMPLETE slam, the flip, the vignette's own cues, home. The
 * teaser plays RewardBeats too, so it mounts this as-is.
 */
export const RewardBeatCues: React.FC<{
  from: number;
  effect: EffectParams;
}> = ({ from, effect }) => (
  <>
    <Cue sfx="card-swish" from={from + CUE.cardOut} volume={0.5} />
    <Cue sfx="reveal-blip-low" from={from + CUE.frontIn} volume={0.3} />
    <Cue sfx="name-slam" from={from + CUE.stamp} volume={0.7} />
    <Cue sfx="slam-sub" from={from + CUE.stamp} volume={0.35} />
    <Cue sfx="card-swish" from={from + CUE.flip} volume={0.5} />
    <Cue sfx="boost-coin" from={from + CUE.flipLand} volume={0.4} />
    {effectCues(effect).map((cue, at) => (
      <Cue
        key={at}
        sfx={cue.sfx}
        from={from + CUE.effect + cue.at}
        volume={cue.volume}
        playbackRate={cue.playbackRate}
      />
    ))}
    <Cue sfx="card-swish" from={from + CUE.cardHome} volume={0.3} />
  </>
);

export const ShowcaseAudio: React.FC<{
  timeline: ShowcaseTimeline;
  effects: EffectParams[];
  musicTrack?: MusicTrack;
}> = ({ timeline, effects, musicTrack = DEFAULT_MUSIC_TRACK }) => {
  const { intro, beats, outro } = timeline;
  const cues = showcaseCues(timeline);
  const hits = [cues.titleSlam, ...cues.stamps, cues.outroName, cues.sting];

  const volume = (frame: number) =>
    MUSIC_BASE *
    interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], clampBoth) *
    interpolate(
      frame,
      [outro.from + MUSIC_FADE_OUT_FROM, outro.from + CUE.sting],
      [1, 0],
      clampBoth,
    ) *
    duckedGain(frame, hits);

  return (
    <>
      <MusicBed track={musicTrack} volume={volume} />

      {/* intro — riser into the title slam, a blip on the line, a thock per deal */}
      <Cue
        sfx="riser"
        from={cues.titleSlam - RISER_LENGTH}
        playbackRate={RISER_RATE}
        volume={0.8}
      />
      <Cue sfx="name-slam" from={cues.titleSlam} volume={0.9} />
      <Cue sfx="slam-sub" from={cues.titleSlam} volume={0.45} />
      <Cue sfx="reveal-blip" from={intro.from + CUE.introLine} volume={0.4} />
      {beats.map((_, index) => (
        <Cue
          key={index}
          sfx="card-thock"
          from={intro.from + CUE.dealFirst + index * CUE.dealGap + 7}
          volume={0.45}
        />
      ))}
      <Cue sfx="card-swish" from={intro.from + CUE.toTrack} volume={0.4} />

      {/* each pair — out of the track, goal blip, COMPLETE slam, flip, the reward */}
      {beats.map((beat, index) => (
        <RewardBeatCues key={index} from={beat.from} effect={effects[index]} />
      ))}

      {/* outro — rewards line up, the name slams, the url, the sting */}
      <Cue sfx="card-swish" from={outro.from} volume={0.45} />
      <Cue sfx="name-slam" from={cues.outroName} volume={0.9} />
      <Cue sfx="slam-sub" from={cues.outroName} volume={0.45} />
      <Cue sfx="cta-confirm" from={outro.from + CUE.outroUrl} volume={0.45} />
      <Cue sfx="jingle-sting" from={cues.sting} volume={0.75} />
    </>
  );
};
