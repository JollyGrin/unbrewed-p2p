import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { font } from "../../theme";
import type { DeckPromo } from "../../shared/deck";
import { alpha, type Palette } from "../../shared/color";
import { BoardToken } from "../BoardToken";
import { TOKEN_ANCHOR } from "../flourish";
import { RUNGS, labelOf, tokenRimThresholds } from "../ladder";
import { CUE } from "../timeline";
import { EASE, Eyebrow, Headline, withCommas } from "../ui";

const TOKEN_SIZE = 300;
const BAR_LEFT = 300;
const BAR_WIDTH = 1320;
const BAR_TOP = 872;
const BAR_HEIGHT = 16;
const STEP_FRAMES = 14;

/**
 * Beat 4 — the token rim.
 *
 * A token rim is the one cosmetic nobody buys: it unlocks at an EARNED-points
 * threshold and is measured against earned forever, so spending on card art can
 * never walk it back. The bar is therefore the story — it fills on its own, and
 * the token steps a rung each time it passes one of `tokenRimThresholds`.
 */
export const TokenClimb: React.FC<{ deck: DeckPromo; palette: Palette }> = ({
  deck,
  palette,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const settle = spring({
    frame: frame - CUE.tokenIn,
    fps,
    config: { damping: 200 },
    durationInFrames: 30,
  });

  // The bar's own clock. It is SEGMENTED, one equal segment per rung, because
  // that is what /collection draws: `rimProgress` reports percent within the
  // current tier's span, not percent of the whole ladder — the thresholds are
  // 250/750/2000/5000, so a value-linear bar would crawl and then leap.
  const clock = [CUE.tokenIn + 6, ...CUE.tokenTiers];
  const filled = interpolate(frame, clock, [0, 1, 2, 3, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const points = Math.round(
    interpolate(frame, clock, [0, ...tokenRimThresholds], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    }),
  );
  const rung = CUE.tokenTiers.reduce(
    (highest, at, index) => (frame >= at ? index : highest),
    -1,
  );
  const stepAt = rung >= 0 ? CUE.tokenTiers[rung] : 0;
  const blend =
    rung < 0
      ? 0
      : interpolate(frame, [stepAt, stepAt + STEP_FRAMES], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        });
  const tier = rung >= 0 ? RUNGS[rung] : null;
  const previous = rung > 0 ? RUNGS[rung - 1] : null;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: 118,
          top: 110,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <Eyebrow label="Your fighter token" color={palette.accent} />
        <Headline
          text="Your token levels up on its own."
          palette={palette}
          size={80}
        />
      </div>

      {/* board vignette — the surface a token is actually seen on */}
      <div
        style={{
          position: "absolute",
          left: TOKEN_ANCHOR.x - 260,
          top: TOKEN_ANCHOR.y - 200,
          width: 520,
          height: 400,
          borderRadius: 26,
          background: `linear-gradient(160deg, ${alpha("#ffffff", 0.07)}, ${alpha("#000000", 0.32)})`,
          border: `2px solid ${alpha(palette.accent, 0.22)}`,
          boxShadow: `inset 0 0 70px ${alpha("#000000", 0.55)}`,
          opacity: settle,
        }}
      >
        {/* the board's grid, faint enough to stay a texture */}
        {[1, 2, 3].map((n) => (
          <div
            key={`v${n}`}
            style={{
              position: "absolute",
              left: (520 / 4) * n,
              top: 0,
              bottom: 0,
              width: 1,
              background: alpha(palette.ink, 0.07),
            }}
          />
        ))}
        {[1, 2].map((n) => (
          <div
            key={`h${n}`}
            style={{
              position: "absolute",
              top: (400 / 3) * n,
              left: 0,
              right: 0,
              height: 1,
              background: alpha(palette.ink, 0.07),
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: TOKEN_ANCHOR.x - TOKEN_SIZE / 2,
          top: TOKEN_ANCHOR.y - TOKEN_SIZE / 2,
          transform: `scale(${interpolate(settle, [0, 1], [0.86, 1]) * (1 + 0.03 * Math.sin(Math.PI * blend))})`,
          opacity: settle,
        }}
      >
        <BoardToken
          size={TOKEN_SIZE}
          portraitUrl={deck.hero.portraitUrl}
          initials="T"
          tier={tier}
          from={previous}
          blend={blend}
        />
      </div>

      {/* the earned-points bar, with a tick at every threshold */}
      <div style={{ position: "absolute", left: BAR_LEFT, top: BAR_TOP - 52 }}>
        <div
          style={{
            fontFamily: font.body,
            fontSize: 30,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: alpha(palette.ink, 0.7),
          }}
        >
          {`Earned · ${withCommas(points)}`}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: BAR_LEFT,
          top: BAR_TOP,
          width: BAR_WIDTH,
          height: BAR_HEIGHT,
          borderRadius: 999,
          background: alpha("#000000", 0.45),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(filled / tokenRimThresholds.length) * 100}%`,
            background: palette.accent,
          }}
        />
      </div>
      {tokenRimThresholds.map((threshold, index) => (
        <div
          key={threshold}
          style={{
            position: "absolute",
            left:
              BAR_LEFT +
              (BAR_WIDTH * (index + 1)) / tokenRimThresholds.length -
              60,
            top: BAR_TOP + BAR_HEIGHT + 14,
            width: 120,
            textAlign: "center",
            fontFamily: font.body,
            fontSize: 25,
            letterSpacing: 2,
            color: alpha(palette.ink, points >= threshold ? 0.95 : 0.45),
          }}
        >
          <div>{withCommas(threshold)}</div>
          <div style={{ fontSize: 21, opacity: 0.75 }}>
            {labelOf(RUNGS[index])}
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
