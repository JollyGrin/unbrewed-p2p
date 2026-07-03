// The board's pan/zoom lives only inside d3 (the SVG's __zoom datum), not React
// state. This tiny pub/sub lets sibling overlays (e.g. the dice canvas) mirror
// the same `translate(x,y) scale(k)` so they can ride the map. useCanvas.tsx
// publishes on every zoom event and on the initial fit; subscribers read the
// current transform plus the board <svg> to align to its on-screen rect.

export interface BoardTransform {
  x: number;
  y: number;
  k: number;
}

let current: BoardTransform = { x: 0, y: 0, k: 1 };
let svgEl: SVGSVGElement | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

/** Register (or clear) the board <svg> so overlays can read its screen rect. */
export function setBoardSvg(el: SVGSVGElement | null) {
  svgEl = el;
  notify();
}

export function getBoardSvg(): SVGSVGElement | null {
  return svgEl;
}

/** Called from the d3 zoom handler with the live transform. */
export function publishBoardTransform(t: BoardTransform) {
  current = t;
  notify();
}

export function getBoardTransform(): BoardTransform {
  return current;
}

/** Subscribe to transform/svg changes; returns an unsubscribe fn. */
export function subscribeBoardTransform(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
