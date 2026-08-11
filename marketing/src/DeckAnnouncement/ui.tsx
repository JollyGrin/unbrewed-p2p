import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { font } from "../theme";
import type { DeckPromo } from "./deck";
import { alpha, type Palette } from "./palette";

export const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** in over 12f, out over the last 12f — every scene fades against the backdrop,
 * which stays mounted for the whole video so cuts never flash. */
export const SceneFade: React.FC<{
  durationInFrames: number;
  children: React.ReactNode;
}> = ({ durationInFrames, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

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

/** The persistent brand mark — every frame of the promo says where to play. */
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
