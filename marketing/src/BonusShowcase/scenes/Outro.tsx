import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { font } from "../../theme";
import { alpha, type Palette } from "../../shared/color";
import type { BonusDeck } from "../../shared/deck";
import { CUE } from "../timeline";
import { clamp, EASE, Token } from "../ui";

/** The rewards line up (Track layer); the hero names itself; the url lands. */
export const Outro: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  outro: string;
}> = ({ deck, palette, outro }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = spring({
    frame: frame - CUE.outroName,
    fps,
    config: { damping: 11, stiffness: 200 },
  });
  const line = interpolate(
    frame,
    [CUE.outroName + 10, CUE.outroName + 24],
    [0, 1],
    { ...clamp, easing: EASE },
  );
  const url = spring({
    frame: frame - CUE.outroUrl,
    fps,
    config: { damping: 14 },
  });
  const tokens = [deck.hero.portraitUrl, deck.sidekick?.portraitUrl].filter(
    (src): src is string => Boolean(src),
  );
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 540,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40,
          opacity: Math.min(1, name * 1.4),
          transform: `scale(${interpolate(name, [0, 1], [1.4, 1])})`,
        }}
      >
        {tokens[0] ? (
          <Token src={tokens[0]} size={130} ring={palette.accent} />
        ) : null}
        <div
          style={{
            fontFamily: font.display,
            fontSize: 168,
            lineHeight: 0.9,
            letterSpacing: 6,
            color: palette.ink,
            textShadow: `0 8px 0 ${alpha("#000000", 0.35)}`,
          }}
        >
          {deck.deckName}
        </div>
        {tokens[1] ? (
          <Token src={tokens[1]} size={130} ring={palette.accent} />
        ) : null}
      </div>
      <div
        style={{
          fontFamily: font.body,
          fontSize: 42,
          color: palette.inkDim,
          opacity: line,
        }}
      >
        {outro}
      </div>
      <div
        style={{
          marginTop: 14,
          padding: "16px 46px",
          borderRadius: 999,
          backgroundColor: palette.accent,
          color: palette.onAccent,
          fontFamily: font.display,
          fontSize: 54,
          letterSpacing: 4,
          opacity: url,
          transform: `translateY(${interpolate(url, [0, 1], [30, 0])}px)`,
        }}
      >
        PLAY NOW · UNBREWED.XYZ
      </div>
    </div>
  );
};
