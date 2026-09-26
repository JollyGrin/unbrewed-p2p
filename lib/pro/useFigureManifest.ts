/**
 * Loads `/figures/manifest.json` once per page load (see lib/pro/figures for
 * why figures are a runtime file rather than code). Every failure — no such
 * file on this deploy, a network error, malformed JSON — resolves to `null`,
 * which means "no figures": the tabletop falls back to token art, and the
 * game never notices.
 */
import { useEffect, useState } from "react";
import { FIGURES_MANIFEST_URL, FigureManifest, parseFigureManifest } from "./figures";

let cached: Promise<FigureManifest | null> | null = null;

const load = (): Promise<FigureManifest | null> => {
  // Started inside a promise so that a fetch that throws synchronously — or
  // does not exist at all, as in jsdom — lands in the catch below as well.
  cached ??= Promise.resolve()
    .then(() => fetch(FIGURES_MANIFEST_URL))
    .then((res) => (res.ok ? res.json() : null))
    .then(parseFigureManifest)
    .catch(() => null);
  return cached;
};

/** Test seam: forget the cached request so each test starts from a cold page. */
export const resetFigureManifestCache = (): void => {
  cached = null;
};

export const useFigureManifest = (): FigureManifest | null => {
  const [manifest, setManifest] = useState<FigureManifest | null>(null);
  useEffect(() => {
    let alive = true;
    load().then((m) => {
      if (alive) setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
};
