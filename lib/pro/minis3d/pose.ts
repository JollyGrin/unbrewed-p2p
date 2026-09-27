/**
 * 3D minis — MOTION LAYER: where a mini stands and how it holds itself, in
 * BOARD coordinates. Never CSS pixels, never DOM reads, never React — pure, so
 * every motion is a function of time that returns a pose, and the
 * presentation layer (TableMini3D) draws whatever pose it is handed.
 *
 *   x, y       the feet, normalized on the board (0–1), as every other piece
 *   facingDeg  turn about the model's own up axis (0 = faces the near edge,
 *              +90 = faces board +x; see `headingDeg`)
 *   lift       how far the model floats above its base, in MODEL units (the
 *              pipeline normalises a mini's base to 1 unit wide)
 *   leanDeg    tip about the model's own right axis (+ = top toward its front)
 *   opacity    0–1; only the defeat topple fades
 *
 * MOTION SET 1 (#962). The models have no rig, so every motion moves the
 * whole body:
 *
 *   walk     one hop per space along a move path. The feet ARE the anchor's
 *            tweened position (read back each frame) — the curve only adds
 *            lift and heading, so the mini never leaves its base disc.
 *   turn     facing eases to the move direction / the combat opponent, and
 *            back to rest afterwards.
 *   clips    one-shot curves over t ∈ [0, 1]: lunge, recoil, flinch, topple,
 *            drop. Each returns a delta (forward slide, lift, lean, fade).
 *   held     a small lift while the fighter is selected or targetable.
 *
 * `MiniMotion` is the timeline that composes them — a plain object that
 * `sampleMotion` reads and the cue functions below replace (never mutate).
 * Under reduced motion nothing plays: `sampleMotion` returns the plain
 * standing pose and reports itself idle.
 */
export interface MiniPose {
  x: number;
  y: number;
  facingDeg: number;
  lift: number;
  leanDeg: number;
  /** 1 when absent. */
  opacity?: number;
}

export const standingPose = (x: number, y: number, facingDeg = 0): MiniPose => ({ x, y, facingDeg, lift: 0, leanDeg: 0 });

/** Where a mini faces when nothing is happening (toward the near edge). */
export const REST_FACING_DEG = 0;

// ---------------------------------------------------------------- shapes

const clamp01 = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => {
  const u = clamp01(t);
  return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
};
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 2;
const easeIn = (t: number) => clamp01(t) ** 2;
/** 0 → 1 → 0 over t, smooth at both ends. */
const bump = (t: number) => Math.sin(Math.PI * clamp01(t));

/** Wrap an angle into (-180, 180]. */
export const wrapDeg = (d: number) => {
  const w = ((((d + 180) % 360) + 360) % 360) - 180;
  return w === -180 ? 180 : w;
};

/**
 * The facing that looks along a board-space direction. `aspect` is the
 * board's width / height: x and y are normalized separately, so a step of
 * 0.1 in x is longer on screen than 0.1 in y on a wide board.
 */
export const headingDeg = (dx: number, dy: number, aspect = 1): number =>
  (Math.atan2(dx * aspect, dy) * 180) / Math.PI;

/** Turn from `from` to `to` the short way round, at eased progress t. */
export const turnDeg = (from: number, to: number, t: number) => wrapDeg(from + wrapDeg(to - from) * easeInOut(t));

// ---------------------------------------------------------------- walk

/** How high one hop lifts the mini, model units (base = 1 wide). */
export const HOP_LIFT = 0.22;
/** A walking mini leans into its step, at most this much. */
export const WALK_LEAN_DEG = 6;
/** The share of a segment, at each end, over which the heading blends into
 *  the next segment's — so a turn at a corner is a swivel, not a snap. */
const CORNER_BLEND = 0.2;

export interface PathProgress {
  /** The segment the feet are on: from node `seg` to node `seg + 1`. */
  seg: number;
  /** How far along it (0 at node `seg`, 1 at the next), by distance. */
  u: number;
}

/**
 * Where the feet `at` are along a polyline path (board coordinates): the
 * nearest segment and the distance fraction along it. The anchor's tween
 * moves on straight lines between nodes (framer-motion eases each keyframe
 * segment on its own), so the fraction by DISTANCE lands exactly on the
 * nodes the tween passes, whatever its easing — which is what keeps each hop
 * landing on a space. `hint` is the last segment seen: a path that doubles
 * back over itself resolves to the segment the walk is actually on.
 */
