/**
 * DeckTeaser's flourish choreography. Pure — `scripts/check-flourish.mjs`
 * imports it. Every burst rides a frame the audio also fires on.
 */
import { CARD_ASPECT, FRONT_PLACE } from "../BonusShowcase/layout";
import { CUE as BEAT_CUE } from "../BonusShowcase/timeline";
import { CUE as DECK_CUE } from "../DeckAnnouncement/timeline";
import { SLAM_ANCHOR } from "../DeckAnnouncement/particles";
import {
  type Burst,
  curve,
  HEIGHT,
  PUFF_FRAMES,
  SHIMMER_FRAMES,
  SPARK_FRAMES,
  WIDTH,
} from "../shared/particles";
import { flashPlace, PAYOFF_TARGET } from "./layout";
import {
  FLASH,
  FLASH_CUE,
  PAYOFF_CUE,
  type Segment,
  type TeaserTimeline,
} from "./timeline";

export type TeaserCues = {
  nameSlam: number;
  stamps: number[];
  flipLands: number[];
  flashLands: number[];
  hit: number;
  sting: number;
};

const of = <K extends Segment["kind"]>(timeline: TeaserTimeline, kind: K) =>
  timeline.segments.filter(
    (segment): segment is Extract<Segment, { kind: K }> =>
      segment.kind === kind,
  );

export const teaserCues = (timeline: TeaserTimeline): TeaserCues => {
  const rewards = of(timeline, "reward");
  return {
    nameSlam: of(timeline, "cold")[0].from + DECK_CUE.nameSlam,
    stamps: rewards.map((segment) => segment.from + BEAT_CUE.stamp),
    flipLands: rewards.map((segment) => segment.from + BEAT_CUE.flipLand),
    flashLands: of(timeline, "montage").flatMap((segment) =>
      segment.pairs.map(
        (_, n) => segment.from + n * FLASH + FLASH_CUE.flipLand,
      ),
    ),
    hit: of(timeline, "payoff")[0].from + PAYOFF_CUE.hit,
    sting: of(timeline, "cta")[0].from + DECK_CUE.ctaSting,
  };
};

/** Full under the hero and the payoff, backed off under every played card,
 * goal and caption. */
export const ambientDim = (frame: number, timeline: TeaserTimeline): number => {
  const cold = of(timeline, "cold")[0];
  const payoff = of(timeline, "payoff")[0];
  const cta = of(timeline, "cta")[0];
  return curve(frame, [
    [cold.from, 1],
    [cold.from + cold.duration - 10, 0.8],
    [cold.from + cold.duration + 10, 0.5],
    [payoff.from, 0.5],
    [payoff.from + PAYOFF_CUE.hit, 0.85],
    [cta.from, 0.6],
    [cta.from + DECK_CUE.ctaOutro, 1],
  ]);
};

export const burstsFor = (timeline: TeaserTimeline): Burst[] => {
  const cues = teaserCues(timeline);
  const montagePairs = of(timeline, "montage").flatMap((s) => s.pairs);
  const count = timeline.slots.length;
  return [
    {
      kind: "spark",
      at: cues.nameSlam,
      duration: SPARK_FRAMES,
      x: SLAM_ANCHOR.x,
      y: SLAM_ANCHOR.y,
      seed: "name",
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
      y: FRONT_PLACE.y + (FRONT_PLACE.w * CARD_ASPECT) / 2,
      seed: `flip-${index}`,
    })),
    ...cues.flashLands.map((at, index) => {
      const place = flashPlace(montagePairs[index], count);
      return {
        kind: "spark" as const,
        at,
        duration: SPARK_FRAMES,
        x: place.x,
        y: place.y,
        seed: `flash-${index}`,
      };
    }),
    {
      kind: "spark",
      at: cues.hit,
      duration: SPARK_FRAMES,
      x: PAYOFF_TARGET.x,
      y: PAYOFF_TARGET.y,
      seed: "hit",
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
