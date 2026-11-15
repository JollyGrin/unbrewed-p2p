/**
 * The showcase's frame budget, in one place. The Sequences (`index.tsx`), the
 * audio cues (`audio.tsx`), the particle bursts (`flourish.ts`) and the
 * persistent card track (`scenes/Track.tsx`) are all built from this, so
 * retiming a beat retimes its sound, its burst and its card together.
 *
 * Pure — no React, no Remotion — so `scripts/check-flourish.mjs` can import it.
 */

export const FPS = 30;

export const INTRO = 135;
/** One front→back card: read the goal, complete it, flip, play the reward. */
export const BEAT = 180;
export const OUTRO = 135;

/** 5 pairs → 1170f (39s); 3 pairs → 810f (27s). */
export const showcaseDuration = (count: number) => INTRO + BEAT * count + OUTRO;

export type Beat = { from: number; duration: number };

export type ShowcaseTimeline = {
  intro: Beat;
  beats: Beat[];
  outro: Beat;
  total: number;
};

export const showcaseTimeline = (count: number): ShowcaseTimeline => ({
  intro: { from: 0, duration: INTRO },
  beats: Array.from({ length: count }, (_, index) => ({
    from: INTRO + index * BEAT,
    duration: BEAT,
  })),
  outro: { from: INTRO + count * BEAT, duration: OUTRO },
  total: showcaseDuration(count),
});

/**
 * Scene-internal animation frames. A cue is `beat.from + CUE.<name>`; the
 * scenes animate on these and the sound + bursts fire off them.
 */
export const CUE = {
  /** Intro: the rule-card title slams up */
  titleSlam: 24,
  /** Intro: the intro line reads in */
  introLine: 40,
  /** Intro: first card dealt into the row; each next one DEAL_GAP later */
  dealFirst: 52,
  dealGap: 8,
  /** Intro: the dealt row shrinks up into the track */
  toTrack: 106,
  trackLanded: 128,

  /** Beat: the card leaves its track slot */
  cardOut: 0,
  /** Beat: the card has arrived, the front's title + goal read in */
  frontIn: 14,
  /** Beat: the COMPLETE stamp slams on */
  stamp: 70,
  /** Beat: the flip */
  flip: 80,
  flipLand: 96,
  /** Beat: the card has slid aside, the caption reads in */
  settle: 100,
  /** Beat: the reward's vignette starts */
  effect: 104,
  /** Beat: the gameplay still pops in */
  still: 122,
  /** Beat: the card heads home to its track slot, now reward-side up */
  cardHome: 162,

  /** Outro: the hero name slams */
  outroName: 30,
  /** Outro: the url lands */
  outroUrl: 52,
  /** Outro: the 8-bit sting that buttons the video */
  sting: 100,
} as const;

export const FLIP_FRAMES = CUE.flipLand - CUE.flip;
