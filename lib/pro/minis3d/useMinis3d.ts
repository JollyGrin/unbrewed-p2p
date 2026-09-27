/**
 * 3D minis — the React glue on the TABLE side: the shared renderer's status
 * and one model's load state. (What the game page needs before the tabletop
 * chunk — the manifest, the WebGL probe, the dev params — is in
 * useMinis3dSource.ts, which stays clear of the renderer.)
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { ensureMinis3d, getMinis3dStatus, subscribeMinis3d, type Minis3dStatus } from "./renderer";
import { loadMiniModel, type MiniModel } from "./model";

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
