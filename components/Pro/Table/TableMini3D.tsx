/**
 * WebGL minis spike (unbrewed-p2p-931): a real 3D model standing on a piece,
 * drawn by the shared renderer (lib/pro/minis3d/renderer) into a small canvas.
 *
 * It lives in the standee's `ground` slot — at the feet, in the board plane —
 * and turns itself back into a screen-parallel plane there
 * (`miniPlaneTransform`), which is the plane `miniCamera` renders for. So
 * TableStandeeAnchor keeps everything it owns: position, move/swap tweens,
 * base disc, badges and click routing. The canvas takes no pointer events.
 *
 * REDRAWS. Only when the camera changes: a new position, board size, tint or
 * model, or the renderer coming back after a lost context. During a move tween
 * the anchor's `left`/`top` are animated by framer-motion; a rAF loop reads
 * them back and redraws each frame the piece actually moved, then stops.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { miniCamera, miniPlaneTransform, type MiniCamera, type TableRig } from "@/lib/pro/minis3d/camera";
import type { Mini3d } from "@/lib/pro/minis3d/manifest";
import {
  ensureMinis3d,
  getMinis3dStatus,
  loadMiniModel,
  renderMini,
  subscribeMinis3d,
  type MiniModel,
  type Minis3dStatus,
} from "@/lib/pro/minis3d/renderer";

/** The shared renderer's status; starts it the first time `enabled`. */
export const useMinis3dStatus = (enabled: boolean): Minis3dStatus => {
  const status = useSyncExternalStore(subscribeMinis3d, getMinis3dStatus, () => "idle" as Minis3dStatus);
  useEffect(() => {
    if (enabled) void ensureMinis3d();
  }, [enabled]);
  return status;
};

export interface TableMini3DProps {
  mini: Mini3d;
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
  /** The standee's highlight filter (selected / friendly / target glow). */
  filter?: string;
}

const pct = (v: string): number | null => {
  const m = /^(-?[\d.]+)%$/.exec(v.trim());
  return m ? Number(m[1]) / 100 : null;
};

export const TableMini3D = ({ mini, rig, x, y, baseDiamPx, groundScale, animating, filter }: TableMini3DProps) => {
  const planeRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [model, setModel] = useState<MiniModel | null>(null);
  const status = useMinis3dStatus(true);

  useEffect(() => {
    let alive = true;
    loadMiniModel(mini.url, mini.codec).then((m) => alive && setModel(m));
    return () => {
      alive = false;
    };
  }, [mini.url, mini.codec]);

  const { frameW, frameH, tiltDeg, yawDeg, perspectiveRatio } = rig;
  const draw = useCallback(
    (at: { x: number; y: number }): MiniCamera | null => {
      const plane = planeRef.current, canvas = canvasRef.current;
      if (!model || !plane || !canvas || !(frameW > 0)) return null;
      // The base disc carries the anchor's depth scale (#926), so the model's
      // base spans the disc AS DRAWN: its diameter times that same scale.
      const cam = miniCamera({
        rig: { frameW, frameH, tiltDeg, yawDeg, perspectiveRatio },
        x: at.x,
        y: at.y,
        baseDiamPx: baseDiamPx * groundScale,
        bounds: model.bounds,
      });
      plane.style.transform = miniPlaneTransform({ tiltDeg, yawDeg }, groundScale, cam.liftPx);
      canvas.style.left = `${cam.rect.left}px`;
      canvas.style.top = `${cam.rect.top}px`;
      canvas.style.width = `${cam.rect.width}px`;
      canvas.style.height = `${cam.rect.height}px`;
      // Backing store at the canvas's real on-screen density: device pixels
      // times however much the fit/zoom transform enlarges the board.
      const onScreen = canvas.getBoundingClientRect().width / Math.max(1, cam.rect.width);
      const ratio = Math.min(3, (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1) * Math.max(1, onScreen || 1));
      const w = Math.max(1, Math.round(cam.rect.width * ratio)), h = Math.max(1, Math.round(cam.rect.height * ratio));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      renderMini(canvas, model, cam, mini.tint, ratio);
      canvas.dataset.elevDeg = cam.elevationDeg.toFixed(1);
      canvas.dataset.azDeg = cam.azimuthDeg.toFixed(1);
      canvas.dataset.leanDeg = cam.screenLeanDeg.toFixed(2);
      return cam;
    },
    [model, frameW, frameH, tiltDeg, yawDeg, perspectiveRatio, baseDiamPx, groundScale, mini.tint]
  );

  // At rest: one draw per change.
  useLayoutEffect(() => {
    if (status === "ready" && !animating) draw({ x, y });
  }, [status, animating, draw, x, y]);

  // Tweening: follow the anchor's animated left/top.
  useEffect(() => {
    if (!animating || status !== "ready") return;
    const root = planeRef.current?.closest<HTMLElement>("[data-standee-root]");
    if (!root) return;
    let last = "";
    let raf = 0;
    const tick = () => {
      const sx = pct(root.style.left), sy = pct(root.style.top);
      const k = `${sx}|${sy}`;
      if (sx !== null && sy !== null && k !== last) {
        last = k;
        draw({ x: sx, y: sy });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animating, status, draw]);

  return (
    <div
      ref={planeRef}
      data-mini3d={mini.id}
      style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transformOrigin: "0 0", transformStyle: "preserve-3d", pointerEvents: "none" }}
    >
      <canvas ref={canvasRef} data-mini3d-canvas="" style={{ position: "absolute", filter, pointerEvents: "none" }} />
    </div>
  );
};
