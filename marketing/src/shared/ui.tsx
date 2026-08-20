import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { font } from "../theme";
import { alpha, type Palette } from "./color";

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * In over 12f, out over the last 12f — every scene fades against the backdrop,
 * which stays mounted for the whole video so cuts never flash.
 *
 * Either edge can be set to 0 for a scene that has to be CONTINUOUS with its
 * neighbour: the cosmetics ad holds one card across its first two beats, and a
 * dip to the backdrop between them would break the one thing that beat is
 * saying — that this is the same card, one rung higher.
 */
export const SceneFade: React.FC<{
  durationInFrames: number;
  fadeIn?: number;
  fadeOut?: number;
  children: React.ReactNode;
}> = ({ durationInFrames, fadeIn = 12, fadeOut = 12, children }) => {
  const frame = useCurrentFrame();
  // two independent ramps rather than one 4-point curve: an edge set to 0 has
  // to disappear cleanly, and a 4-point range with a zero-length segment is not
  // strictly increasing, which `interpolate` refuses
  const opacity =
    (fadeIn <= 0
      ? 1
      : interpolate(frame, [0, fadeIn], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        })) *
    (fadeOut <= 0
      ? 1
      : interpolate(
          frame,
          [durationInFrames - fadeOut, durationInFrames],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          },
        ));
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

/** Small tracked-out label that sits above a headline. */
export const Eyebrow: React.FC<{ label: string; color: string }> = ({
  label,
  color,
}) => (
  <div
    style={{
      fontFamily: font.body,
      fontSize: 30,
      letterSpacing: 8,
      textTransform: "uppercase",
      color,
    }}
  >
    {label}
  </div>
);

/** The persistent brand mark — every frame of a promo says where to play. */
export const Wordmark: React.FC<{ palette: Palette }> = ({ palette }) => (
  <div
    style={{
      position: "absolute",
      left: 96,
      bottom: 58,
      fontFamily: font.display,
      fontSize: 38,
      letterSpacing: 4,
      color: alpha(palette.ink, 0.55),
    }}
  >
    UNBREWED.XYZ
  </div>
);
