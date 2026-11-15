import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "../../theme";
import { alpha, type Palette } from "../../shared/color";
import type { BonusDeck } from "../../shared/deck";
import { CUE } from "../timeline";
import { clamp, EASE, Eyebrow } from "../ui";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "S"}`;

/** The side deck names itself; the Track layer deals its cards in below. */
export const Intro: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  intro: string;
}> = ({ deck, palette, intro }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const count = deck.pairs.length;
  const first = deck.pairs[0];

  const eyebrow = interpolate(frame, [4, 20], [0, 1], {
    ...clamp,
    easing: EASE,
  });
  const slam = spring({
    frame: frame - CUE.titleSlam,
    fps,
    config: { damping: 11, stiffness: 200 },
  });
  const line = interpolate(frame, [CUE.introLine, CUE.introLine + 16], [0, 1], {
    ...clamp,
    easing: EASE,
  });
  // the words clear out before the cards rise through them into the track
  const leave = interpolate(
    frame,
    [CUE.toTrack - 4, CUE.toTrack + 8],
    [1, 0],
    clamp,
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 240,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        opacity: leave,
      }}
    >
      <div style={{ opacity: eyebrow }}>
        <Eyebrow
          label={`${deck.hero.name} · ${plural(count, first.front.characterName)} · ${plural(
            count,
            first.back.characterName,
          )}`}
          color={palette.accent}
        />
      </div>
      <div
        style={{
          fontFamily: font.display,
          fontSize: 176,
          lineHeight: 0.92,
          letterSpacing: 5,
          color: palette.ink,
          opacity: Math.min(1, slam * 1.4),
          transform: `scale(${interpolate(slam, [0, 1], [1.5, 1])}) rotate(${interpolate(
            slam,
            [0, 1],
            [-5, -1.5],
          )}deg)`,
          textShadow: `0 8px 0 ${alpha("#000000", 0.35)}, 0 0 40px ${alpha(palette.accent, 0.35)}`,
        }}
      >
        {deck.ruleCard?.title ?? `${deck.hero.name}'s side deck`}
      </div>
      <div
        style={{
          fontFamily: font.body,
          fontSize: 42,
          color: palette.inkDim,
          opacity: line,
          transform: `translateY(${interpolate(line, [0, 1], [16, 0])}px)`,
        }}
      >
        {intro}
      </div>
    </div>
  );
};
