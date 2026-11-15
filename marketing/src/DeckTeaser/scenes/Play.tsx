import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { clamp, EASE, Eyebrow } from "../../BonusShowcase/ui";
import { CardFace } from "../../shared/CardFace";
import { font } from "../../theme";
import { alpha, type Palette } from "../../shared/color";
import type { BonusDeck, PromoCard } from "../../shared/deck";
import { PLAY_CARD } from "../layout";
import { PlayStage } from "../PlayVignette";
import type { PlayParams } from "../plays";
import { PLAY_CUE } from "../timeline";

const ease = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { ...clamp, easing: EASE });

/**
 * A main-deck card being played: the real card face snaps down on the left,
 * the stage acts it out on the right, and — on ordinary turns — the active
 * Adventure's goal sits underneath, ticking off when this turn meets it.
 * The payoff uses the same scene with its own clock (`t` from frame 0).
 */
export const Play: React.FC<{
  deck: BonusDeck;
  palette: Palette;
  card: PromoCard;
  kicker: string;
  params: PlayParams;
  duration: number;
  /** the active adventure's goal, if this is an ordinary turn */
  goal?: { label: string; text: string; met: boolean };
  /** payoff: the vignette runs on the scene's own frame */
  ownClock?: boolean;
}> = ({ deck, palette, card, kicker, params, duration, goal, ownClock }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const land = spring({
    frame: frame - PLAY_CUE.cardIn,
    fps,
    config: { damping: 15, stiffness: 160 },
  });
  const out = ease(frame, duration - 12, duration);
  const kick = ease(frame, PLAY_CUE.cardLand, PLAY_CUE.cardLand + 12);
  const stage = ease(frame, PLAY_CUE.cardLand, PLAY_CUE.effect + 6) * (1 - out);
  const tick = spring({
    frame: frame - PLAY_CUE.goalTick,
    fps,
    config: { damping: 11 },
  });
  const width = (PLAY_CARD.h * 63) / 88;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: PLAY_CARD.x - width / 2,
          top: PLAY_CARD.y - PLAY_CARD.h / 2,
          opacity: 1 - out,
          transform: `translate(${interpolate(land, [0, 1], [-160, 0])}px, ${interpolate(
            land,
            [0, 1],
            [380, 0],
          )}px) rotate(${interpolate(land, [0, 1], [-18, -3])}deg) scale(${interpolate(
            land,
            [0, 1],
            [1.15, 1],
          )})`,
        }}
      >
        <CardFace card={card} height={PLAY_CARD.h} />
      </div>
      <div
        style={{
          position: "absolute",
          left: PLAY_CARD.x - 300,
          width: 600,
          top: PLAY_CARD.y + PLAY_CARD.h / 2 + 34,
          textAlign: "center",
          fontFamily: font.display,
          fontSize: 52,
          letterSpacing: 2,
          color: palette.ink,
          opacity: kick * (1 - out),
          transform: `translateY(${interpolate(kick, [0, 1], [16, 0])}px)`,
          textShadow: `0 4px 18px ${alpha("#000000", 0.6)}`,
        }}
      >
        {kicker}
      </div>

      <PlayStage
        t={ownClock ? frame : frame - PLAY_CUE.effect}
        params={params}
        palette={palette}
        deck={deck}
        opacity={stage}
      />

      {goal ? (
        <div
          style={{
            position: "absolute",
            left: 960,
            width: 820,
            top: 760,
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "18px 26px",
            borderRadius: 18,
            backgroundColor: alpha(palette.panel, 0.85),
            border: `3px solid ${alpha(goal.met ? palette.accent : palette.ink, goal.met ? 0.4 + 0.6 * tick : 0.2)}`,
            opacity: stage,
          }}
        >
          <div
            style={{
              flex: "0 0 auto",
              width: 54,
              height: 54,
              borderRadius: 12,
              border: `4px solid ${alpha(palette.ink, 0.5)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: font.display,
              fontSize: 54,
              color: palette.accent,
              backgroundColor: goal.met
                ? alpha(palette.accent, 0.18 * tick)
                : "transparent",
            }}
          >
            <span
              style={{
                opacity: goal.met ? tick : 0,
                transform: `scale(${0.5 + 0.5 * tick})`,
              }}
            >
              ✓
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Eyebrow label={goal.label} color={palette.accent} />
            <div
              style={{
                fontFamily: font.body,
                fontSize: 30,
                lineHeight: 1.25,
                color: palette.inkDim,
              }}
            >
              {goal.text}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
