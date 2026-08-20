/**
 * DeckAnnouncement's own flourish choreography: which frames its bursts fire
 * on, and how far the ambient field backs off under each beat. The maths they
 * are built from is generic and lives in `../shared/particles`.
 *
 * Pure — no React, no Remotion — so `scripts/check-flourish.mjs` can import it
 * and prove a burst is silent on every frame that is not a cue frame.
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
import { CUE, type PromoTimeline } from "./timeline";

export * from "../shared/particles";

/**
 * How loud the ambient field is allowed to be, beat by beat. It backs almost
 * all the way off under the beats the viewer is READING (the quote, the
 * tagline + ability panel, each card's caption) and only opens up once the
 * closing cardback has taken the frame.
 */
export const ambientDim = (
  frame: number,
  timeline: PromoTimeline,
  hasQuote: boolean,
): number => {
  const { coldOpen, niche, cards, cta } = timeline;
  const quoteAt = coldOpen.from + CUE.quoteIn;
  return curve(frame, [
    [coldOpen.from, 1],
    ...(hasQuote
      ? ([
          [quoteAt - 10, 1],
          [quoteAt + 16, 0.45],
        ] as [number, number][])
      : []),
    [niche.from - 8, hasQuote ? 0.45 : 1],
    [niche.from + CUE.nichePanel, 0.3],
    [cards.from, 0.55],
    // holds flat under every caption, and only opens up as the CTA arrives
    [cta.from - 24, 0.55],
    [cta.from, 0.7],
    [cta.from + CUE.ctaOutro, 1],
  ]);
};

/** Where the deck name slams up in ColdOpen — the sparks come off that line. */
export const SLAM_ANCHOR = { x: WIDTH / 2, y: 690 };

/**
 * Every burst in one render, each pinned to a cue frame from `timeline.ts`.
 * `cardAnchors` are the fan slots the cards land in (HowItPlays owns that
 * geometry), so a puff sits under the card that just thocked down.
 */
export const burstsFor = (
  timeline: PromoTimeline,
  cardAnchors: { x: number; y: number }[],
): Burst[] => {
  const { coldOpen, cards, cta } = timeline;
  return [
    {
      kind: "spark",
      at: coldOpen.from + CUE.nameSlam,
      duration: SPARK_FRAMES,
      x: SLAM_ANCHOR.x,
      y: SLAM_ANCHOR.y,
      seed: "slam",
    },
    ...cardAnchors.map((anchor, index) => ({
      kind: "puff" as const,
      at: cards.from + index * cards.perCard + CUE.cardLand,
      duration: PUFF_FRAMES,
      x: anchor.x,
      y: anchor.y,
      seed: `card-${index}`,
    })),
    {
      kind: "shimmer",
      at: cta.from + CUE.ctaSting,
      duration: SHIMMER_FRAMES,
      x: WIDTH / 2,
      y: HEIGHT / 2,
      seed: "sting",
    },
  ];
};
