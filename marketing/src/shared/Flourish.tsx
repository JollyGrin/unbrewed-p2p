import { useMemo } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { alpha, mix, type Palette } from "./color";
import {
  auraBreath,
  type Burst,
  burstParticles,
  buildField,
  HEIGHT,
  particleAt,
  shimmerAt,
  STYLE_CONFIG,
  WIDTH,
  type ParticleStyle,
} from "./particles";

/**
 * The flourish layer: an ambient particle field, a burst on each audio cue and
 * a breathing aura behind the hero. It mounts BETWEEN the backdrop and the
 * scenes, so every grain of it sits behind the text and the card faces.
 *
 * All the maths is in `particles.ts`; this file only turns it into divs. The
 * choreography — WHICH frames burst, and how far the field dims under each
 * beat — belongs to the composition and is passed in, so the same layer serves
 * a deck promo and the cosmetics ad without either owning the other's timeline.
 *
 * Two rules hold the whole thing together:
 *
 * - **Deterministic.** Randomness comes from Remotion's seeded `random()`,
 *   keyed on the particle's index. `Math.random()` is forbidden — frames render
 *   independently, so it would re-roll the field on every single one.
 * - **Subtle.** Nothing here is above ~0.2 opacity, and the `dim` the
 *   composition hands in pulls the field down further under every beat the
 *   viewer is reading. Seasoning, not a screensaver.
 */

/** Remotion's seeded RNG, in the shape `particles.ts` asks for. */
const rnd = (key: string) => random(key);

/** A soft dot, drawn as a gradient rather than a blurred box (blur is the one
 * cheap-looking effect that is genuinely expensive per frame). */
const dotBackground = (tint: string, softness: number) => {
  const core = Math.round((1 - softness) * 55);
  return `radial-gradient(circle, ${tint} 0%, ${alpha(tint, 0.55)} ${core}%, ${alpha(
    tint,
    0,
  )} 72%)`;
};

const tintFor = (palette: Palette, style: ParticleStyle) => {
  const { toward, amount } = STYLE_CONFIG[style].tint;
  return mix(palette.accent, toward, amount);
};

const AmbientField: React.FC<{
  palette: Palette;
  style: ParticleStyle;
  dim: number;
}> = ({ palette, style, dim }) => {
  const frame = useCurrentFrame();
  const field = useMemo(() => buildField(style, rnd), [style]);
  const tint = tintFor(palette, style);
  const backgrounds = useMemo(
    () =>
      STYLE_CONFIG[style].layers.map((layer) =>
        dotBackground(tint, layer.softness),
      ),
    [style, tint],
  );

  return (
    <AbsoluteFill>
      {field.map((spec, index) => {
        const at = particleAt(spec, frame, style);
        if (at.opacity <= 0.002) return null;
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: at.x - spec.size,
              top: at.y - spec.size,
              width: spec.size * 2,
              height: spec.size * 2,
              borderRadius: "50%",
              background: backgrounds[spec.depth],
              opacity: at.opacity * dim,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

const CueBursts: React.FC<{
  palette: Palette;
  style: ParticleStyle;
  bursts: Burst[];
}> = ({ palette, style, bursts }) => {
  const frame = useCurrentFrame();
  const tint = tintFor(palette, style);
  const sparkBackground = useMemo(() => dotBackground(tint, 0.25), [tint]);
  const puffBackground = useMemo(() => dotBackground(tint, 0.9), [tint]);

  return (
    <AbsoluteFill>
      {bursts.map((burst) => {
        if (burst.kind === "shimmer") {
          const shimmer = shimmerAt(burst, frame);
          if (!shimmer) return null;
          return (
            <div
              key={burst.seed}
              style={{
                position: "absolute",
                top: -HEIGHT * 0.3,
                left: shimmer.position * WIDTH - 200,
                width: 400,
                height: HEIGHT * 1.6,
                transform: "rotate(14deg)",
                opacity: shimmer.opacity,
                background: `linear-gradient(90deg, ${alpha(tint, 0)}, ${alpha(
                  tint,
                  0.35,
                )} 50%, ${alpha(tint, 0)})`,
              }}
            />
          );
        }
        const particles = burstParticles(burst, frame, rnd);
        return particles.map((particle, index) => (
          <div
            key={`${burst.seed}-${index}`}
            style={{
              position: "absolute",
              left: particle.x - particle.size,
              top: particle.y - particle.size,
              width: particle.size * 2,
              height: particle.size * 2,
              borderRadius: "50%",
              background:
                burst.kind === "spark" ? sparkBackground : puffBackground,
              opacity: particle.opacity,
            }}
          />
        ));
      })}
    </AbsoluteFill>
  );
};

/** Mount once, between the backdrop and the scenes. */
export const Flourish: React.FC<{
  palette: Palette;
  style: ParticleStyle;
  /** 0..1 — how loud the ambient field is allowed to be on this frame. */
  dim: number;
  bursts: Burst[];
}> = ({ palette, style, dim, bursts }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <AmbientField palette={palette} style={style} dim={dim} />
    <CueBursts palette={palette} style={style} bursts={bursts} />
  </AbsoluteFill>
);

/** Soft radial glow that breathes behind the hero art on the cold open. */
export const HeroAura: React.FC<{ palette: Palette; size?: number }> = ({
  palette,
  size = 1500,
}) => {
  const frame = useCurrentFrame();
  const breath = auraBreath(frame);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        pointerEvents: "none",
        background: `radial-gradient(circle, ${alpha(palette.accent, 0.4)} 0%, ${alpha(
          palette.accent,
          0.16,
        )} 42%, ${alpha(palette.accent, 0)} 70%)`,
        transform: `scale(${0.94 + 0.09 * breath})`,
        opacity: 0.55 + 0.35 * breath,
      }}
    />
  );
};
