/**
 * The flourish's maths — every number the particle layer needs, as pure
 * functions of the frame. No React, no Remotion, no DOM: `scripts/check-flourish.mjs`
 * imports this file directly to prove that a burst is zero on every frame that
 * is not one of a timeline's cue frames.
 *
 * DETERMINISM: Remotion renders frames independently and in parallel, so a
 * particle's shape may depend only on (its seed, the frame). `Math.random()`
 * would give a different field on every frame — the callers pass Remotion's
 * seeded `random()` in as `Rng` and nothing here rolls its own.
 *
 * Everything here is composition-AGNOSTIC. Which frames a burst fires on, and
 * how far the ambient field backs off beat by beat, are a composition's own
 * business and live next to its timeline (`DeckAnnouncement/particles.ts`,
 * `CosmeticsAnnouncement/flourish.ts`).
 */

export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Deterministic 0..1 from a stable key. Remotion's `random()` fits this. */
export type Rng = (key: string) => number;

export const PARTICLE_STYLES = ["motes", "embers", "aura", "ash"] as const;
export type ParticleStyle = (typeof PARTICLE_STYLES)[number];

/** Neutral drifting dust — right for most decks, and the fallback. */
export const DEFAULT_PARTICLE_STYLE: ParticleStyle = "motes";

const TAU = Math.PI * 2;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** Linear ramp between two frames, clamped at both ends. */
export const ramp = (frame: number, from: number, to: number) =>
  from === to ? (frame < from ? 0 : 1) : clamp01((frame - from) / (to - from));

/** Piecewise-linear curve through [frame, value] points, clamped outside. */
export const curve = (frame: number, points: [number, number][]) => {
  if (points.length === 0) return 1;
  if (frame <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [f0, v0] = points[i - 1];
    const [f1, v1] = points[i];
    if (frame <= f1) return v0 + (v1 - v0) * ramp(frame, f0, f1);
  }
  return points[points.length - 1][1];
};

const wrap01 = (value: number) => value - Math.floor(value);

// ---- ambient field ----

type DepthLayer = {
  /** how many particles ride at this depth */
  count: number;
  /** px, before the frame's own scale */
  size: [number, number];
  /** frames for one full traversal — bigger is slower */
  period: [number, number];
  /** px of horizontal sway */
  sway: [number, number];
  /** peak opacity BEFORE the ambient dim curve */
  opacity: number;
  /** 0 = hard dot, 1 = all falloff */
  softness: number;
};

type StyleConfig = {
  /** -1 rises, 1 falls, 0 orbits in place */
  drift: -1 | 0 | 1;
  /** 0..1 — how much the twinkle eats into a particle's opacity */
  flicker: number;
  /** how far the tint is pulled off the deck's highlight colour, and toward what */
  tint: { toward: string; amount: number };
  layers: DepthLayer[];
};

/**
 * Back layer is small/slow/dim, front is larger/faster/softer — the parallax is
 * in the period spread, not in a separate transform.
 */
