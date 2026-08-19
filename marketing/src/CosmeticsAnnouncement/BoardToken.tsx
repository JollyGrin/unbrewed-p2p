import { Img } from "remotion";
import { font } from "../theme";
import { COSMETIC_RIM_PAINTS, type CosmeticRimTier } from "./ladder";

/**
 * A fighter token at board scale, wearing the cosmetic token rim (#613).
 *
 * It re-draws the token rather than importing `components/Pro/FighterTokenRim`
 * for one reason only: that component is a Chakra `Box`, and pulling Chakra +
 * emotion into a Remotion bundle to paint one circle is not a trade worth
 * making. Everything that could DRIFT is imported instead — the band is
 * `COSMETIC_RIM_PAINTS[tier].ring`, the shipped conic gradient, under the
 * shipped radial mask — so the ad cannot show a rim the board does not.
 *
 * The token body is what `TokenRimPanel`'s preview draws: the p1 seat disc
 * `#E0A82E`, a white border, the deck's board portrait, and the initials.
 */

/** Verbatim from `FighterTokenRim`: percentages are of the ending shape's
 * radius, so the band is ~11% of the token's diameter at any size. */
const RIM_MASK =
  "radial-gradient(circle closest-side, transparent 0 78%, rgba(0,0,0,0.6) 83%, #000 88%, #000 100%)";

/** The p1 seat colour — flat, single hue, and OUTSIDE the cosmetic's business. */
const SEAT = "#E0A82E";

export const BoardToken: React.FC<{
  size: number;
  portraitUrl?: string;
  initials: string;
  tier: CosmeticRimTier | null;
  /** 0..1 — how far the rim being stepped INTO has faded up. */
  blend?: number;
  /** The rung being stepped away from, held under `tier`. */
  from?: CosmeticRimTier | null;
}> = ({ size, portraitUrl, initials, tier, blend = 1, from = null }) => (
  <div
    style={{
      position: "relative",
      width: size,
      height: size,
      borderRadius: "50%",
      boxSizing: "border-box",
      background: SEAT,
      border: `${Math.max(2, size * 0.022)}px solid #ffffff`,
      boxShadow: `0 ${size * 0.03}px ${size * 0.09}px rgba(0,0,0,0.45)`,
    }}
  >
    {portraitUrl ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <Img
          src={portraitUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center top",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 42%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.35) 100%)",
          }}
        />
      </div>
    ) : null}

    {/* the rim being left behind, so a tier step dissolves rather than cuts */}
    {from ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          zIndex: 1,
          background: COSMETIC_RIM_PAINTS[from].ring,
          maskImage: RIM_MASK,
          WebkitMaskImage: RIM_MASK,
        }}
      />
    ) : null}
    {tier ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          zIndex: 1,
          opacity: blend,
          background: COSMETIC_RIM_PAINTS[tier].ring,
          maskImage: RIM_MASK,
          WebkitMaskImage: RIM_MASK,
        }}
      />
    ) : null}

    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.display,
        fontSize: size * 0.3,
        letterSpacing: 2,
        color: "#FAEBD7",
        textShadow: "0 1px 6px rgba(0,0,0,0.95)",
      }}
    >
      {initials}
    </div>
  </div>
);
