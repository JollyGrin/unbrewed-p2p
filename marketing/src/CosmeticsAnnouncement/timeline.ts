/**
 * The cosmetics ad's frame budget, in one place. The visual Sequences
 * (`index.tsx`), the audio cues (`audio.tsx`) and the particle bursts
 * (`flourish.ts`) are all built from this, so retiming a beat retimes its
 * sound and its burst together.
 *
 * Unlike `DeckAnnouncement`, this is a FIXED storyboard: one video about one
 * shipped feature, so the beats are constants rather than a function of props.
 * 1170 frames = 39.0s at 30fps, the top of the 20–40s house brief.
 */

export const FPS = 30;

export type Beat = { from: number; duration: number };

/** Beat lengths, in order. The order here IS the order on screen. */
export const BEATS = [
  /** one card alone, a beat of stillness, then the bronze rim ignites */
  ["hook", 120],
  /** the money shot: the same card steps bronze → silver → gold → iridescent */
  ["ladder", 260],
  /** where the points come from, and what an upgrade costs */
  ["earn", 160],
  /** a fanned hand: upgrade a card once, every copy wears it */
  ["everyCopy", 150],
  /** board vignette: the fighter token climbs its own ladder */
  ["token", 180],
  /** combat reveal: their base card against your iridescent one */
  ["table", 150],
  /** end card */
  ["cta", 150],
] as const satisfies readonly (readonly [string, number])[];

export type BeatName = (typeof BEATS)[number][0];

export type CosmeticsTimeline = Record<BeatName, Beat> & { total: number };

export const cosmeticsTimeline = (): CosmeticsTimeline => {
  let at = 0;
  const beats = {} as Record<BeatName, Beat>;
  for (const [name, duration] of BEATS) {
    beats[name] = { from: at, duration };
    at += duration;
  }
  return { ...beats, total: at };
};

export const totalDuration = () => cosmeticsTimeline().total;

/**
 * Beat-internal cue frames — each one is its scene's OWN animation frame, so a
 * cue is `beat.from + CUE.<name>`. Both the audio layer and the flourish are
 * built from these; move a beat inside a scene and its cue moves here too.
 */
/**
 * Widened to `readonly number[]` rather than left as literal tuples: these are
 * frame numbers a scene indexes with a computed rung, not a fixed shape.
 */
const LADDER_STEPS: readonly number[] = [0, 60, 118, 176];
const HAND_DEAL: readonly number[] = [6, 22, 38, 54, 70];
const TOKEN_TIERS: readonly number[] = [40, 74, 108, 142];

export const CUE = {
  /** Hook: the card has settled and the bronze rim catches */
  hookIgnite: 40,
  /** Hook: the headline rises under it */
  hookLine: 64,

  /**
   * Ladder: one frame per rung. Rung 0 is bronze — already lit when the scene
   * cuts in, so it reads as a recap rather than a second ignition — and the
   * last rung holds for the rest of the beat (84f) because iridescent is the
   * thing the whole ad is selling.
   */
  ladderSteps: LADDER_STEPS,

  /** Earn: the /collection header springs in */
  earnPanel: 6,
  /** Earn: the points counter starts and stops ticking */
  earnCountFrom: 22,
  earnCountTo: 92,
  /** Earn: the upgrade is confirmed */
  earnBuy: 112,

  /** EveryCopy: the hand deals, one card per frame listed */
  handDeal: HAND_DEAL,
  /** EveryCopy: every copy of the upgraded set rims at once */
  copiesRim: 104,

  /** Token: the board vignette settles */
  tokenIn: 8,
  /** Token: each threshold the progress bar crosses */
  tokenTiers: TOKEN_TIERS,

  /** Table: their card lands, then yours */
  tableThem: 22,
  tableYou: 48,
  /** Table: the line reads in */
  tableLine: 74,

  /** CTA: the wordmark takes the frame */
  ctaMark: 4,
  /** CTA: the url lands */
  ctaUrl: 30,
  /** CTA: the closing line */
  ctaLine: 54,
  /** CTA: the 8-bit sting that buttons the video */
  ctaSting: 96,
} as const;
