/**
 * 3D minis — PRESENTATION LAYER: a real 3D model standing on a piece, drawn
 * by the board's one shared WebGL renderer (lib/pro/minis3d/renderer) into
 * this piece's own small canvas (#931 approach A → #945).
 *
 * It lives in a standee's `ground` slot — at the feet, in the board plane —
 * and turns itself back into a screen-parallel plane there
 * (`miniPlaneTransform`), which is the plane `miniCamera` renders for. So
 * TableStandeeAnchor keeps everything it owns: position, move/swap tweens,
 * base disc, badges and click routing. Only this layer knows about pixels,
 * the CSS rig and the canvas; where the mini stands comes in as a pose in
 * board coordinates (lib/pro/minis3d/pose), the model from the model layer.
 *
 * REDRAWS go through the render scheduler, and only when the camera changes:
 * a new position, board size, tint or model, or a remount after the context
 * came back. During a move tween the anchor's `left`/`top` are animated by
 * framer-motion; a per-frame tracker reads them back and asks for a redraw
 * only when the piece actually moved. At rest nothing runs.
 *
 * MOTION (#962). Whole-body motion — hops along a walk, turning to face,
 * lunge, recoil, flinch, topple, the select lift and the placement drop —
 * is the motion layer's (lib/pro/minis3d/pose): this component only keeps a
 * `MiniMotion` timeline, feeds it the cues it is handed (`motion`), and while
 * anything is in flight samples it once a frame through the same tracker a
 * tween uses. The pose's feet are the anchor's own tweened left/top, so a
 * hop never leaves the base disc. When nothing is in flight the tracker is
 * dropped and no frame is requested; under prefers-reduced-motion every pose
 * is the plain standing one.
 *
 * TAPS. The canvas never takes pointer events (its transparent corners
 * reach over the neighbouring spaces). While the fighter is a target, an
 * ellipse inscribed in the model's projected box takes the tap instead, the
 * way the sprite's body does (#873); it bubbles to the anchor's onClick.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { useReducedMotion } from "framer-motion";
import { miniCamera, miniPixelRatio, miniPlaneTransform, miniPlateBox, type MiniCamera, type TableRig } from "@/lib/pro/minis3d/camera";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { MiniModel, ModelBounds } from "@/lib/pro/minis3d/model";
import {
  addClip,
  createMotion,
  DROP_MS,
  faceTo,
  FLINCH_MS,
  headingDeg,
  holdLift,
  REST_FACING_DEG,
  sampleMotion,
  setWalking,
  TOPPLE_MS,
  type MiniMotion,
  type MiniPose,
} from "@/lib/pro/minis3d/pose";
import { renderMini } from "@/lib/pro/minis3d/renderer";
import { minis3dScheduler } from "@/lib/pro/minis3d/scheduler";
import { useMiniModel, useMinis3dStatus } from "@/lib/pro/minis3d/useMinis3d";

/**
 * A piece's 3D mini, when one can be drawn right now: the renderer is up and
 * the model is decoded. null = draw the sprite (or token) instead — while
 * loading, when WebGL is off or lost, or when the file cannot be loaded.
 */
export const useTableMini3d = (mini: Mini3d | null, rig: TableRig | null): MiniModel | null => {
  const wanted = !!mini && !!rig;
  const status = useMinis3dStatus(wanted);
  const model = useMiniModel(wanted && status === "ready" ? mini!.url : null);
  return status === "ready" ? model : null;
};

/** A mini that first draws later than this after its piece mounted was not
 *  just placed — its model decoded late — so it does not drop in. */
export const DROP_WINDOW_MS = 500;

/**
 * The placement drop only on a real first placement (#962 review): the cues
 * a piece hands its TableMini3D, minus `dropIn` unless this is the first time
 * the mini draws for this piece AND it draws within DROP_WINDOW_MS of the
 * piece mounting. The piece outlives its TableMini3D, so a renderer restored
 * after a context loss (the mini remounts) or a model that decodes late never
 * replays the drop. Called by the piece, with whether it draws a mini now.
 */
export const usePlacementDrop = (motion: MiniMotionCues | null, drawing: boolean): MiniMotionCues | null => {
  const s = useRef<{ mountedAt: number; phase: "never" | "first" | "done"; ok: boolean } | null>(null);
  if (!s.current) s.current = { mountedAt: performance.now(), phase: "never", ok: false };
  const st = s.current;
  if (drawing && st.phase === "never") {
    st.phase = "first";
    st.ok = performance.now() - st.mountedAt <= DROP_WINDOW_MS;
  } else if (!drawing && st.phase === "first") {
    st.phase = "done";
    st.ok = false;
  }
  return motion?.dropIn && !st.ok ? { ...motion, dropIn: false } : motion;
};

