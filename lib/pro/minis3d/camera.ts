/**
 * WebGL minis spike (unbrewed-p2p-931) — the camera for one mini, derived from
 * the CSS tabletop rig so the WebGL render lands on exactly the pixels a real
 * 3D model standing on that space would cover.
 *
 * THE RIG (TableStage). The stage plane is `frameW × frameH`, turned by
 * `rotateY(yaw) rotateX(tilt)` about its centre, inside a box whose
 * `perspective` is `frameW · perspectiveRatio` seen from the box centre (the
 * default `perspective-origin`). In the box's own coordinates (CSS px, x right,
 * y DOWN, z toward the viewer) the eye is at (W/2, H/2, P).
 *
 * THE TRICK. A plane parallel to the screen is only uniformly scaled by CSS
 * perspective, never distorted. So the mini is drawn into a small canvas that
 * lies on such a plane at the piece's feet, and the WebGL camera sits at the
 * CSS eye with an off-axis frustum through that canvas's rectangle. What the
 * canvas shows is then the true perspective view of the model from the eye —
 * a mini at the near-left corner is seen from its left and from higher up
 * than one at the far right — and CSS places it with the same projection it
 * uses for the board. Nothing here is a hand-tuned angle.
 *
 * THE PLANE'S DEPTH. The canvas plane goes through the feet, then slides
 * `liftPx` toward the camera so its lowest row still stands above the board
 * surface (in a `preserve-3d` scene anything behind the board is hidden —
 * that is why the sprite path cuts its render in two, TableFigureSprite). Where
 * the plane sits does not change what it shows: the frustum is recomputed for
 * whichever plane it is.
 *
 * The rig is an INPUT (tilt, yaw, perspective ratio), never a constant read
 * here, so a tilt control can come later without touching this file.
 */

export type Vec3 = [number, number, number];

export interface TableRig {
  frameW: number;
  frameH: number;
  tiltDeg: number;
  yawDeg: number;
  /** `perspective` ÷ frameW (tableProjection PERSPECTIVE_RATIO). */
  perspectiveRatio: number;
}

/** A model's bounds in its own units, after its base has been put on y = 0. */
export interface ModelBounds {
  min: Vec3;
  max: Vec3;
  /** The base's diameter in model units — what spans the base disc. */
  footprint: number;
}

export interface MiniCameraInput {
  rig: TableRig;
  /** The feet, normalized on the board (0–1). */
  x: number;
  y: number;
  /** On-board diameter the model's base should span, px (the base disc). */
  baseDiamPx: number;
  bounds: ModelBounds;
  /** Turn about the model's own up axis, degrees (0 = faces the near edge). */
  facingDeg?: number;
}

export interface MiniCamera {
  /** The canvas rectangle on its plane, px from the plane's origin (the feet,
   *  slid `liftPx` toward the camera). */
  rect: { left: number; top: number; width: number; height: number };
  /** How far the canvas plane stands in front of the feet, px (CSS z). */
  liftPx: number;
  /** In three.js coordinates (x right, y UP, z toward the viewer = CSS with y
   *  flipped): the eye, and the off-axis frustum at `near` through the rect. */
  eye: Vec3;
  frustum: { left: number; right: number; top: number; bottom: number; near: number; far: number };
  /** Column-major 4×4 placing the model (glTF: y up, +z front) on the board,
   *  in three.js coordinates. Scale included. */
  model: number[];
  /** The board's up direction, three.js coordinates (for lights). */
  up: Vec3;
  /** Degrees above the board the eye sees this mini from — 90 − tilt at the
   *  centre, more toward the near edge, less toward the far one. */
  elevationDeg: number;
  /** Degrees the eye is to the mini's right (+) or left (−) of straight on. */
  azimuthDeg: number;
  /** How far the mini's upright axis leans off the screen vertical, degrees
   *  (+ = top to the right): what perspective does to a real upright here. */
  screenLeanDeg: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** CSS rotateY(a) · rotateX(t) applied to v — the stage plane's own rotation. */
const rotate = (v: Vec3, tilt: number, yaw: number): Vec3 => {
  const [x, y, z] = v;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // rotateX: [1 0 0; 0 c −s; 0 s c]
  const y1 = ct * y - st * z;
  const z1 = st * y + ct * z;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // rotateY: [c 0 s; 0 1 0; −s 0 c]
  return [cy * x + sy * z1, y1, -sy * x + cy * z1];
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const flipY = (a: Vec3): Vec3 => [a[0], -a[1], a[2]];

/** Pixels of empty margin around the model's projected box. */
const PAD_PX = 2;
/** Clearance of the canvas plane's lowest point above the board, px. */
const CLEAR_PX = 1;

export const miniCamera = ({ rig, x, y, baseDiamPx, bounds, facingDeg = 0 }: MiniCameraInput): MiniCamera => {
  const W = Math.max(1, rig.frameW), H = Math.max(1, rig.frameH);
  const t = rad(rig.tiltDeg), yw = rad(rig.yawDeg);
  const P = W * rig.perspectiveRatio;
  const eyeCss: Vec3 = [W / 2, H / 2, P];
  const centre: Vec3 = [W / 2, H / 2, 0];
  const feet = add(centre, rotate([(x - 0.5) * W, (y - 0.5) * H, 0], t, yw));

  // The board's axes in CSS space. A model's +x/+y/+z map onto right/up/near.
  const f = rad(facingDeg);
  const right = rotate([Math.cos(f), -Math.sin(f), 0], t, yw);
  const near = rotate([Math.sin(f), Math.cos(f), 0], t, yw);
  const up = rotate([0, 0, 1], t, yw);

  const k = baseDiamPx / Math.max(1e-9, bounds.footprint);
  const toCss = (m: Vec3): Vec3 => add(feet, add(mul(right, k * m[0]), add(mul(up, k * m[1]), mul(near, k * m[2]))));

  // The model's box, projected from the eye onto the screen-parallel plane
  // through the feet (z = feet.z): its extent on that plane.
  const project = (q: Vec3, planeZ: number): [number, number] => {
    const s = (eyeCss[2] - planeZ) / (eyeCss[2] - q[2]);
    return [eyeCss[0] + (q[0] - eyeCss[0]) * s, eyeCss[1] + (q[1] - eyeCss[1]) * s];
  };
  const corners: Vec3[] = [];
  for (const cx of [bounds.min[0], bounds.max[0]])
    for (const cy of [bounds.min[1], bounds.max[1]])
      for (const cz of [bounds.min[2], bounds.max[2]]) corners.push(toCss([cx, cy, cz]));

  const extent = (planeZ: number) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const c of corners) {
      const [px, py] = project(c, planeZ);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0: x0 - PAD_PX, x1: x1 + PAD_PX, y0: y0 - PAD_PX, y1: y1 + PAD_PX };
  };

