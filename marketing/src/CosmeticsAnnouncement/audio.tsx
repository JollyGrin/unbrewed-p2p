import { Fragment } from "react";
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
import { cosmeticsCues } from "./flourish";
import { CUE, type CosmeticsTimeline } from "./timeline";

/**
 * The ad's audio layer: the same chiptune bed and Kenney SFX vocabulary the
 * deck promos use, punched in on the frames the visuals already animate on.
 * Every cue is `beat.from + CUE.<name>`, so retiming a beat in `timeline.ts`
 * retimes its sound and its particle burst together.
 *
 * All CC0 — see public/audio/LICENSES.md. Nothing needing attribution.
 */

// riser.wav is 0.54s; slowed it runs ~27f and is deeper, so it starts before
// the ignition and tops out exactly on it
const RISER_RATE = 0.6;
const RISER_LENGTH = Math.round((0.54 * 30) / RISER_RATE);

/** Music is gone by the time the sting lands — the jingle buttons the video. */
const MUSIC_FADE_OUT_AT = 40;

const musicVolume = (
  frame: number,
  timeline: CosmeticsTimeline,
  hits: number[],
) => {
  const fadeIn = interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], {
    ...clampBoth,
  });
  const fadeOut = interpolate(
    frame,
    [timeline.cta.from + MUSIC_FADE_OUT_AT, timeline.cta.from + CUE.ctaSting],
    [1, 0],
    { ...clampBoth },
  );
  return MUSIC_BASE * fadeIn * fadeOut * duckedGain(frame, hits);
};

export const CosmeticsAudio: React.FC<{
  timeline: CosmeticsTimeline;
  musicTrack?: MusicTrack;
}> = ({ timeline, musicTrack = DEFAULT_MUSIC_TRACK }) => {
  const { earn, everyCopy, cta } = timeline;
  const cues = cosmeticsCues(timeline);

  // what the bed ducks under: the ignition, the top of the ladder, the moment
  // every copy rims, both slams on the table, and the closing hit
  const hits = [
    cues.ignite,
    cues.rungs[3],
    cues.copies,
    ...cues.tableSlams,
    cta.from + CUE.ctaUrl,
  ];

  return (
    <>
      <MusicBed
        track={musicTrack}
        volume={(frame) => musicVolume(frame, timeline, hits)}
      />

      {/* 1. hook — a riser into the ignition, then the line */}
      <Cue
        sfx="riser"
        from={cues.ignite - RISER_LENGTH}
        playbackRate={RISER_RATE}
        volume={0.8}
      />
      <Cue sfx="name-slam" from={cues.ignite} volume={0.75} />
      <Cue sfx="slam-sub" from={cues.ignite} volume={0.42} />
      <Cue
        sfx="reveal-blip-low"
        from={timeline.hook.from + CUE.hookLine}
        volume={0.32}
      />

      {/* 2. the ladder — a coin per rung, the last one landing on a slam */}
      {cues.rungs.map((at, rung) => (
        <Fragment key={at}>
          <Cue sfx="boost-coin" from={at} volume={0.34 + 0.08 * rung} />
          {rung === 3 ? (
            <>
              <Cue sfx="name-slam" from={at} volume={0.7} />
              <Cue sfx="slam-sub" from={at} volume={0.4} />
            </>
          ) : null}
        </Fragment>
      ))}

      {/* 3a. earn — the panel, the counter ticking, the purchase */}
      <Cue sfx="reveal-blip" from={earn.from + CUE.earnPanel} volume={0.35} />
      {[0, 18, 36, 54].map((offset) => (
        <Cue
          key={offset}
          sfx="stat-tick"
          from={earn.from + CUE.earnCountFrom + offset}
          volume={0.34}
        />
      ))}
      <Cue sfx="cta-confirm" from={earn.from + CUE.earnBuy} volume={0.5} />

      {/* 3b. every copy — the hand deals, then all three rim at once */}
      {CUE.handDeal.map((at) => (
        <Fragment key={at}>
          <Cue sfx="card-swish" from={everyCopy.from + at} volume={0.4} />
          <Cue sfx="card-thock" from={everyCopy.from + at + 12} volume={0.5} />
        </Fragment>
      ))}
      <Cue sfx="boost-coin" from={cues.copies} volume={0.5} />
      <Cue sfx="reveal-blip" from={cues.copies + 6} volume={0.3} />

      {/* 4. the token — one tick per threshold, a coin as each rim lands */}
      {cues.tokenTiers.map((at) => (
        <Fragment key={at}>
          <Cue sfx="stat-tick" from={at - 6} volume={0.34} />
          <Cue sfx="boost-coin" from={at} volume={0.32} />
        </Fragment>
      ))}

      {/* 5. across the table — two cards down, the second one lands heavier */}
      <Cue sfx="card-swish" from={cues.tableSlams[0] - 8} volume={0.45} />
      <Cue sfx="card-thock" from={cues.tableSlams[0]} volume={0.7} />
      <Cue sfx="card-swish" from={cues.tableSlams[1] - 8} volume={0.45} />
      <Cue sfx="card-thock" from={cues.tableSlams[1]} volume={0.85} />
      <Cue sfx="slam-sub" from={cues.tableSlams[1]} volume={0.4} />

      {/* 6. end card — the url confirms, then the closing hit + sting */}
      <Cue sfx="cta-confirm" from={cta.from + CUE.ctaUrl} volume={0.5} />
      <Cue sfx="reveal-blip-low" from={cta.from + CUE.ctaLine} volume={0.3} />
      <Cue sfx="name-slam" from={cues.sting - 6} volume={0.8} />
      <Cue sfx="slam-sub" from={cues.sting - 6} volume={0.42} />
      <Cue sfx="jingle-sting" from={cues.sting} volume={0.75} />
    </>
  );
};
