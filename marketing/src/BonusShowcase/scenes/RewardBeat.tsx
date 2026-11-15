import {
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import { alpha, type Palette } from "../../shared/color";
import type { BonusCard, BonusDeck } from "../../shared/deck";
import { type EffectParams, rulesOf, subtitleOf } from "../effects";
import { BACK_PLACE, FRONT_PLACE, STILL, trackSlot } from "../layout";
import { BEAT, CUE } from "../timeline";
import { Vignette } from "../Vignette";
import { clamp, EASE, Eyebrow, FlipCard, StillInsert } from "../ui";
import { mixPlace } from "./Track";

const ease = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { ...clamp, easing: EASE });

/**
 * One pair: the card leaves the track, its front's goal is read, it gets
 * stamped COMPLETE, flips, slides aside, and the reward plays out as a
 * vignette (with a real client still if the props gave one) before the card
 * goes home reward-side up.
 */
export const RewardBeat: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  stripes: [string, string];
  index: number;
  front: BonusCard;
  back: BonusCard;
  params: EffectParams;
  caption: string;
  still?: string;
}> = ({
  deck,
  palette,
  stripes,
  index,
  front,
  back,
  params,
  caption,
  still,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = deck.pairs.length;
  const slot = trackSlot(index, count);

  // ---- the card's path ----
  const out = ease(frame, CUE.cardOut, CUE.frontIn);
  const aside = ease(frame, CUE.flipLand, CUE.settle + 12);
  const home = ease(frame, CUE.cardHome, BEAT);
  const place =
    frame < CUE.flipLand
      ? mixPlace(slot, FRONT_PLACE, out)
      : frame < CUE.cardHome
        ? mixPlace(FRONT_PLACE, BACK_PLACE, aside)
        : mixPlace(BACK_PLACE, slot, home);
  const flip = ease(frame, CUE.flip, CUE.flipLand);
  // the stamp knocks the card; the flip lifts it off the table
  const knock = interpolate(
    frame,
    [CUE.stamp, CUE.stamp + 3, CUE.stamp + 10],
    [0, 1, 0],
    clamp,
  );
  const lift = Math.sin(Math.PI * flip) * 40 + Math.sin(Math.PI * out) * 30;
  const tilt =
    knock * 2.5 +
    interpolate(out, [0, 1], [index % 2 ? 6 : -6, 0]) *
      (frame < CUE.frontIn ? 1 : 0);

  // ---- the front: what this adventure asks of you ----
  const frontText =
    ease(frame, CUE.frontIn, CUE.frontIn + 14) *
    (1 - ease(frame, CUE.flip - 4, CUE.flip + 6));
  const stamp = spring({
    frame: frame - CUE.stamp,
    fps,
    config: { damping: 10, stiffness: 220 },
  });
  const stampGone = ease(frame, CUE.flip, CUE.flip + 6);

  // ---- the back: what you get for it ----
  const backText = ease(frame, CUE.settle, CUE.settle + 14);
  const vignette =
    ease(frame, CUE.settle, CUE.settle + 10) *
    (1 - ease(frame, CUE.cardHome + 4, BEAT - 2));
  const stillIn =
    spring({
      frame: frame - CUE.still,
      fps,
      config: { damping: 14 },
    }) *
    (1 - ease(frame, CUE.cardHome + 4, BEAT - 2));
  const subtitle = subtitleOf(front);

  return (
    <>
      {/* front copy, right of the big card */}
      <div
        style={{
          position: "absolute",
          left: 1130,
          top: 250,
          width: 680,
          display: "flex",
          flexDirection: "column",
          gap: 18,
          opacity: frontText,
          transform: `translateX(${interpolate(frontText, [0, 1], [30, 0])}px)`,
        }}
      >
        <Eyebrow
          label={`${front.characterName} ${index + 1} of ${count}`}
          color={palette.accent}
        />
        {subtitle ? (
          <div
            style={{
              fontFamily: font.display,
              fontSize: 96,
              lineHeight: 0.95,
              letterSpacing: 2,
              color: palette.ink,
            }}
          >
            {subtitle}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 8,
            paddingLeft: 22,
            borderLeft: `6px solid ${palette.accent}`,
            fontFamily: font.body,
            fontSize: 36,
            lineHeight: 1.3,
            color: palette.inkDim,
          }}
        >
          {rulesOf(front)}
        </div>
      </div>

      <FlipCard
        front={front}
        back={back}
        place={place}
        flip={flip}
        tilt={tilt}
        lift={lift}
        glow={flip > 0.5 ? alpha(palette.accent, 0.35 * (1 - home)) : undefined}
      />

      {/* COMPLETE — slammed onto the card, gone as it turns over */}
      {frame >= CUE.stamp ? (
        <div
          style={{
            position: "absolute",
            left: FRONT_PLACE.x,
            top: FRONT_PLACE.y,
            transform: `translate(-50%, -50%) rotate(-9deg) scale(${interpolate(
              stamp,
              [0, 1],
              [2.4, 1],
            )})`,
            opacity: Math.min(1, stamp * 1.5) * (1 - stampGone),
            padding: "6px 40px",
            border: `10px solid ${palette.accent}`,
            borderRadius: 18,
            backgroundColor: alpha("#000000", 0.55),
            fontFamily: font.display,
            fontSize: 150,
            letterSpacing: 8,
            color: palette.accent,
            textShadow: `0 0 30px ${alpha(palette.accent, 0.6)}`,
            whiteSpace: "nowrap",
          }}
        >
          COMPLETE!
        </div>
      ) : null}

      {/* back copy, under the card once it has slid aside */}
      <div
        style={{
          position: "absolute",
          left: BACK_PLACE.x - BACK_PLACE.w / 2,
          top: 660,
          width: BACK_PLACE.w + 40,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          opacity: backText * (1 - home),
          transform: `translateY(${interpolate(backText, [0, 1], [24, 0])}px)`,
        }}
      >
        <Eyebrow
          label={`${back.characterName} ${index + 1}`}
          color={palette.accent}
        />
        <div
          style={{
            fontFamily: font.body,
            fontSize: 40,
            lineHeight: 1.28,
            color: palette.ink,
          }}
        >
          {caption}
        </div>
      </div>

      {frame >= CUE.settle ? (
        <Vignette
          t={frame - CUE.effect}
          params={params}
          palette={palette}
          deck={deck}
          stripes={stripes}
          opacity={vignette}
        />
      ) : null}

      {still && frame >= CUE.still ? (
        <StillInsert
          src={staticFile(still)}
          x={STILL.x}
          y={STILL.y}
          w={STILL.w}
          enter={stillIn}
          age={frame - CUE.still}
          palette={palette}
        />
      ) : null}
    </>
  );
};
