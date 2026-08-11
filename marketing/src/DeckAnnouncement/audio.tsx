import { Audio } from "@remotion/media";
import { Fragment } from "react";
import { interpolate, Sequence, staticFile } from "remotion";
import type { PromoTimeline } from "./timeline";

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

/** Committed tracks — Juhani Junkala's 5 Chiptunes (Action), CC0. */
export const MUSIC_TRACKS = ["level-1", "level-2", "level-3"] as const;
export type MusicTrack = (typeof MUSIC_TRACKS)[number];

/** Level 1 is the driving character-select-y one; the default for every deck. */
export const DEFAULT_MUSIC_TRACK: MusicTrack = "level-1";

// ---- music bed ----
// The tracks are mastered hot (~-7 LUFS) and the SFX peak near 0dBFS, so the
// bed sits low and dips further under each hit.
const MUSIC_BASE = 0.2;
const MUSIC_FADE_IN = 24;
const DUCK_DEPTH = 0.5;
const DUCK_IN = 3;
const DUCK_OUT = 20;

// ---- cold open (frames from scenes/ColdOpen.tsx) ----
const NAME_SLAM = 48; // nameRise starts: the deck name comes up
// riser.wav is 0.54s; slowed it runs ~27f and is deeper, so it starts on the
// cardback turn and tops out exactly on the slam
const RISER_RATE = 0.6;
const RISER_SECONDS = 0.54;
const RISER_LENGTH = Math.round((RISER_SECONDS * 30) / RISER_RATE);
const QUOTE_IN = 62; // quoteIn fade begins

// ---- niche (frames from scenes/Niche.tsx) ----
const HEADLINE_IN = 0; // headline spring
const PANEL_IN = 26; // ability panel spring

// ---- featured cards (frames from scenes/HowItPlays.tsx, per card) ----
const CARD_LAND = 13; // the enter spring has all but settled
const CARD_STATS = 22; // the value/boost line under the caption reads in

// ---- cta (frames from scenes/CallToAction.tsx) ----
const STAT_CHIPS = [0, 8, 16]; // StatChip delays
const URL_IN = 30; // ctaIn spring
const OUTRO_AT = 118; // the cardback takes the frame
const JINGLE_AT = OUTRO_AT + 5;
/** Music is gone by the time the sting lands — the jingle buttons the video. */
const MUSIC_FADE_OUT_AT = 44;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** One SFX hit. No `durationInFrames`: the file ends when it ends. */
const Cue: React.FC<{
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
const duckAmount = (frame: number, hits: number[]) =>
  hits.reduce(
    (deepest, hit) =>
      Math.max(
        deepest,
        interpolate(frame, [hit - DUCK_IN, hit, hit + DUCK_OUT], [0, 1, 0], {
          ...clamp,
        }),
      ),
    0,
  );

const musicVolume = (
  frame: number,
  timeline: PromoTimeline,
  hits: number[],
) => {
  const fadeIn = interpolate(frame, [0, MUSIC_FADE_IN], [0, 1], { ...clamp });
  const fadeOut = interpolate(
    frame,
    [timeline.cta.from + MUSIC_FADE_OUT_AT, timeline.cta.from + OUTRO_AT],
    [1, 0],
    { ...clamp },
  );
  return (
    MUSIC_BASE * fadeIn * fadeOut * (1 - DUCK_DEPTH * duckAmount(frame, hits))
  );
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
      {/* The bed runs the whole video. `loop` only matters if a deck ever
          outruns the 72s track — it can't today, and it stays correct if it does. */}
      <Audio
        src={staticFile(`audio/music/junkala-${musicTrack}.mp3`)}
        loop
        // the fade/duck curve is in absolute frames, so it must not restart
        // with the loop
        loopVolumeCurveBehavior="extend"
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
