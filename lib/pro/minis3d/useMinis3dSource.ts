/**
 * 3D minis — what the game page needs to OFFER them (#953): whether this
 * device can show 3D at all, the manifest, and the URL's dev params. Imports
 * only the manifest parser and the status store, never the renderer, model
 * loader or three.js, so the page's first-load bundle does not grow.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Minis3dSource } from "../figures";
import { MINIS3D_MANIFEST_URL, parseMini3dManifest, readMinis3dDevParams, type Mini3dManifest, type Minis3dDevParams } from "./manifest";
import { getMinis3dStatus, subscribeMinis3d, type Minis3dStatus } from "./status";

let cached: Promise<Mini3dManifest | null> | null = null;

const loadManifest = () =>
  (cached ??= Promise.resolve()
    .then(() => fetch(MINIS3D_MANIFEST_URL))
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMini3dManifest)
    .catch(() => null));

const NO_DEV_PARAMS: Minis3dDevParams = { probe: false, lod: null, maxPixelRatio: null, roughness: null, metalness: null };

/** The URL's dev tooling params, read after mount (SSR has no location). */
export const useMinis3dDevParams = (): Minis3dDevParams => {
  const [params, setParams] = useState<Minis3dDevParams>(NO_DEV_PARAMS);
  useEffect(() => {
    const next = readMinis3dDevParams(window.location.search);
    if (next.probe || next.lod || next.maxPixelRatio || next.roughness != null) setParams(next);
  }, []);
  return params;
};

let webgl: boolean | null = null;

/**
 * Can this browser make a WebGL context at all (`--disable-webgl`, a
 * blocklisted GPU)? Probed once, without loading three.js: a throwaway canvas
 * whose context is handed straight back. Lets the dropdown hide "3D minis"
 * before anyone picks it, instead of after a failed start.
 */
export const webglAvailable = (): boolean => {
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const ctx = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    webgl = !!ctx;
    ctx?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
};

/**
 * Where 3D minis come from on this board (`Minis3dSource`, lib/pro/figures),
 * or null when they cannot be shown: the tabletop is not open, WebGL is
 * unavailable, or the shared renderer failed to start. A context that is
 * LOST keeps the source — the pieces draw their sprite until it is restored,
 * and the viewer's choice stays put. The manifest is fetched only once 3D
 * could be offered, so the first page load is unchanged.
 */
export const useMinis3dSource = (tabletop: boolean): Minis3dSource | null => {
  const [canWebgl, setCanWebgl] = useState(false);
  useEffect(() => {
    if (tabletop) setCanWebgl(webglAvailable());
  }, [tabletop]);
  const status = useSyncExternalStore(subscribeMinis3d, getMinis3dStatus, () => "idle" as Minis3dStatus);
  const usable = tabletop && canWebgl && status !== "failed";
  const manifest = useMinis3dManifest(usable);
  const { lod } = useMinis3dDevParams();
  return useMemo(() => (usable ? { manifest, lod } : null), [usable, manifest, lod]);
};

/** The manifest, fetched once and only once `enabled`. Any failure = no 3D
 *  minis. */
export const useMinis3dManifest = (enabled: boolean): Mini3dManifest | null => {
  const [manifest, setManifest] = useState<Mini3dManifest | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadManifest().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return manifest;
};
