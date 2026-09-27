/**
 * Dev-only figure probe (#926): stands every one-space miniature on the
 * TABLETOP at a board point the probe names, so
 * `scripts/visual-probe/tableFigureBase.cjs` can measure a miniature's base
 * against the board's own ellipse at the far, middle and near rows and both
 * side edges in one real game, instead of walking a hero there turn by turn.
 * Only WHERE the piece stands is forced; how it draws is the real renderer.
 *
 * The probe moves the piece from the page:
 *   window.dispatchEvent(new CustomEvent("table-figure-probe", { detail: { x: 0.1, y: 0.9 } }))
 * (normalized board coordinates; `detail: null` puts it back). Never on in a
 * production build.
 */
import { useEffect, useState } from "react";

export const FIGURE_PROBE_EVENT = "table-figure-probe";

export interface FigureProbePoint {
  x: number;
  y: number;
}

const isPoint = (v: unknown): v is FigureProbePoint => {
  const p = v as FigureProbePoint | null;
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
};

export const useTableFigureProbe = (): FigureProbePoint | null => {
  const [point, setPoint] = useState<FigureProbePoint | null>(null);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const onProbe = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setPoint(isPoint(detail) ? { x: detail.x, y: detail.y } : null);
    };
    window.addEventListener(FIGURE_PROBE_EVENT, onProbe);
    return () => window.removeEventListener(FIGURE_PROBE_EVENT, onProbe);
  }, []);
  return point;
};
