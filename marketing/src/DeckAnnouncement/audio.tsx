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
import { CUE, type PromoTimeline } from "./timeline";

export {
  DEFAULT_MUSIC_TRACK,
  MUSIC_TRACKS,
  type MusicTrack,
} from "../shared/audio";

/**
 * The promo's audio layer: a chiptune bed under retro SFX punched in on the
 * beats the visuals already animate on. Every cue frame below is the scene's
 * OWN animation frame (the comments name it), offset by the beat's start from
 * `promoTimeline` — so moving a scene moves its sound with it.
 *
 * Every file under public/audio is CC0 (see public/audio/LICENSES.md). Nothing
 * that needs attribution or a "free for personal use" grant goes in here: the
 * videos are posted publicly and forever, and we keep zero licence bookkeeping.
 */

// ---- cue frames ----
// Every beat-internal frame lives in timeline.ts (`CUE`), because the particle
// flourish fires off the same numbers — see Flourish.tsx.
const NAME_SLAM = CUE.nameSlam;
// riser.wav is 0.54s; slowed it runs ~27f and is deeper, so it starts on the
// cardback turn and tops out exactly on the slam
const RISER_RATE = 0.6;
const RISER_SECONDS = 0.54;
const RISER_LENGTH = Math.round((RISER_SECONDS * 30) / RISER_RATE);
const QUOTE_IN = CUE.quoteIn;

const HEADLINE_IN = CUE.nicheHeadline;
const PANEL_IN = CUE.nichePanel;

const CARD_LAND = CUE.cardLand;
const CARD_STATS = CUE.cardStats;

const STAT_CHIPS = CUE.statChips;
const URL_IN = CUE.ctaUrl;
const OUTRO_AT = CUE.ctaOutro;
const JINGLE_AT = CUE.ctaSting;
/** Music is gone by the time the sting lands — the jingle buttons the video. */
const MUSIC_FADE_OUT_AT = 44;

const musicVolume = (
  frame: number,
  timeline: PromoTimeline,
  hits: number[],
) => {
  const fadeIn = interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], {
    ...clampBoth,
  });
  const fadeOut = interpolate(
    frame,
    [timeline.cta.from + MUSIC_FADE_OUT_AT, timeline.cta.from + OUTRO_AT],
    [1, 0],
    { ...clampBoth },
  );
  return MUSIC_BASE * fadeIn * fadeOut * duckedGain(frame, hits);
};

export const PromoAudio: React.FC<{
  timeline: PromoTimeline;
  hasQuote: boolean;
  musicTrack?: MusicTrack;
}> = ({ timeline, hasQuote, musicTrack = DEFAULT_MUSIC_TRACK }) => {
  const { coldOpen, niche, cards, cta } = timeline;
  const cardAt = (index: number) => cards.from + index * cards.perCard;
  const indices = Array.from({ length: cards.count }, (_, index) => index);

  // what the bed ducks under: the name slam, each card landing, the last hit
  const hits = [
    coldOpen.from + NAME_SLAM,
    ...indices.map((index) => cardAt(index) + CARD_LAND),
    cta.from + OUTRO_AT,
  ];

  return (
    <>
      <MusicBed
        track={musicTrack}
        volume={(frame) => musicVolume(frame, timeline, hits)}
      />

      {/* 1. cold open — riser into the name slam */}
      <Cue
        sfx="riser"
        from={coldOpen.from + NAME_SLAM - RISER_LENGTH}
        playbackRate={RISER_RATE}
        volume={0.85}
      />
      <Cue sfx="name-slam" from={coldOpen.from + NAME_SLAM} volume={0.9} />
      <Cue sfx="slam-sub" from={coldOpen.from + NAME_SLAM} volume={0.45} />
      {hasQuote ? (
        <Cue
          sfx="reveal-blip-low"
          from={coldOpen.from + QUOTE_IN}
          volume={0.3}
        />
      ) : null}

      {/* 2. tagline + special ability — one blip per reveal, not per word */}
      <Cue sfx="reveal-blip" from={niche.from + HEADLINE_IN} volume={0.4} />
      <Cue sfx="reveal-blip-low" from={niche.from + PANEL_IN} volume={0.35} />

      {/* 3. featured cards — swish in, thock down, coin on the boost line */}
      {indices.map((index) => (
        <Fragment key={index}>
          <Cue sfx="card-swish" from={cardAt(index)} volume={0.55} />
          <Cue sfx="card-thock" from={cardAt(index) + CARD_LAND} volume={0.8} />
          <Cue
            sfx="boost-coin"
            from={cardAt(index) + CARD_STATS}
            volume={0.35}
          />
        </Fragment>
      ))}

      {/* 4. cta — statline ticks, the url, then the closing hit + sting */}
      {STAT_CHIPS.map((delay) => (
        <Cue key={delay} sfx="stat-tick" from={cta.from + delay} volume={0.5} />
      ))}
      <Cue sfx="cta-confirm" from={cta.from + URL_IN} volume={0.45} />
      <Cue sfx="name-slam" from={cta.from + OUTRO_AT} volume={0.9} />
      <Cue sfx="slam-sub" from={cta.from + OUTRO_AT} volume={0.45} />
      <Cue sfx="jingle-sting" from={cta.from + JINGLE_AT} volume={0.75} />
    </>
  );
};