export const pathProgress = (xs: number[], ys: number[], at: { x: number; y: number }, aspect = 1, hint = 0): PathProgress => {
  const n = Math.min(xs.length, ys.length) - 1;
  if (n < 1) return { seg: 0, u: 0 };
  let best: PathProgress = { seg: 0, u: 0 };
  let bestD = Infinity;
  for (let k = 0; k < n; k++) {
    // Search from the hint forward first, wrapping — the first near-exact hit wins.
    const i = (Math.max(0, Math.min(n - 1, hint)) + k) % n;
    const ax = xs[i] * aspect, ay = ys[i], bx = xs[i + 1] * aspect, by = ys[i + 1];
    const px = at.x * aspect, py = at.y;
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const u = len2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / len2) : 1;
    const d = Math.hypot(ax + vx * u - px, ay + vy * u - py);
    if (d < bestD - 1e-9) {
      bestD = d;
      best = { seg: i, u };
      if (d < 1e-6 && len2 > 0) break;
    }
  }
  return best;
};

const segHeading = (xs: number[], ys: number[], i: number, aspect: number) =>
  headingDeg(xs[i + 1] - xs[i], ys[i + 1] - ys[i], aspect);

/**
 * The walking pose at the anchor's position `at`: feet exactly there, one
 * hop per segment (0 on every node), facing along the segment and swivelling
 * through each corner.
 */
export const walkPose = (xs: number[], ys: number[], at: { x: number; y: number }, aspect = 1, hint = 0): MiniPose & PathProgress => {
  const n = Math.min(xs.length, ys.length) - 1;
  if (n < 1) return { ...standingPose(at.x, at.y), seg: 0, u: 0 };
  const { seg, u } = pathProgress(xs, ys, at, aspect, hint);
  let facing = segHeading(xs, ys, seg, aspect);
  if (u > 1 - CORNER_BLEND && seg < n - 1) {
    facing = turnDeg(facing, segHeading(xs, ys, seg + 1, aspect), ((u - (1 - CORNER_BLEND)) / CORNER_BLEND) * 0.5);
  } else if (u < CORNER_BLEND && seg > 0) {
    facing = turnDeg(segHeading(xs, ys, seg - 1, aspect), facing, 0.5 + (u / CORNER_BLEND) * 0.5);
  }
  const hop = bump(u);
  return { x: at.x, y: at.y, facingDeg: facing, lift: HOP_LIFT * hop, leanDeg: WALK_LEAN_DEG * hop, seg, u };
};

// ---------------------------------------------------------------- clips

/** What a clip adds to the standing pose. `fwd` slides the feet along the
 *  facing, in base diameters (kept well inside the disc's 0.5 radius). */
export interface PoseDelta {
  fwd: number;
  lift: number;
  leanDeg: number;
  opacity: number;
}

/** Attack lunge: a short wind-back, a thrust that peaks at t = 0.44 (the
 *  combat panel's contact moment — `strikeContactDelay` is 44% into the
 *  lunge), a brief hold and an eased return. */
export const LUNGE_LEAN_DEG = 22;
export const LUNGE_FWD = 0.2;
export const lungeDelta = (t: number, strength = 1): PoseDelta => {
  const u = clamp01(t);
  let k: number;
  if (u < 0.2) k = -0.25 * easeOut(u / 0.2); // wind back
  else if (u < 0.44) k = lerp(-0.25, 1, easeIn((u - 0.2) / 0.24)); // thrust, fastest at contact
  else if (u < 0.55) k = 1; // hold on contact
  else k = 1 - easeInOut((u - 0.55) / 0.45); // return
  return { fwd: LUNGE_FWD * strength * k, lift: 0.06 * strength * Math.max(0, k), leanDeg: LUNGE_LEAN_DEG * strength * k, opacity: 1 };
};

/** Defender recoil: snaps back away from the attacker (it faces the
 *  attacker, so "back" is a negative lean) and eases upright again. */
export const RECOIL_LEAN_DEG = 20;
export const RECOIL_FWD = 0.14;
export const recoilDelta = (t: number, strength = 1): PoseDelta => {
  const u = clamp01(t);
  const k = u < 0.18 ? easeOut(u / 0.18) : 1 - easeInOut((u - 0.18) / 0.82);
  return { fwd: -RECOIL_FWD * strength * k, lift: 0.04 * strength * k, leanDeg: -RECOIL_LEAN_DEG * strength * k, opacity: 1 };
};