  // Height above the board of a plane point (feet + (a, b, lift)): n·offset.
  // Solve for the lift that keeps the rect's worst corner CLEAR_PX above it.
  // One refinement pass: the rect shrinks slightly as the plane moves nearer.
  let lift = 0;
  let e = extent(feet[2]);
  for (let pass = 0; pass < 2; pass++) {
    let need = 0;
    for (const a of [e.x0 - feet[0], e.x1 - feet[0]])
      for (const b of [e.y0 - feet[1], e.y1 - feet[1]]) need = Math.max(need, (CLEAR_PX - up[0] * a - up[1] * b) / up[2]);
    lift = Math.max(0, need);
    e = extent(feet[2] + lift);
  }
  const planeZ = feet[2] + lift;

  const dist = eyeCss[2] - planeZ;
  const nearZ = 1;
  const toNear = nearZ / dist;
  const frustum = {
    left: (e.x0 - eyeCss[0]) * toNear,
    right: (e.x1 - eyeCss[0]) * toNear,
    top: -(e.y0 - eyeCss[1]) * toNear,
    bottom: -(e.y1 - eyeCss[1]) * toNear,
    near: nearZ,
    far: P * 4,
  };

  const r3 = mul(flipY(right), k), u3 = mul(flipY(up), k), n3 = mul(flipY(near), k), o3 = flipY(feet);
  const model = [...r3, 0, ...u3, 0, ...n3, 0, ...o3, 1];

  // Where the eye is, as seen standing on the mini (for the report).
  const toEye: Vec3 = add(eyeCss, mul(feet, -1));
  const len = Math.hypot(...toEye);
  const elevationDeg = (Math.asin(dot(toEye, up) / len) * 180) / Math.PI;
  const azimuthDeg = (Math.atan2(dot(toEye, right), dot(toEye, near)) * 180) / Math.PI;

  // The model's axis on screen (the perspective box's own plane, z = 0).
  const [ax, ay] = project(feet, 0);
  const [bx, by] = project(add(feet, mul(up, k * bounds.max[1])), 0);
  const screenLeanDeg = (Math.atan2(bx - ax, ay - by) * 180) / Math.PI;

  return {
    screenLeanDeg,
    rect: { left: e.x0 - feet[0], top: e.y0 - feet[1], width: e.x1 - e.x0, height: e.y1 - e.y0 },
    liftPx: lift,
    eye: flipY(eyeCss),
    frustum,
    model,
    up: flipY(up),
    elevationDeg,
    azimuthDeg,
  };
};

/**
 * The transform, applied at the feet INSIDE a standee's ground slot (which is
 * in the stage plane and scaled by the anchor's depth scale), that turns that
 * slot back into the screen-parallel frame `miniCamera` draws on: undo the
 * depth scale, undo the plane's rotation, slide toward the camera.
 */
export const miniPlaneTransform = (rig: Pick<TableRig, "tiltDeg" | "yawDeg">, groundScale: number, liftPx: number): string =>
  `scale(${(1 / (groundScale > 0 ? groundScale : 1)).toFixed(5)}) rotateX(${-rig.tiltDeg}deg) rotateY(${-rig.yawDeg}deg) translateZ(${liftPx.toFixed(2)}px)`;
