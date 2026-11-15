import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CARD_ASPECT, trackSlot } from "../../BonusShowcase/layout";
import { mixPlace } from "../../BonusShowcase/scenes/Track";
import { clamp, EASE, FlipCard } from "../../BonusShowcase/ui";
import { alpha, type Palette } from "../../shared/color";
import type { BonusDeck } from "../../shared/deck";
import { PAYOFF_CUE, type TeaserTimeline } from "../timeline";

/**
 * The side deck along the top, across the whole teaser: the throughline. It
 * deals in on the first played card, the ACTIVE adventure (the next one not
 * yet completed) breathes, a card leaves its slot while its beat or flash
 * draws it and comes home reward-side up, and on the payoff every completed
 * reward pulses as it adds to the attack.
 */
export const TeaserTrack: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  timeline: TeaserTimeline;
}> = ({ deck, palette, timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = deck.pairs.length;
  const payoff = timeline.segments.find((s) => s.kind === "payoff");
  const cta = timeline.segments.find((s) => s.kind === "cta");
  const leave = cta
    ? interpolate(frame, [cta.from, cta.from + 14], [1, 0], {
        ...clamp,
        easing: EASE,
      })
    : 1;
  const active = timeline.slots.findIndex((slot) => frame < slot.flippedAt);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: leave }}>
      {deck.pairs.map(({ front, back }, index) => {
        const slot = trackSlot(index, count);
        const timing = timeline.slots[index];
        const deal = spring({
          frame: frame - (timeline.dealAt + index * 5),
          fps,
          config: { damping: 15, stiffness: 150 },
        });
        if (deal <= 0) return null;
        const out = frame >= timing.out[0] && frame < timing.out[1];
        const h = slot.w * CARD_ASPECT;
        if (out) {
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: slot.x - slot.w / 2,
                top: slot.y - h / 2,
                width: slot.w,
                height: h,
                borderRadius: slot.w * 0.035,
                border: `3px dashed ${alpha(palette.ink, 0.5)}`,
              }}
            />
          );
        }
        const pulse = payoff
          ? interpolate(
              frame -
                (payoff.from +
                  PAYOFF_CUE.climbFrom +
                  index * PAYOFF_CUE.climbGap),
              [0, 3, 12],
              [0, 1, 0],
              clamp,
            )
          : 0;
        const breathe =
          index === active
            ? 0.5 + 0.5 * Math.sin((frame / 30) * Math.PI * 1.4)
            : 0;
        const place = mixPlace({ ...slot, y: -120 }, slot, deal);
        return (
          <FlipCard
            key={index}
            front={front}
            back={back}
            place={{ ...place, w: place.w * (1 + 0.16 * pulse) }}
            flip={frame >= timing.flippedAt ? 1 : 0}
            lift={pulse * 14}
            glow={
              index === active
                ? alpha(palette.accent, 0.35 + 0.45 * breathe)
                : pulse > 0
                  ? alpha(palette.accent, 0.9 * pulse)
                  : undefined
            }
          />
        );
      })}
    </div>
  );
};
