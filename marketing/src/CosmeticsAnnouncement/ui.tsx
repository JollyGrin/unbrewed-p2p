import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { font } from "../theme";
import { alpha, type Palette } from "../shared/color";
import { COSMETIC_RIM_PAINTS, type CosmeticRimTier, labelOf } from "./ladder";

export { EASE, Eyebrow, SceneFade, Wordmark } from "../shared/ui";

/** Brand backdrop — no deck watermark, because the ad is not selling a deck. */
export const Backdrop: React.FC<{ palette: Palette }> = ({ palette }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 1170], [0, 1]);
  return (
    <AbsoluteFill style={{ backgroundColor: palette.deep }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(125% 115% at 50% ${-14 + drift * 10}%, ${palette.base} 0%, ${palette.deep} 68%)`,
        }}
      />
      <AbsoluteFill
        style={{ boxShadow: `inset 0 0 340px 100px ${alpha("#000000", 0.55)}` }}
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

/** The ad's one headline treatment — used once per beat, never twice. */
export const Headline: React.FC<{
  text: string;
  palette: Palette;
  size?: number;
  align?: "left" | "center";
  maxWidth?: number;
}> = ({ text, palette, size = 92, align = "left", maxWidth = 1420 }) => (
  <div
    style={{
      fontFamily: font.display,
      fontSize: size,
      lineHeight: 1.0,
      letterSpacing: 2,
      color: palette.ink,
      textAlign: align,
      maxWidth,
      textShadow: `0 6px 28px ${alpha("#000000", 0.6)}`,
    }}
  >
    {text}
  </div>
);

/**
 * One rung of the ladder as a small disc, painted with that tier's REAL conic
 * gradient masked to a band — the fighter-token treatment at pip scale, so the
 * ladder readout and the token in beat 5 are demonstrably the same four paints.
 */
const PIP_MASK =
  "radial-gradient(circle closest-side, transparent 0 62%, rgba(0,0,0,0.6) 72%, #000 82%, #000 100%)";

export const TierPip: React.FC<{
  tier: CosmeticRimTier;
  size?: number;
  /** 0..1 — an unreached rung sits dark, the reached one is full strength. */
  lit: number;
}> = ({ tier, size = 46, lit }) => (
  <div
    style={{
      position: "relative",
      width: size,
      height: size,
      borderRadius: "50%",
      background: "rgba(255,255,255,0.06)",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        opacity: 0.18 + 0.82 * lit,
        background: COSMETIC_RIM_PAINTS[tier].ring,
        maskImage: PIP_MASK,
        WebkitMaskImage: PIP_MASK,
      }}
    />
  </div>
);

/** The four rungs in a row, with the reached ones lit. */
export const TierPips: React.FC<{
  rungs: readonly CosmeticRimTier[];
  /** 0..rungs.length — fractional, so a step lights its pip as it lands. */
  reached: number;
  size?: number;
  gap?: number;
}> = ({ rungs, reached, size = 46, gap = 26 }) => (
  <div style={{ display: "flex", gap, alignItems: "center" }}>
    {rungs.map((tier, index) => (
      <TierPip
        key={tier}
        tier={tier}
        size={size}
        lit={Math.max(0, Math.min(1, reached - index))}
      />
    ))}
  </div>
);

/** The tier's shipped label — "Antiqued gold", never "Gold". */
export const TierName: React.FC<{
  tier: CosmeticRimTier;
  palette: Palette;
  size?: number;
}> = ({ tier, palette, size = 104 }) => (
  <div
    style={{
      fontFamily: font.display,
      fontSize: size,
      lineHeight: 1,
      letterSpacing: 6,
      textTransform: "uppercase",
      color: palette.ink,
      textShadow: `0 6px 26px ${alpha("#000000", 0.6)}`,
    }}
  >
    {labelOf(tier)}
  </div>
);

/** Fixed-locale thousands separators — a render must not depend on the host. */
export const withCommas = (value: number) => value.toLocaleString("en-US");