/**
 * The model's bounds as the camera sizes them: its base spans the disc by the
 * manifest's `baseDiameter` (the visible base, default 1.0), not by the
 * pipeline's enclosing-circle footprint.
 */
export const miniBounds = (model: MiniModel, mini: Pick<Mini3d, "baseDiameter">): ModelBounds => ({
  ...model.bounds,
  footprint: mini.baseDiameter,
});

/**
 * The upright plate a 3D mini's badges hang off, px in plate units: the
 * model's own projected box at rest (#929), never smaller than the flat
 * token's strip (`minW`, `minH`).
 */
export const mini3dPlateSize = (
  model: MiniModel,
  mini: Pick<Mini3d, "baseDiameter">,
  rig: TableRig,
  pose: MiniPose,
  baseDiamPx: number,
  groundScale: number,
  minW: number,
  minH: number
): { widthPx: number; heightPx: number } => {
  const cam = miniCamera({ rig, pose, baseDiamPx: baseDiamPx * groundScale, bounds: miniBounds(model, mini) });
  const box = miniPlateBox(cam, groundScale);
  return { widthPx: Math.max(minW, 2 * box.halfWidth), heightPx: Math.max(minH, box.height) };
};

/** A one-shot combat beat: played once per `key`, `delayMs` after it first
 *  arrives, over `durMs` (the combat panel's own paced durations). */
export interface MiniBeatCue {
  key: string;
  delayMs: number;
  durMs: number;
  /** Scales the swing (a harder hit knocks back further). Default 1. */
  strength?: number;
}

/**
 * What the board wants a mini to do right now (#962). Everything is optional;
 * `{}` is a mini standing still. Fighter-agnostic: nothing here knows a hero.
 */
export interface MiniMotionCues {
  /** Drop onto the base when the mini first appears. */
  dropIn?: boolean;
  /** Selected or targetable: float a little. */
  held?: boolean;
  /** Face this board point (the combat opponent); null = the resting facing. */
  faceToward?: { x: number; y: number } | null;
  /** Attacker's lunge toward whom it faces. */
  lunge?: MiniBeatCue | null;
  /** Defender tipping back away from the attacker. */
  recoil?: MiniBeatCue | null;
  /** HP dropped: a short shake (keyed by the damage beat). */
  flinch?: { key: string } | null;
  /** Defeated: tip over and fade (`delayMs` after it first arrives). */
  topple?: { key: string; delayMs?: number } | null;
}

/** A tween's path when it is a walk — a swap's crossfade (it carries
 *  opacity keyframes) is a teleport, and never hops. */
export const mini3dWalk = (anim: { xs: number[]; ys: number[]; opacity?: number[] } | null | undefined) =>
  anim && !anim.opacity && anim.xs.length > 1 ? { xs: anim.xs, ys: anim.ys } : null;

export interface TableMini3DProps {
  mini: Mini3d;
  model: MiniModel;
  rig: TableRig;
  /** The feet, normalized on the board — the anchor's resting x/y. */
  x: number;
  y: number;
  /** The base disc's unscaled diameter, px; the model spans it × `groundScale`. */
  baseDiamPx: number;
  /** The ground slot's own depth scale (`placeStandee(...).scale`), undone here. */
  groundScale: number;
  /** A move/swap tween is playing: follow the anchor frame by frame. */
  animating: boolean;
  /** The tween's path when it is a WALK (not a swap's crossfade): the mini
   *  hops once per segment and faces along it. */
  walk?: { xs: number[]; ys: number[] } | null;
  /** Motion cues (#962); absent = stand still. */
  motion?: MiniMotionCues | null;
  /** The standee's highlight filter (selected / friendly glow). */
  filter?: string;
  /** A CSS animation for the canvas (the target pulse; Emotion keyframes
   *  welcome — the canvas is a Chakra box). Off under reduced motion. */
  animation?: string;
  /** Let the body take taps (#873) — only while the fighter is a target. */
  hitTarget?: boolean;
  /** Canvas pixel-ratio cap (the dev switch's `?minis3dDpr=`). */
  maxPixelRatio?: number | null;
  /** Put on the canvas (e.g. `data-fighter-id`). */
  canvasAttrs?: Record<string, string>;
}

const pct = (v: string): number | null => {
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  return m ? Number(m[1]) / 100 : null;
};

/** What a draw depends on, rounded: equal keys draw the same pixels (the
 *  backing size `w × h` carries the density bucket). */
const camKey = (cam: MiniCamera, w: number, h: number, tint: string, url: string) =>
  [cam.rect.left, cam.rect.top, cam.liftPx, ...cam.model].map((v) => v.toFixed(3)).join(",") + `|${w}x${h}|${tint}|${url}`;