export const STYLE_CONFIG: Record<ParticleStyle, StyleConfig> = {
  motes: {
    drift: -1,
    flicker: 0.18,
    tint: { toward: "#ffffff", amount: 0.3 },
    layers: [
      {
        count: 26,
        size: [3, 6],
        period: [900, 1500],
        sway: [30, 70],
        opacity: 0.17,
        softness: 0.45,
      },
      {
        count: 15,
        size: [6, 11],
        period: [640, 980],
        sway: [45, 95],
        opacity: 0.13,
        softness: 0.6,
      },
      {
        count: 7,
        size: [16, 30],
        period: [420, 700],
        sway: [60, 130],
        opacity: 0.07,
        softness: 0.85,
      },
    ],
  },
  embers: {
    drift: -1,
    flicker: 0.6,
    tint: { toward: "#ffb054", amount: 0.5 },
    layers: [
      {
        count: 28,
        size: [2, 5],
        period: [520, 820],
        sway: [25, 60],
        opacity: 0.2,
        softness: 0.35,
      },
      {
        count: 14,
        size: [5, 9],
        period: [360, 560],
        sway: [40, 85],
        opacity: 0.15,
        softness: 0.55,
      },
      {
        count: 6,
        size: [12, 22],
        period: [260, 420],
        sway: [55, 110],
        opacity: 0.08,
        softness: 0.85,
      },
    ],
  },
  aura: {
    drift: 0,
    flicker: 0.22,
    tint: { toward: "#ffffff", amount: 0.22 },
    layers: [
      {
        count: 22,
        size: [5, 10],
        period: [1100, 1900],
        sway: [80, 190],
        opacity: 0.14,
        softness: 0.7,
      },
      {
        count: 13,
        size: [12, 22],
        period: [800, 1400],
        sway: [120, 260],
        opacity: 0.08,
        softness: 0.85,
      },
      {
        count: 6,
        size: [26, 46],
        period: [620, 1000],
        sway: [160, 320],
        opacity: 0.06,
        softness: 0.95,
      },
    ],
  },
  ash: {
    drift: 1,
    flicker: 0.12,
    // smoke-grey rather than black: true black flakes vanish into the deep end
    // of the backdrop and read as compression noise where they don't
    tint: { toward: "#8a8178", amount: 0.55 },
    layers: [
      {
        count: 27,
        size: [3, 6],
        period: [760, 1200],
        sway: [50, 110],
        opacity: 0.17,
        softness: 0.3,
      },
      {
        count: 15,
        size: [6, 11],
        period: [560, 860],
        sway: [70, 150],
        opacity: 0.13,
        softness: 0.45,
      },
      {
        count: 7,
        size: [14, 24],
        period: [420, 660],
        sway: [90, 190],
        opacity: 0.08,
        softness: 0.8,
      },
    ],
  },
};

