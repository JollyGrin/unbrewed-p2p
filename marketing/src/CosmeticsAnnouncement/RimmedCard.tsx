import { CardFace } from "../shared/CardFace";
import type { PromoCard } from "../shared/deck";
import { alpha } from "../shared/color";
import { type CosmeticRimTier, sheenOf } from "./ladder";

/**
 * A card wearing a cosmetic rim, plus the two things the shipped rim
 * deliberately does NOT do: ignite, and step to the next tier.
 *
 * `CardRim` is a static paint by design (design doc §9b — nothing in a hand
 * animates at rest, and that absence is a signal channel). An advert is a
 * different room: the viewer has four seconds to understand that a reward
 * lands on a card. So the rim itself is untouched — it is the real component,
 * reached through the real `withRimTier` seam — and the motion is two overlays
 * ON TOP of it that exist only in this video:
 *
 *   - a cross-fade from the previous rung to the next, so a step reads as metal
 *     becoming better metal rather than a cut;
 *   - a specular sweep travelling along the rim's own path, drawn in the tier's
 *     own brightest stop (`sheenOf`) so it can never introduce a colour the
 *     ladder does not already contain.
 *
 * The sweep's geometry mirrors `components/CardFactory/cardRim.tsx` exactly —
 * same 63x88 viewBox, same 1.4 stroke on the same inset — so it rides the rim
 * instead of floating near it.
 */

/** Mirrors cardRim.tsx: RIM_WIDTH 1.4, so the stroke's centre sits at 0.7. */
const RIM_WIDTH = 1.4;
const RIM_INSET = RIM_WIDTH / 2;
const CARD_W = 63;
const CARD_H = 88;
const CARD_RADIUS = 2.5;

/** Ids are tier-scoped, like the shipped rim's: two sweeps of the same tier
 * emit byte-identical defs, so a duplicate id resolves to the same gradient. */
const sweepId = (tier: CosmeticRimTier) => `cosmetics-ad-sweep-${tier}`;

const RimSweep: React.FC<{ tier: CosmeticRimTier; progress: number }> = ({
  tier,
  progress,
}) => {
  const sheen = sheenOf(tier);
  const id = sweepId(tier);
  // the band travels from off one corner to off the other along the card's
  // diagonal — the same axis cardRim.tsx paints its gradient down
  const head = -0.55 + progress * 2.1;
  return (
    <svg
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      preserveAspectRatio="none"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient
          id={id}
          x1={head - 0.3}
          y1={head - 0.3}
          x2={head + 0.3}
          y2={head + 0.3}
        >
          <stop offset="0" stopColor={sheen} stopOpacity={0} />
          <stop offset="0.5" stopColor={sheen} stopOpacity={0.95} />
          <stop offset="1" stopColor={sheen} stopOpacity={0} />
        </linearGradient>
      </defs>
      <rect
        x={RIM_INSET}
        y={RIM_INSET}
        width={CARD_W - 2 * RIM_INSET}
        height={CARD_H - 2 * RIM_INSET}
        rx={CARD_RADIUS - RIM_INSET}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={RIM_WIDTH}
        opacity={Math.sin(Math.PI * progress)}
      />
    </svg>
  );
};

export const RimmedCard: React.FC<{
  card: PromoCard;
  height: number;
  /** The rung being shown. null renders base art. */
  tier: CosmeticRimTier | null;
  /** The rung being stepped away from — cross-faded under `tier`. */
  from?: CosmeticRimTier | null;
  /** 0..1 across the cross-fade. 1 (the default) is "settled on `tier`". */
  blend?: number;
  /** 0..1 sweep along the rim; 0 draws none. */
  sweep?: number;
}> = ({ card, height, tier, from = null, blend = 1, sweep = 0 }) => {
  const width = (height * 63) / 88;
  const glow = tier ? sheenOf(tier) : null;
  return (
    <div style={{ position: "relative", width, height }}>
      {glow ? (
        <div
          style={{
            position: "absolute",
            left: -width * 0.34,
            top: -height * 0.22,
            width: width * 1.68,
            height: height * 1.44,
            // a radial gradient, never a per-frame blur(): soft is cheap this
            // way and ruinously expensive the other
            background: `radial-gradient(closest-side, ${alpha(glow, 0.34 * blend)} 0%, ${alpha(
              glow,
              0.12 * blend,
            )} 46%, ${alpha(glow, 0)} 74%)`,
          }}
        />
      ) : null}
      <div style={{ position: "absolute", inset: 0 }}>
        <CardFace card={card} height={height} rimTier={from} />
      </div>
      {tier && blend > 0 ? (
        <div style={{ position: "absolute", inset: 0, opacity: blend }}>
          <CardFace card={card} height={height} rimTier={tier} />
        </div>
      ) : null}
      {tier && sweep > 0 && sweep < 1 ? (
        <RimSweep tier={tier} progress={sweep} />
      ) : null}
    </div>
  );
};
