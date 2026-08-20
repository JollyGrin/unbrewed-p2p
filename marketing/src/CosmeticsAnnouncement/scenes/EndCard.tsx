import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import { alpha, type Palette } from "../../shared/color";
import { RUNGS } from "../ladder";
import { CUE } from "../timeline";
import { EASE, Eyebrow, TierPips } from "../ui";

/** Beat 6 — where to go. The four rungs close the video as a motif, so the last
 * frame still says what the offer is. */
export const EndCard: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const mark = spring({
    frame: frame - CUE.ctaMark,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });
  const url = spring({
    frame: frame - CUE.ctaUrl,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });
  const line = interpolate(frame, [CUE.ctaLine, CUE.ctaLine + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const pips = interpolate(
    frame,
    [CUE.ctaSting - 6, CUE.ctaSting + 18],
    [0, 4],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    },
  );

  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 40,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          opacity: mark,
          transform: `translateY(${interpolate(mark, [0, 1], [40, 0])}px)`,
        }}
      >
        <Eyebrow label="Cosmetic rewards" color={palette.accent} />
        <div
          style={{
            fontFamily: font.display,
            fontSize: 200,
            lineHeight: 0.92,
            letterSpacing: 10,
            color: palette.ink,
            textShadow: `0 8px 34px ${alpha("#000000", 0.65)}`,
          }}
        >
          UNBREWED
        </div>
      </div>

      <div
        style={{
          fontFamily: font.display,
          fontSize: 92,
          letterSpacing: 3,
          lineHeight: 1,
          color: palette.onAccent,
          background: palette.accent,
          padding: "22px 60px 12px",
          borderRadius: 20,
          boxShadow: `0 14px 0 ${alpha("#000000", 0.35)}`,
          opacity: url,
          transform: `translateY(${interpolate(url, [0, 1], [36, 0])}px)`,
        }}
      >
        unbrewed.xyz/collection
      </div>

      <div
        style={{
          fontFamily: font.body,
          fontSize: 44,
          letterSpacing: 3,
          color: alpha(palette.ink, 0.86),
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [20, 0])}px)`,
        }}
      >
        Start earning with every win.
      </div>

      <div style={{ marginTop: 10 }}>
        <TierPips rungs={RUNGS} reached={pips} size={38} gap={22} />
      </div>
    </AbsoluteFill>
  );
};