export const TableMini3D = ({
  mini,
  model,
  rig,
  x,
  y,
  baseDiamPx,
  groundScale,
  animating,
  walk = null,
  motion = null,
  filter,
  animation,
  hitTarget = false,
  maxPixelRatio,
  canvasAttrs,
}: TableMini3DProps) => {
  const planeRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitRef = useRef<HTMLDivElement | null>(null);
  // This mini's identity in the scheduler, and what it last drew.
  const key = useMemo(() => ({}), []);
  const last = useRef({ key: "" });

  const { frameW, frameH, tiltDeg, yawDeg, perspectiveRatio } = rig;
  const screenScale = rig.screenScale ?? 1;
  /** Ask the scheduler for a redraw at `pose` — skipped when nothing changed. */
  const place = (pose: MiniPose) => {
    if (!(frameW > 0)) return;
    const cam = miniCamera({
      rig: { frameW, frameH, tiltDeg, yawDeg, perspectiveRatio },
      pose,
      // The base disc carries the anchor's depth scale (#926), so the model's
      // base spans the disc AS DRAWN: its diameter times that same scale.
      baseDiamPx: baseDiamPx * groundScale,
      bounds: miniBounds(model, mini),
    });
    minis3dScheduler().request(key, () => {
      const plane = planeRef.current, canvas = canvasRef.current, hit = hitRef.current;
      if (!plane || !canvas) return;
      const opacity = pose.opacity === undefined || pose.opacity >= 1 ? "" : pose.opacity.toFixed(3);
      if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity;
      plane.style.transform = miniPlaneTransform({ tiltDeg, yawDeg }, groundScale, cam.liftPx);
      for (const el of hit ? [canvas, hit] : [canvas]) {
        el.style.left = `${cam.rect.left}px`;
        el.style.top = `${cam.rect.top}px`;
        el.style.width = `${cam.rect.width}px`;
        el.style.height = `${cam.rect.height}px`;
      }
      // Backing store at the canvas's on-screen density: device pixels
      // (capped) times the plane's on-screen scale — the pan/zoom frame's live
      // scale times the perspective at the plane's depth. Computed, never
      // measured: no layout reads, and it follows every zoom (the pick
      // auto-focus, a pinch) through the density bucket in the camera key.
      const ratio = miniPixelRatio(window.devicePixelRatio || 1, screenScale * cam.planeScale, maxPixelRatio ?? undefined);
      const w = Math.max(1, Math.round(cam.rect.width * ratio)), h = Math.max(1, Math.round(cam.rect.height * ratio));
      const k = camKey(cam, w, h, mini.tint, model.url);
      if (k === last.current.key) return;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      if (renderMini(canvas, model, cam, mini.tint) === null) return;
      last.current.key = k;
      canvas.dataset.elevDeg = cam.elevationDeg.toFixed(1);
      canvas.dataset.azDeg = cam.azimuthDeg.toFixed(1);
      canvas.dataset.leanDeg = cam.screenLeanDeg.toFixed(2);
      // The pose it drew (probes and tests read these).
      canvas.dataset.poseLift = pose.lift.toFixed(3);
      canvas.dataset.poseFacing = pose.facingDeg.toFixed(1);
      canvas.dataset.poseLean = pose.leanDeg.toFixed(1);
    });
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // ---- motion (#962): the timeline, its inputs, and the one sampler.
  const reduced = !!useReducedMotion();
  const motionRef = useRef<MiniMotion | null>(null);
  // (Not `??=`: this repo's SWC build leaves a helper undeclared for it.)
  if (!motionRef.current) motionRef.current = createMotion(performance.now());
  const aspect = frameW > 0 && frameH > 0 ? frameW / frameH : 1;
  const walkPath = animating && walk && walk.xs.length > 1 ? walk : null;
  const input = useRef({ x, y, animating, walkPath, aspect, baseX: 0, baseY: 0, reduced });
  input.current = {
    x,
    y,
    animating,
    walkPath,
    aspect,
    // One base diameter in board units: a clip's slide is measured in these.
    baseX: frameW > 0 ? baseDiamPx / frameW : 0,
    baseY: frameH > 0 ? baseDiamPx / frameH : 0,
    reduced,
  };
  const tracking = useRef(false);
  const seenAt = useRef<{ x: number; y: number } | null>(null);

  /** Sample the timeline now and place that pose. Returns whether anything
   *  is still in flight (a tween counts). */
  const sampleNow = (): boolean => {
    const inp = input.current;
    let at = { x: inp.x, y: inp.y };
    if (inp.animating) {
      const root = planeRef.current?.closest<HTMLElement>("[data-standee-root]");
      const sx = root ? pct(root.style.left) : null, sy = root ? pct(root.style.top) : null;
      // Not tweened yet this frame: hold where it was drawn last.
      if (sx === null || sy === null) {
        if (seenAt.current) at = seenAt.current;
      } else at = { x: sx, y: sy };
    }
    seenAt.current = at;
    const frame = sampleMotion(motionRef.current!, performance.now(), {
      at,
      path: inp.walkPath,
      aspect: inp.aspect,
      base: { x: inp.baseX, y: inp.baseY },
      reduced: inp.reduced,
    });
    motionRef.current = frame.next;
    placeRef.current(frame.pose);
    return frame.busy || inp.animating;
  };
  const sampleRef = useRef(sampleNow);
  sampleRef.current = sampleNow;

  /** Place the current pose, and keep sampling every frame while anything
   *  moves. The tracker drops itself once all is still: at rest, no frames. */
  const run = () => {
    const busy = sampleRef.current();
    if (!busy || tracking.current) return;
    tracking.current = true;
    const scheduler = minis3dScheduler();
    scheduler.track(key, () => {
      if (sampleRef.current()) return;
      scheduler.untrack(key);
      tracking.current = false;
    });
  };
  const runRef = useRef(run);
  runRef.current = run;

  // Feed the cues into the timeline. Runs every render but only touches the
  // timeline (and starts sampling) when a cue actually changed; a beat's key
  // plays once, even across re-renders.
  const seenBeats = useRef(new Set<string>());
  const dropped = useRef(false);
  const primed = useRef(false);
  const faceX = motion?.faceToward?.x, faceY = motion?.faceToward?.y;
  useLayoutEffect(() => {
    const before = motionRef.current!;
    const now = performance.now();
    let m = before;
    const beats: [string, () => MiniMotion][] = [];
    const beat = (cue: MiniBeatCue | null | undefined, kind: "lunge" | "recoil") =>
      cue && beats.push([`${kind}:${cue.key}`, () => addClip(m, kind, now, cue.durMs, cue.delayMs, cue.strength ?? 1)]);
    beat(motion?.lunge, "lunge");
    beat(motion?.recoil, "recoil");
    if (motion?.flinch) beats.push([`flinch:${motion.flinch.key}`, () => addClip(m, "flinch", now, FLINCH_MS)]);
    if (motion?.topple) beats.push([`topple:${motion.topple.key}`, () => addClip(m, "topple", now, TOPPLE_MS, motion.topple!.delayMs ?? 0)]);
    if (!dropped.current && motion?.dropIn) {
      dropped.current = true;
      if (!reduced) m = addClip(m, "drop", now, DROP_MS);
    }
    for (const [id, play] of beats) {
      if (seenBeats.current.has(id)) continue;
      seenBeats.current.add(id);
      // Reduced motion: marked seen (never replayed later), never played.
      if (!reduced) m = play();
    }
    const rest =
      faceX === undefined || faceY === undefined ? REST_FACING_DEG : headingDeg(faceX - x, faceY - y, aspect);
    m = setWalking(m, !!walkPath && !reduced, now, rest);
    if (!primed.current) {
      // A mini that appears already facing someone stands that way at once.
      primed.current = true;
      m = { ...m, turn: { from: rest, to: rest, start: now, dur: 0 } };
    } else if (!m.walking) m = faceTo(m, rest, now);
    m = holdLift(m, !!motion?.held, now);
    if (m !== before) {
      motionRef.current = m;
      runRef.current();
    }
  });

  // At rest: one (scheduled) placement per change of anything the camera
  // reads — or of the hit area, which a placement sizes. The job itself
  // redraws only if the camera key changed. A tween (or motion) keeps the
  // sampler running until it settles.
  useLayoutEffect(() => {
    runRef.current();
  }, [animating, x, y, frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale, baseDiamPx, groundScale, model, mini.tint, mini.baseDiameter, maxPixelRatio, hitTarget, reduced]);

  useEffect(
    () => () => {
      tracking.current = false;
    },
    []
  );
  useEffect(() => () => minis3dScheduler().cancel(key), [key]);

  return (
    <div
      ref={planeRef}
      data-mini3d={mini.id}
      style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0 0", transformStyle: "preserve-3d", pointerEvents: "none" }}
    >
      <Box
        as="canvas"
        ref={canvasRef}
        data-mini3d-canvas=""
        {...canvasAttrs}
        position="absolute"
        pointerEvents="none"
        filter={filter}
        animation={animation}
        sx={{ "@media (prefers-reduced-motion: reduce)": { animation: "none" } }}
      />
      {hitTarget && (
        <div
          ref={hitRef}
          data-mini3d-hit=""
          // Inscribed in the projected box: the body, not its empty corners.
          style={{ position: "absolute", borderRadius: "50%", pointerEvents: "auto" }}
        />
      )}
    </div>
  );
};
