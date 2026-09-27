/**
 * 3D minis — MOTION LAYER: where a mini stands and how it holds itself, in
 * BOARD coordinates. Never CSS pixels, never DOM reads — pure, so motion set 1
 * (walks, lunges, knock-backs) slots in here as functions of time that return
 * a pose, and the presentation layer draws whatever pose it is handed.
 *
 *   x, y       the feet, normalized on the board (0–1), as every other piece
 *   facingDeg  turn about the model's own up axis (0 = faces the near edge)
 *   lift       how far the model floats above its base, in MODEL units
 *   leanDeg    tip about the model's own right axis (+ = top toward its front)
 *
 * This ticket only needs the pose of a mini standing still (`standingPose`).
 */
export interface MiniPose {
  x: number;
  y: number;
  facingDeg: number;
  lift: number;
  leanDeg: number;
}

export const standingPose = (x: number, y: number, facingDeg = 0): MiniPose => ({ x, y, facingDeg, lift: 0, leanDeg: 0 });