export type ParticleSpec = {
  /** 0..1 across the frame */
  x: number;
  /** 0..1 down the frame — the drift styles only use it as a starting phase */
  y: number;
  size: number;
  /** frames for one traversal (or one orbit) */
  period: number;
  phase: number;
  sway: number;
  swayPeriod: number;
  swayPhase: number;
  flickerPeriod: number;
  flickerPhase: number;
  opacity: number;
  softness: number;
  /** 0 = furthest back */
  depth: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The whole field, built once per render from seeded noise. Every roll is keyed
 * on the style + depth + index, so the same deck always gets the same field and
 * two decks on different styles never share one.
 */
export const buildField = (style: ParticleStyle, rnd: Rng): ParticleSpec[] => {
  const config = STYLE_CONFIG[style];
  const field: ParticleSpec[] = [];
  config.layers.forEach((layer, depth) => {
    for (let index = 0; index < layer.count; index++) {
      const key = `${style}-${depth}-${index}`;
      field.push({
        x: rnd(`${key}-x`),
        y: rnd(`${key}-y`),
        size: lerp(layer.size[0], layer.size[1], rnd(`${key}-size`)),
        period: lerp(layer.period[0], layer.period[1], rnd(`${key}-period`)),
        phase: rnd(`${key}-phase`),
        sway: lerp(layer.sway[0], layer.sway[1], rnd(`${key}-sway`)),
        swayPeriod: lerp(140, 380, rnd(`${key}-swayperiod`)),
        swayPhase: rnd(`${key}-swayphase`),
        flickerPeriod: lerp(14, 70, rnd(`${key}-flickperiod`)),
        flickerPhase: rnd(`${key}-flickphase`),
        opacity: layer.opacity * lerp(0.6, 1, rnd(`${key}-opacity`)),
        softness: layer.softness,
        depth,
      });
    }
  });
  return field;
};

export type ParticleAt = { x: number; y: number; opacity: number };

/** Where one particle is on one frame. Pure — same inputs, same pixel. */
export const particleAt = (
  spec: ParticleSpec,
  frame: number,
  style: ParticleStyle,
): ParticleAt => {
  const config = STYLE_CONFIG[style];
  const t = wrap01(spec.phase + frame / spec.period);
  const flicker =
    1 -
    config.flicker *
      (0.5 +
        0.5 * Math.sin(TAU * (frame / spec.flickerPeriod + spec.flickerPhase)));

  if (config.drift === 0) {
    // wisps orbit a fixed point instead of crossing the frame
    const angle = TAU * t;
    const breathe = 0.75 + 0.25 * Math.sin(TAU * (t + spec.swayPhase));
    return {
      x: spec.x * WIDTH + Math.cos(angle) * spec.sway,
      y: spec.y * HEIGHT + Math.sin(angle) * spec.sway * 0.55,
      opacity: spec.opacity * flicker * breathe,
    };
  }

  const span = HEIGHT + spec.size * 4;
  const travelled = config.drift === -1 ? 1 - t : t;
  const sway =
    Math.sin(TAU * (frame / spec.swayPeriod + spec.swayPhase)) * spec.sway;
  return {
    x: spec.x * WIDTH + sway,
    y: travelled * span - spec.size * 2,
    // fade in off one edge and out at the other so nothing pops at the wrap
    opacity: spec.opacity * flicker * Math.sin(Math.PI * t),
  };
};

// ---- cue bursts ----

/**
 * A burst is a window, not a trigger: `burstProgress` is 0 everywhere outside
 * [at, at + duration), which is what makes "no stray flickers" checkable.
 */
export type BurstKind = "spark" | "puff" | "shimmer";

export type Burst = {
  kind: BurstKind;
  /** absolute frame of the audio cue this burst rides */
  at: number;
  duration: number;
  x: number;
  y: number;
  /** stable seed for the burst's own particles */
  seed: string;
};

export const SPARK_FRAMES = 30;
export const PUFF_FRAMES = 26;
export const SHIMMER_FRAMES = 40;

/** 0 before the cue, 0 again once the window has run out. */
export const burstProgress = (frame: number, burst: Burst): number => {
  if (frame < burst.at || frame >= burst.at + burst.duration) return 0;
  return (frame - burst.at) / burst.duration;
};

export type BurstParticle = {
  x: number;
  y: number;
  size: number;
  opacity: number;
};

const SPARK_COUNT = 14;
const PUFF_COUNT = 10;

/** The particles of one burst on one frame — empty outside its window. */
export const burstParticles = (
  burst: Burst,
  frame: number,
  rnd: Rng,
): BurstParticle[] => {
  const progress = burstProgress(frame, burst);
  if (progress <= 0) return [];
  // fast in, long tail out
  const life = Math.sin(Math.PI * Math.pow(progress, 0.55));
  const spread = 1 - Math.pow(1 - progress, 3); // ease-out travel
  const count = burst.kind === "spark" ? SPARK_COUNT : PUFF_COUNT;
  const particles: BurstParticle[] = [];

  for (let index = 0; index < count; index++) {
    const key = `${burst.seed}-${index}`;
    if (burst.kind === "spark") {
      // a fan, not a full circle: the sparks come off the slam upward-ish
      const angle = Math.PI * (0.06 + 0.88 * rnd(`${key}-angle`)) + Math.PI;
      const distance = lerp(90, 300, rnd(`${key}-dist`));
      particles.push({
        x: burst.x + Math.cos(angle) * distance * spread,
        y:
          burst.y +
          Math.sin(angle) * distance * spread * 0.5 +
          // a little gravity on the tail
          70 * Math.pow(progress, 2.2),
        size: lerp(3, 7, rnd(`${key}-size`)),
        opacity: 0.55 * life,
      });
    } else {
      const angle = TAU * rnd(`${key}-angle`);
      const distance = lerp(30, 130, rnd(`${key}-dist`));
      particles.push({
        x: burst.x + Math.cos(angle) * distance * spread,
        y: burst.y + Math.sin(angle) * distance * spread * 0.45 - 26 * spread,
        size: lerp(10, 26, rnd(`${key}-size`)),
        opacity: 0.3 * life,
      });
    }
  }
  return particles;
};

/** The CTA sting's light band, as a 0..1 sweep across the frame. */
export const shimmerAt = (burst: Burst, frame: number) => {
  const progress = burstProgress(frame, burst);
  if (progress <= 0) return null;
  return {
    /** -0.35..1.35 of the frame width */
    position: lerp(-0.35, 1.35, progress),
    opacity: 0.5 * Math.sin(Math.PI * progress),
  };
};

// ---- hero aura (cold open) ----

/** Slow breath behind the hero art: 0..1, ~7s per cycle. */
export const auraBreath = (frame: number) =>
  0.5 + 0.5 * Math.sin(TAU * (frame / 210));
