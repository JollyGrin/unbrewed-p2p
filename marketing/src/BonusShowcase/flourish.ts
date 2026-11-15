/**
 * BonusShowcase's own flourish choreography: which frames burst, and how far
 * the ambient field backs off beat by beat. Built from `timeline.ts` and
 * `layout.ts`, so a burst rides the same frame as its sound and sits where its
 * card is. Pure — `scripts/check-flourish.mjs` imports it.
 */

import {
  type Burst,
  curve,
  HEIGHT,
  PUFF_FRAMES,
  SHIMMER_FRAMES,
  SPARK_FRAMES,
  WIDTH,
} from "../shared/particles";
import { CARD_ASPECT, FRONT_PLACE } from "./layout";
import { CUE, type ShowcaseTimeline } from "./timeline";

export type ShowcaseCues = {
  titleSlam: number;
  stamps: number[];
  flipLands: number[];
  outroName: number;
  sting: number;
};

export const showcaseCues = (timeline: ShowcaseTimeline): ShowcaseCues => ({
  titleSlam: timeline.intro.from + CUE.titleSlam,
  stamps: timeline.beats.map((beat) => beat.from + CUE.stamp),
  flipLands: timeline.beats.map((beat) => beat.from + CUE.flipLand),
  outroName: timeline.outro.from + CUE.outroName,
  sting: timeline.outro.from + CUE.sting,
});

/**
 * Loud on the intro and the outro, backed right off while a front's goal and
 * a reward's caption are on screen.
 */
export const ambientDim = (
  frame: number,
  timeline: ShowcaseTimeline,
): number => {
  const { intro, beats, outro } = timeline;
  const first = beats[0];
  return curve(frame, [
    [intro.from, 1],
    [intro.from + CUE.introLine, 0.7],
    [first.from, 0.5],
    // holds under every goal and caption, opens up for the close
    [outro.from, 0.5],
    [outro.from + CUE.outroName, 0.8],
    [outro.from + CUE.sting, 1],
  ]);
};

/** Sparks off the title, a burst off every COMPLETE stamp, a puff under every
 * flip, a shimmer over the closing sting. */
export const burstsFor = (timeline: ShowcaseTimeline): Burst[] => {
  const cues = showcaseCues(timeline);
  return [
    {
      kind: "spark",
      at: cues.titleSlam,
      duration: SPARK_FRAMES,
      x: WIDTH / 2,
      y: 420,
      seed: "title",
    },
    ...cues.stamps.map((at, index) => ({
      kind: "spark" as const,
      at,
      duration: SPARK_FRAMES,
      x: FRONT_PLACE.x,
      y: FRONT_PLACE.y,
      seed: `stamp-${index}`,
    })),
    ...cues.flipLands.map((at, index) => ({
      kind: "puff" as const,
      at,
      duration: PUFF_FRAMES,
      x: FRONT_PLACE.x,
      // under the card's bottom edge, where it lands from the flip
      y: FRONT_PLACE.y + (FRONT_PLACE.w * CARD_ASPECT) / 2,
      seed: `flip-${index}`,
    })),
    {
      kind: "spark",
      at: cues.outroName,
      duration: SPARK_FRAMES,
      x: WIDTH / 2,
      y: 700,
      seed: "outro-name",
    },
    {
      kind: "shimmer",
      at: cues.sting,
      duration: SHIMMER_FRAMES,
      x: WIDTH / 2,
      y: HEIGHT / 2,
      seed: "sting",
    },
  ];
};