/** Damage flinch: a quick decaying shake (three wobbles). */
export const FLINCH_LEAN_DEG = 9;
export const flinchDelta = (t: number): PoseDelta => {
  const u = clamp01(t);
  const decay = (1 - u) ** 2;
  return { fwd: 0, lift: 0, leanDeg: FLINCH_LEAN_DEG * Math.sin(2 * Math.PI * 3 * u) * decay, opacity: 1 };
};

/** Defeat topple: tips over backwards under gravity (accelerating), a small
 *  bounce where it hits the board, and fades out over the second half. */
export const TOPPLE_LEAN_DEG = 88;
export const toppleDelta = (t: number): PoseDelta => {
  const u = clamp01(t);
  const fall = u < 0.55 ? easeIn(u / 0.55) : 1 - 0.08 * bump((u - 0.55) / 0.2) * (u < 0.75 ? 1 : 0);
  return {
    fwd: -0.12 * clamp01(u / 0.55),
    lift: 0,
    leanDeg: -TOPPLE_LEAN_DEG * fall,
    opacity: u < 0.5 ? 1 : 1 - easeIn((u - 0.5) / 0.5),
  };
};

/** Placement drop: falls onto its base from `DROP_LIFT` and bounces once. */
export const DROP_LIFT = 0.7;
export const dropDelta = (t: number): PoseDelta => {
  const u = clamp01(t);
  const lift = u < 0.7 ? DROP_LIFT * (1 - easeIn(u / 0.7)) : 0.08 * bump((u - 0.7) / 0.3);
  return { fwd: 0, lift, leanDeg: 0, opacity: u < 0.3 ? easeOut(u / 0.3) : 1 };
};

export type MiniClipKind = "lunge" | "recoil" | "flinch" | "topple" | "drop";
const CLIP: Record<MiniClipKind, (t: number, strength: number) => PoseDelta> = {
  lunge: lungeDelta,
  recoil: recoilDelta,
  flinch: (t) => flinchDelta(t),
  topple: (t) => toppleDelta(t),
  drop: (t) => dropDelta(t),
};

/** Default clip lengths, ms. Lunge and recoil take the combat panel's own
 *  (paced) durations from the cue instead; these stay inside the board's
 *  existing beats (the −N / K.O. overlay lives 1.6 s). */
export const FLINCH_MS = 400;
export const TOPPLE_MS = 900;
export const DROP_MS = 380;

// ---------------------------------------------------------------- timeline

/** A selected / targetable mini floats this much, model units. */
export const HELD_LIFT = 0.12;
export const HELD_MS = 160;
/** A 180° turn takes this long; smaller turns are shorter (never under 40%). */
export const TURN_MS = 320;

interface Ramp {
  from: number;
  to: number;
  start: number;
  dur: number;
}
export interface MiniClip {
  kind: MiniClipKind;
  start: number;
  dur: number;
  strength: number;
}
export interface MiniMotion {
  clips: MiniClip[];
  turn: Ramp;
  held: Ramp;
  /** Walking right now (an anchor tween with a path). */
  walking: boolean;
  /** The last walk heading and path segment, for the settle turn / hint. */
  walkFacing: number;
  walkSeg: number;
}

const rampAt = (r: Ramp, now: number) => (r.dur > 0 ? lerp(r.from, r.to, easeInOut((now - r.start) / r.dur)) : r.to);
const rampDone = (r: Ramp, now: number) => now >= r.start + r.dur;
const facingAt = (r: Ramp, now: number) => (r.dur > 0 ? turnDeg(r.from, r.to, (now - r.start) / r.dur) : r.to);

export const createMotion = (now: number, facing = REST_FACING_DEG): MiniMotion => ({
  clips: [],
  turn: { from: facing, to: facing, start: now, dur: 0 },
  held: { from: 0, to: 0, start: now, dur: 0 },
  walking: false,
  walkFacing: facing,
  walkSeg: 0,
});

/** Play a one-shot clip `delayMs` from `now`. */
export const addClip = (m: MiniMotion, kind: MiniClipKind, now: number, durMs: number, delayMs = 0, strength = 1): MiniMotion => ({
  ...m,
  clips: [...m.clips, { kind, start: now + Math.max(0, delayMs), dur: Math.max(1, durMs), strength }],
});

/** The facing a mini holds right now (walking: along its path). */
export const currentFacing = (m: MiniMotion, now: number) => (m.walking ? m.walkFacing : facingAt(m.turn, now));

