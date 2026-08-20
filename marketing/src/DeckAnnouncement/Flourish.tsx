import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import { Flourish as SharedFlourish } from "../shared/Flourish";
import type { Palette } from "../shared/color";
import { ambientDim, burstsFor, DEFAULT_PARTICLE_STYLE } from "./particles";
import type { ParticleStyle } from "./particles";
import type { PromoTimeline } from "./timeline";

export { HeroAura } from "../shared/Flourish";

/**
 * The deck promo's flourish: the shared particle layer, wired to THIS
 * composition's choreography (`./particles` — `burstsFor` and `ambientDim`,
 * both built from `timeline.ts`, so retiming a beat retimes its burst with its
 * sound).
 */
export const Flourish: React.FC<{
  palette: Palette;
  timeline: PromoTimeline;
  hasQuote: boolean;
  cardAnchors: { x: number; y: number }[];
  particleStyle?: ParticleStyle;
}> = ({
  palette,
  timeline,
  hasQuote,
  cardAnchors,
  particleStyle = DEFAULT_PARTICLE_STYLE,
}) => {
  const frame = useCurrentFrame();
  const bursts = useMemo(
    () => burstsFor(timeline, cardAnchors),
    [timeline, cardAnchors],
  );
  return (
    <SharedFlourish
      palette={palette}
      style={particleStyle}
      dim={ambientDim(frame, timeline, hasQuote)}
      bursts={bursts}
    />
  );
};
