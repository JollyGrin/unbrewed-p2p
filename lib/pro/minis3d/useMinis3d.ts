/**
 * 3D minis — the React glue: the dev switch, the manifest, the shared
 * renderer's status and one model's load state.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { MINIS3D_MANIFEST_URL, parseMini3dManifest, readMinis3dSwitch, type Mini3dManifest, type Minis3dSwitch } from "./manifest";
import { ensureMinis3d, getMinis3dStatus, subscribeMinis3d, type Minis3dStatus } from "./renderer";
import { loadMiniModel, type MiniModel } from "./model";

let cached: Promise<Mini3dManifest | null> | null = null;

const loadManifest = () =>
  (cached ??= Promise.resolve()
    .then(() => fetch(MINIS3D_MANIFEST_URL))
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMini3dManifest)
    .catch(() => null));

const OFF: Minis3dSwitch = { on: false, lod: null, maxPixelRatio: null };

/** The URL switch, read after mount (SSR has no location). */
export const useMinis3dSwitch = (): Minis3dSwitch => {
  const [sw, setSw] = useState<Minis3dSwitch>(OFF);
  useEffect(() => {
    const next = readMinis3dSwitch(window.location.search);
    if (next.on) setSw(next);
  }, []);
  return sw;
};

/** The manifest, fetched once and only while the switch is on. Any failure
 *  = no 3D minis. */
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

/** The shared renderer's status; starts it the first time `enabled`. */
export const useMinis3dStatus = (enabled: boolean): Minis3dStatus => {
  const status = useSyncExternalStore(subscribeMinis3d, getMinis3dStatus, () => "idle" as Minis3dStatus);
  useEffect(() => {
    if (enabled) void ensureMinis3d();
  }, [enabled]);
  return status;
};

/** One model file, decoded once (shared by every piece standing as it).
 *  null while loading, and for good when it cannot be loaded. */
export const useMiniModel = (url: string | null): MiniModel | null => {
  const [loaded, setLoaded] = useState<{ url: string; model: MiniModel | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    loadMiniModel(url).then((model) => alive && setLoaded({ url, model }));
    return () => {
      alive = false;
    };
  }, [url]);
  return url && loaded?.url === url ? loaded.model : null;
};