/** Turn to face `deg` (no-op when already turning there). */
export const faceTo = (m: MiniMotion, deg: number, now: number): MiniMotion => {
  if (Math.abs(wrapDeg(m.turn.to - deg)) < 0.5) return m;
  const from = currentFacing(m, now);
  const dur = TURN_MS * Math.max(0.4, Math.abs(wrapDeg(deg - from)) / 180);
  return { ...m, turn: { from, to: deg, start: now, dur } };
};

/** Hold (or release) the select lift. */
export const holdLift = (m: MiniMotion, on: boolean, now: number): MiniMotion => {
  const to = on ? HELD_LIFT : 0;
  if (m.held.to === to) return m;
  return { ...m, held: { from: rampAt(m.held, now), to, start: now, dur: HELD_MS } };
};

/** A walk started (true) or settled (false). Settling turns from the last
 *  walk heading to `restDeg`. */
export const setWalking = (m: MiniMotion, walking: boolean, now: number, restDeg: number): MiniMotion => {
  if (m.walking === walking) return m;
  if (walking) return { ...m, walking: true, walkFacing: facingAt(m.turn, now), walkSeg: 0 };
  const settled: MiniMotion = { ...m, walking: false, turn: { from: m.walkFacing, to: m.walkFacing, start: now, dur: 0 } };
  return faceTo(settled, restDeg, now);
};

export interface MotionFrame {
  pose: MiniPose;
  /** Something is still moving: sample again next frame. */
  busy: boolean;
  /** The motion with finished clips dropped and walk progress recorded. */
  next: MiniMotion;
}

export interface MotionInput {
  /** Where the feet are now: the anchor's tweened position while walking,
   *  its resting x/y otherwise. */
  at: { x: number; y: number };
  /** The walk's path (the anchor's keyframes), while walking. */
  path?: { xs: number[]; ys: number[] } | null;
  /** Board width / height. */
  aspect: number;
  /** One base diameter in board units, x and y (for a clip's slide). */
  base: { x: number; y: number };
  /** prefers-reduced-motion: every motion is off. */
  reduced: boolean;
}

/**
 * THE sampler: the pose at `now`, composed from the walk (or the turn), the
 * held lift and every clip in flight. Pure — the caller keeps `next`.
 */
export const sampleMotion = (m: MiniMotion, now: number, input: MotionInput): MotionFrame => {
  const { at, path, aspect, base, reduced } = input;
  if (reduced) return { pose: standingPose(at.x, at.y), busy: false, next: m };

  let next = m;
  let pose: MiniPose;
  if (m.walking && path && path.xs.length > 1) {
    const w = walkPose(path.xs, path.ys, at, aspect, m.walkSeg);
    pose = { x: w.x, y: w.y, facingDeg: w.facingDeg, lift: w.lift, leanDeg: w.leanDeg };
    next = { ...next, walkFacing: w.facingDeg, walkSeg: w.seg };
  } else {
    pose = standingPose(at.x, at.y, currentFacing(m, now));
  }
  pose.lift += rampAt(m.held, now);

  let fwd = 0, opacity = 1;
  const live: MiniClip[] = [];
  for (const c of m.clips) {
    const t = (now - c.start) / c.dur;
    if (t >= 1) {
      // A topple ends lying down and faded out, not standing again.
      if (c.kind === "topple") {
        const d = CLIP.topple(1, 1);
        fwd += d.fwd;
        pose.leanDeg += d.leanDeg;
        opacity *= d.opacity;
        live.push(c);
      }
      continue;
    }
    live.push(c);
    if (t < 0) continue;
    const d = CLIP[c.kind](t, c.strength);
    fwd += d.fwd;
    pose.lift += d.lift;
    pose.leanDeg += d.leanDeg;
    opacity *= d.opacity;
  }
  if (fwd !== 0) {
    const f = (pose.facingDeg * Math.PI) / 180;
    pose.x += Math.sin(f) * fwd * base.x;
    pose.y += Math.cos(f) * fwd * base.y;
  }
  if (opacity !== 1) pose.opacity = opacity;
  if (live.length !== m.clips.length) next = { ...next, clips: live };

  const busy =
    (m.walking && !!path) ||
    !rampDone(m.turn, now) ||
    !rampDone(m.held, now) ||
    live.some((c) => c.kind !== "topple" || now < c.start + c.dur);
  return { pose, busy, next };
};
