/**
 * WebGL minis spike (unbrewed-p2p-931): loads public/minis3d/manifest.json
 * once, only while the dev switch is on. Any failure = no 3D minis.
 */
import { useEffect, useState } from "react";
import { MINIS3D_MANIFEST_URL, parseMini3dManifest, readMinis3dSwitch, type Mini3dManifest, type Minis3dSwitch } from "./manifest";

let cached: Promise<Mini3dManifest | null> | null = null;

const load = () =>
  (cached ??= Promise.resolve()
    .then(() => fetch(MINIS3D_MANIFEST_URL))
    .then((res) => (res.ok ? res.json() : null))
    .then(parseMini3dManifest)
    .catch(() => null));

/** The URL switch, read after mount (SSR has no location). */
export const useMinis3dSwitch = (): Minis3dSwitch => {
  const [sw, setSw] = useState<Minis3dSwitch>({ on: false, variant: null });
  useEffect(() => {
    const next = readMinis3dSwitch(window.location.search);
    if (next.on) setSw(next);
  }, []);
  return sw;
};

export const useMinis3dManifest = (enabled: boolean): Mini3dManifest | null => {
  const [manifest, setManifest] = useState<Mini3dManifest | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load().then((m) => alive && setManifest(m));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return manifest;
};
