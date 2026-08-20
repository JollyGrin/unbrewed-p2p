import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { alpha, type Palette } from "../shared/color";
import type { DeckPromo } from "../shared/deck";

export { EASE, Eyebrow, SceneFade, Wordmark } from "../shared/ui";

/** Deck-palette backdrop: gradient off the deck's own border/highlight colors,
 * with the hero portrait drifting behind everything at watermark strength. */
export const Backdrop: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
  palette,
}) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 900], [0, 70]);
  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 110% at 50% -10%, ${palette.base} 0%, ${palette.deep} 70%)`,
        }}
      />
      {deck.hero.portraitUrl ? (
        <Img
          src={deck.hero.portraitUrl}
          style={{
            position: "absolute",
            width: 1500,
            right: -320 - drift * 0.5,
            bottom: -300 + drift * 0.3,
            opacity: 0.06,
            // the portrait is a hard-edged square — fade its edges out or it
            // draws a visible seam down the middle of every frame
            maskImage:
              "radial-gradient(70% 70% at 60% 45%, #000 0%, rgba(0,0,0,0.35) 62%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(70% 70% at 60% 45%, #000 0%, rgba(0,0,0,0.35) 62%, transparent 100%)",
          }}
        />
      ) : null}
      <AbsoluteFill
        style={{ boxShadow: `inset 0 0 320px 90px ${alpha("#000000", 0.5)}` }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background: `linear-gradient(90deg, ${palette.accent}, ${alpha(palette.accent, 0)})`,
        }}
      />
    </AbsoluteFill>
  );
};
