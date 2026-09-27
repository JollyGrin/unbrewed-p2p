/**
 * 3D minis — the shared renderer's status (see renderer.ts), in a module of
 * its own so the game page can watch it (the figure-style dropdown hides
 * "3D minis" once the renderer has failed) without pulling the renderer,
 * the model loader or three.js into the page's first-load bundle.
 */
export type Minis3dStatus = "idle" | "loading" | "ready" | "failed" | "lost";

let status: Minis3dStatus = "idle";
const listeners = new Set<() => void>();

export const getMinis3dStatus = (): Minis3dStatus => status;

export const subscribeMinis3d = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Renderer only. */
export const setMinis3dStatus = (s: Minis3dStatus): boolean => {
  if (s === status) return false;
  status = s;
  listeners.forEach((l) => l());
  return true;
};
