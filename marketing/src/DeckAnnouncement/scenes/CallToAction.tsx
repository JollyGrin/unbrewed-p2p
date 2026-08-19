import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { DeckPromo } from "../../shared/deck";
import { alpha, type Palette } from "../palette";
import { EASE, Eyebrow } from "../ui";

const OUTRO_AT = 118;

const StatChip: React.FC<{
  label: string;
  value: string;
  delay: number;
  palette: Palette;
}> = ({ label, value, delay, palette }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, mass: 0.6 },
    durationInFrames: 34,
  });
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: 260,
        padding: "20px 34px 14px",
        borderRadius: 18,
        border: `3px solid ${palette.accent}`,
        background: alpha(palette.panel, 0.9),
        transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`,
        opacity: interpolate(pop, [0, 0.4], [0, 1], {
          extrapolateRight: "clamp",
        }),
      }}
    >
      <div
        style={{
          fontFamily: font.body,
          fontSize: 26,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: palette.inkDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: font.display,
          fontSize: 84,
          lineHeight: 1,
          color: palette.ink,
        }}
      >
        {value}
      </div>
    </div>
  );
};

/** Beat 4 — the statline, where to play, and the cardback closing the video. */
export const CallToAction: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ctaIn = spring({
    frame: frame - 30,
    fps,
    config: { damping: 200 },
    durationInFrames: 28,
  });
  // the front half hands over to the closing cardback
  const handover = interpolate(frame, [OUTRO_AT, OUTRO_AT + 20], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const outro = spring({
    frame: frame - OUTRO_AT,
    fps,
    config: { damping: 200 },
    durationInFrames: 34,
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: 54,
          opacity: handover,
          transform: `scale(${interpolate(handover, [0, 1], [0.94, 1])})`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Eyebrow label={deck.deckName} color={palette.accent} />
          <div style={{ display: "flex", gap: 26 }}>
            <StatChip
              label="Health"
              value={String(deck.hero.hp)}
              delay={0}
              palette={palette}
            />
            <StatChip
              label="Move"
              value={String(deck.hero.move)}
              delay={8}
              palette={palette}
            />
            <StatChip
              label="Attack"
              value={deck.hero.isRanged ? "Ranged" : "Melee"}
              delay={16}
              palette={palette}
            />
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            opacity: ctaIn,
            transform: `translateY(${interpolate(ctaIn, [0, 1], [40, 0])}px)`,
          }}
        >
          <div
            style={{
              fontFamily: font.body,
              fontSize: 44,
              letterSpacing: 4,
              color: palette.inkDim,
            }}
          >
            Play free at
          </div>
          <div
            style={{
              fontFamily: font.display,
              fontSize: 150,
              letterSpacing: 4,
              lineHeight: 1,
              color: palette.onAccent,
              background: palette.accent,
              padding: "22px 68px 10px",
              borderRadius: 22,
              boxShadow: `0 14px 0 ${alpha("#000000", 0.35)}`,
            }}
          >
            unbrewed.xyz
          </div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: 1 - handover,
        }}
      >
        {deck.cardbackUrl ? (
          <Img
            src={deck.cardbackUrl}
            style={{
              width: 470,
              borderRadius: 24,
              boxShadow: `0 30px 70px ${alpha("#000000", 0.6)}`,
              transform: `translateY(${interpolate(outro, [0, 1], [380, 0])}px) rotate(${interpolate(
                outro,
                [0, 1],
                [8, 0],
              )}deg)`,
            }}
          />
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
