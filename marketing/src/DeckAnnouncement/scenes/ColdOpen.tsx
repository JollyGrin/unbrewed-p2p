import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { DeckPromo } from "../deck";
import { alpha, type Palette } from "../palette";
import { EASE, Eyebrow } from "../ui";

const CARD_H = 560;
const CARD_W = (CARD_H * 63) / 88;

/** Beat 1 — the deck's cardback turns over into the hero, then names itself. */
export const ColdOpen: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
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
  // the turn: the back squashes to nothing, the face opens out of it
  const backScaleX = interpolate(frame, [22, 38], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const faceScaleX = interpolate(frame, [38, 54], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const nameRise = spring({
    frame: frame - 48,
    fps,
    config: { damping: 200 },
    durationInFrames: 26,
  });
  // the quote is the beat's whole payload — it lands early and then holds,
  // so a first-time viewer can read all of it before the cut
  const quoteIn = interpolate(frame, [62, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 44,
        paddingBottom: 40,
      }}
    >
      <div style={{ position: "relative", width: CARD_W, height: CARD_H }}>
        {deck.cardbackUrl ? (
          <Img
            src={deck.cardbackUrl}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 22,
              transform: `translateY(${interpolate(enter, [0, 1], [70, 0])}px) scale(${interpolate(
                enter,
                [0, 1],
                [0.78, 1],
              )}) scaleX(${backScaleX})`,
              boxShadow: `0 30px 60px ${alpha("#000000", 0.55)}`,
              opacity: backScaleX > 0 ? 1 : 0,
            }}
          />
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 22,
            overflow: "hidden",
            border: `8px solid ${palette.accent}`,
            backgroundColor: palette.panel,
            transform: `scaleX(${faceScaleX})`,
            opacity: faceScaleX > 0 ? 1 : 0,
            boxShadow: `0 30px 60px ${alpha("#000000", 0.55)}`,
          }}
        >
          {deck.hero.portraitUrl ? (
            <Img
              src={deck.hero.portraitUrl}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                // slow push so the held frame never reads as a freeze
                transform: `scale(${interpolate(frame, [38, 250], [1, 1.06])})`,
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 180,
              background: `linear-gradient(180deg, ${alpha(palette.deep, 0)}, ${alpha(
                palette.deep,
                0.9,
              )})`,
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          transform: `translateY(${interpolate(nameRise, [0, 1], [40, 0])}px)`,
          opacity: nameRise,
        }}
      >
        <Eyebrow label="New evergreen deck" color={palette.accent} />
        <div
          style={{
            fontFamily: font.display,
            fontSize: 132,
            lineHeight: 0.94,
            letterSpacing: 4,
            color: palette.ink,
            textShadow: `0 6px 30px ${alpha("#000000", 0.6)}`,
          }}
        >
          {deck.deckName}
        </div>
      </div>

      {deck.hero.quote ? (
        <div
          style={{
            fontFamily: font.body,
            fontStyle: "italic",
            fontSize: 34,
            lineHeight: 1.35,
            maxWidth: 1180,
            textAlign: "center",
            color: palette.inkDim,
            opacity: quoteIn,
            transform: `translateY(${interpolate(quoteIn, [0, 1], [18, 0])}px)`,
          }}
        >
          {`“${deck.hero.quote}”`}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
