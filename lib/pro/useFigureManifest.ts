/**
 * Loads a figure set's manifest.json once per page load (see lib/pro/figures
 * for why figures are a runtime file rather than code, and for the two sets).
 * Every failure — no such file on this deploy, a network error, malformed
 * JSON — resolves to `null`, which means "no figures": the tabletop falls
 * back to token art, and the game never notices.
 *
 * `enabled` is false while the flat board is up: only the tabletop draws
 * figures, and on a deploy without the folder every flat-board game would
 * otherwise log a 404 for nothing (#877). The request goes out the first time
 * the tabletop is shown — or a hero-view surface opens (#903) — and is cached
 * from then on, per set.
 */
import { useEffect, useState } from "react";
import { FigureManifest, FigureSet, figureManifestUrl, parseFigureManifest } from "./figures";

const cached = new Map<FigureSet, Promise<FigureManifest | null>>();

const load = (set: FigureSet): Promise<FigureManifest | null> => {
  let p = cached.get(set);
  if (!p) {
    // Started inside a promise so that a fetch that throws synchronously — or
    // does not exist at all, as in jsdom — lands in the catch below as well.
    p = Promise.resolve()
      .then(() => fetch(figureManifestUrl(set)))
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => parseFigureManifest(raw, set))
      .catch(() => null);
    cached.set(set, p);
  }
  return p;
};

/** Test seam: forget the cached requests so each test starts from a cold page. */
export const resetFigureManifestCache = (): void => {
  cached.clear();
};

export const useFigureManifest = (enabled = true, set: FigureSet = "private"): FigureManifest | null => {
  const [manifest, setManifest] = useState<FigureManifest | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load(set).then((m) => {
      if (alive) setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, [enabled, set]);
  return manifest;
};

/** Both sets, for the tabletop and the hero-view surfaces. */
export const useFigureManifests = (enabled = true): Record<FigureSet, FigureManifest | null> => ({
  private: useFigureManifest(enabled, "private"),
  open: useFigureManifest(enabled, "open"),
});
