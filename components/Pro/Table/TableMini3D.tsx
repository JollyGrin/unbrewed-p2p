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
 * TAPS. The canvas never takes pointer events (its transparent corners
 * reach over the neighbouring spaces). While the fighter is a target, an
 * ellipse inscribed in the model's projected box takes the tap instead, the
 * way the sprite's body does (#873); it bubbles to the anchor's onClick.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Box } from "@chakra-ui/react";
import { miniCamera, miniPixelRatio, miniPlaneTransform, miniPlateBox, type MiniCamera, type TableRig } from "@/lib/pro/minis3d/camera";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import type { MiniModel, ModelBounds } from "@/lib/pro/minis3d/model";
import { standingPose, type MiniPose } from "@/lib/pro/minis3d/pose";
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
    });
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  // At rest: one (scheduled) placement per change of anything the camera
  // reads — or of the hit area, which a placement sizes. The job itself
  // redraws only if the camera key changed.
  useLayoutEffect(() => {
    if (!animating) placeRef.current(standingPose(x, y));
  }, [animating, x, y, frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, screenScale, baseDiamPx, groundScale, model, mini.tint, mini.baseDiameter, maxPixelRatio, hitTarget]);

  // Tweening: follow the anchor's animated left/top, one sample a frame.
  useEffect(() => {
    if (!animating) return;
    const root = planeRef.current?.closest<HTMLElement>("[data-standee-root]");
    if (!root) return;
    let seen = "";
    const scheduler = minis3dScheduler();
    scheduler.track(key, () => {
      const sx = pct(root.style.left), sy = pct(root.style.top);
      const at = `${sx}|${sy}`;
      if (sx === null || sy === null || at === seen) return;
      seen = at;
      placeRef.current(standingPose(sx, sy));
    });
    return () => scheduler.untrack(key);
  }, [animating, key]);

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
