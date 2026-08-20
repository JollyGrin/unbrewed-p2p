import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { PromoCard } from "../../shared/deck";
import type { Palette } from "../../shared/color";
import { CARD_ANCHOR } from "../flourish";
import { RimmedCard } from "../RimmedCard";
import { cosmeticsTimeline, CUE } from "../timeline";
import { EASE, Eyebrow, Headline } from "../ui";

export const CARD_HEIGHT = 640;

/** This beat's length, from the one place that owns it — the copy hands over
 * just before the match cut into the ladder. */
const BEAT = cosmeticsTimeline().hook.duration;

/**
 * Beat 1 — one card alone. A beat of stillness, then the bronze rim IGNITES
 * around it with a light sweep, and the claim lands under it.
 */
export const Hook: React.FC<{ card: PromoCard; palette: Palette }> = ({
  card,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  });
  // the rim catches over 16f; the sweep runs a little longer and tails off
  const ignite = interpolate(
    frame,
    [CUE.hookIgnite, CUE.hookIgnite + 16],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
  const sweep = interpolate(
    frame,
    [CUE.hookIgnite - 4, CUE.hookIgnite + 26],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const line = spring({
    frame: frame - CUE.hookLine,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });
  // the beat cuts straight into the ladder on the same card, so this scene
  // takes its own copy off rather than the SceneFade taking the frame with it
  const handover = interpolate(frame, [BEAT - 16, BEAT - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: CARD_ANCHOR.x - (CARD_HEIGHT * 63) / 88 / 2,
          top: CARD_ANCHOR.y - CARD_HEIGHT / 2,
          transform: `translateY(${interpolate(enter, [0, 1], [46, 0])}px) scale(${interpolate(
            enter,
            [0, 1],
            [0.92, 1],
          )})`,
          opacity: enter,
        }}
      >
        <RimmedCard
          card={card}
          height={CARD_HEIGHT}
          tier="bronze"
          blend={ignite}
          sweep={sweep}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 826,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          opacity: line * handover,
          transform: `translateY(${interpolate(line, [0, 1], [34, 0])}px)`,
        }}
      >
        <Eyebrow label="Cosmetic rewards — now live" color={palette.accent} />
        <Headline
          text="Your wins are worth something now."
          palette={palette}
          size={104}
          align="center"
          maxWidth={1560}
        />
      </div>
    </AbsoluteFill>
  );
};
