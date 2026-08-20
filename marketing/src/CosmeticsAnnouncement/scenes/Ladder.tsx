import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { PromoCard } from "../../shared/deck";
import type { Palette } from "../../shared/color";
import { CARD_ANCHOR } from "../flourish";
import { RUNGS } from "../ladder";
import { RimmedCard } from "../RimmedCard";
import { CUE } from "../timeline";
import { EASE, Eyebrow, TierName, TierPips } from "../ui";
import { CARD_HEIGHT } from "./Hook";

/** How long a rung takes to dissolve into the next, and how long its sweep runs. */
const STEP_FRAMES = 18;
const SWEEP_FRAMES = 30;

/**
 * Beat 2 — the money shot. The card from the hook stays exactly where it was
 * and steps the whole ladder: bronze → silver → antiqued gold → static
 * iridescent, each rung punched by the flourish and captioned with the tier's
 * own shipped label. Iridescent then holds for a third of the beat, because it
 * is the thing the ad is selling.
 */
export const Ladder: React.FC<{ card: PromoCard; palette: Palette }> = ({
  card,
  palette,
}) => {
  const frame = useCurrentFrame();
  // the beat is cut into on the same card as the hook, so the SceneFade does
  // not open this scene — its own copy fades up instead
  const settle = interpolate(frame, [2, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  // which rung we are on, and how far into its dissolve
  const rung = CUE.ladderSteps.reduce(
    (highest, at, index) => (frame >= at ? index : highest),
    0,
  );
  const stepAt = CUE.ladderSteps[rung];
  const blend = interpolate(frame, [stepAt, stepAt + STEP_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const sweep = interpolate(frame, [stepAt, stepAt + SWEEP_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tier = RUNGS[rung];
  // rung 0 opens already lit: the hook ended on bronze, so a second ignition
  // there would read as the video repeating itself
  const previous = rung === 0 ? tier : RUNGS[rung - 1];

  return (
    <AbsoluteFill>
      <div
        style={{ position: "absolute", left: 118, top: 128, opacity: settle }}
      >
        <Eyebrow label="Four rungs, per card" color={palette.accent} />
      </div>

      <div
        style={{
          position: "absolute",
          left: CARD_ANCHOR.x - (CARD_HEIGHT * 63) / 88 / 2,
          top: CARD_ANCHOR.y - CARD_HEIGHT / 2,
          transform: `scale(${1 + 0.02 * Math.sin(Math.PI * blend)})`,
        }}
      >
        <RimmedCard
          card={card}
          height={CARD_HEIGHT}
          tier={tier}
          from={previous}
          blend={rung === 0 ? 1 : blend}
          sweep={sweep}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 796,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
          opacity: settle,
        }}
      >
        <div
          style={{
            transform: `translateY(${interpolate(blend, [0, 1], [16, 0])}px)`,
            opacity: 0.2 + 0.8 * blend,
          }}
        >
          <TierName tier={tier} palette={palette} size={96} />
        </div>
        <TierPips rungs={RUNGS} reached={rung + blend} />
      </div>
    </AbsoluteFill>
  );
};
