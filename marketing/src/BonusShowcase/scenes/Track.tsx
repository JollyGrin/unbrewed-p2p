import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { alpha, type Palette } from "../../shared/color";
import type { BonusDeck } from "../../shared/deck";
import {
  CARD_ASPECT,
  introSlot,
  outroSlot,
  type Place,
  trackSlot,
} from "../layout";
import { CUE, type ShowcaseTimeline } from "../timeline";
import { clamp, EASE, FlipCard } from "../ui";

export const mixPlace = (a: Place, b: Place, k: number): Place => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  w: a.w + (b.w - a.w) * k,
});

/**
 * The side deck as a row of cards that lives across the whole video, in
 * absolute frames. The intro deals the fronts into it; during a pair's beat
 * that slot is empty (the beat's own card is out playing), and it comes back
 * reward-side up; the outro lines the rewards up under the hero name. The
 * beat scenes start and end their card exactly on `trackSlot`, so the
 * hand-off between this layer and a beat has no visible seam.
 */
export const Track: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  timeline: ShowcaseTimeline;
}> = ({ deck, palette, timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = deck.pairs.length;
  const { intro, beats, outro } = timeline;

  const toTrack = interpolate(
    frame,
    [intro.from + CUE.toTrack, intro.from + CUE.trackLanded],
    [0, 1],
    { ...clamp, easing: EASE },
  );
  const toOutro = interpolate(frame, [outro.from, outro.from + 26], [0, 1], {
    ...clamp,
    easing: EASE,
  });
  const slotsVisible =
    interpolate(
      frame,
      [intro.from + CUE.trackLanded - 6, intro.from + CUE.trackLanded + 6],
      [0, 1],
      clamp,
    ) *
    (1 - toOutro);

  // the whole row fades with the closing scene
  const end = interpolate(
    frame,
    [timeline.total - 12, timeline.total],
    [1, 0],
    { ...clamp, easing: EASE },
  );

  return (
    <div style={{ position: "absolute", inset: 0, opacity: end }}>
      {deck.pairs.map(({ front, back }, index) => {
        const slot = trackSlot(index, count);
        const beat = beats[index];
        const out = frame >= beat.from && frame < beat.from + beat.duration;
        const done = frame >= beat.from + beat.duration;

        // the empty slot's outline, so the row reads as a track with gaps
        const outline = (
          <div
            key={`slot-${index}`}
            style={{
              position: "absolute",
              left: slot.x - slot.w / 2,
              top: slot.y - (slot.w * CARD_ASPECT) / 2,
              width: slot.w,
              height: slot.w * CARD_ASPECT,
              borderRadius: slot.w * 0.035,
              border: `3px dashed ${alpha(palette.ink, out ? 0.55 : 0.2)}`,
              opacity: slotsVisible,
            }}
          />
        );
        if (out) return outline;

        const deal = spring({
          frame: frame - (intro.from + CUE.dealFirst + index * CUE.dealGap),
          fps,
          config: { damping: 16, stiffness: 140 },
        });
        if (deal <= 0) return outline;

        const row = introSlot(index, count);
        const dealt = mixPlace({ ...row, y: 1300 }, row, deal);
        const resting = mixPlace(dealt, slot, toTrack);
        const place =
          frame >= outro.from
            ? mixPlace(slot, outroSlot(index, count), toOutro)
            : resting;
        return [
          outline,
          <FlipCard
            key={index}
            front={front}
            back={back}
            place={place}
            flip={done ? 1 : 0}
            tilt={
              interpolate(deal, [0, 1], [index % 2 ? 9 : -9, 0]) * (1 - toTrack)
            }
          />,
        ];
      })}
    </div>
  );
};
