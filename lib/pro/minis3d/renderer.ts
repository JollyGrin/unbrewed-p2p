/**
 * 3D minis — PRESENTATION LAYER, GPU side: ONE hidden, shared WebGL renderer
 * (one context for the whole board) that draws a mini into that mini's own
 * small 2D canvas on demand — the per-piece canvas approach (#931 approach A).
 * When to draw is the scheduler's call (scheduler.ts); what to draw comes
 * from the model layer (model.ts) and the camera (camera.ts).
 *
 * STATUS. "idle" until the first mini asks, "loading" while three.js is
 * fetched, then "ready" — or "failed" when no WebGL context can be created
 * (`--disable-webgl`, blocklisted GPU), or "lost" while the browser has taken
 * the context away. Pieces watch it (`useMinis3dStatus`) and draw their sprite
 * (or token) whenever it is not "ready"; `webglcontextrestored` brings them
 * back to 3D.
 */
import type { Group, Material, Mesh, PerspectiveCamera, Scene, WebGLRenderer, DirectionalLight } from "three";
import type { MiniCamera } from "./camera";
import { loadMiniModel, type MiniModel, type Vec3 } from "./model";
import { loadThreeKit, type ThreeKit } from "./threeKit";
import { minis3dStats, recordRender } from "./stats";
import { minis3dScheduler } from "./scheduler";
import { getMinis3dStatus, setMinis3dStatus, type Minis3dStatus } from "./status";

export { getMinis3dStatus, subscribeMinis3d, type Minis3dStatus } from "./status";

interface Gl {
  kit: ThreeKit;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  key: DirectionalLight;
  rim: DirectionalLight;
  loseExt: { loseContext(): void; restoreContext(): void } | null;
  bufW: number;
  bufH: number;
  groups: Map<string, Group>;
  materials: Map<string, Material>;
}

let gl: Gl | null = null;
const setStatus = (s: Minis3dStatus) => {
  if (setMinis3dStatus(s)) minis3dStats.status = s;
};

let starting: Promise<boolean> | null = null;
/** When a failed start may be tried again (ms, Date.now clock). */
let retryAt = 0;
/** A chunk fetch that failed (offline, a deploy swapped the chunks) may work
 *  later; a later mount retries once this long after the failure. */
export const MINIS3D_IMPORT_RETRY_MS = 5000;

/**
 * Bring the shared renderer up once. Resolves false when WebGL is unusable.
 * Two ways to fail: no WebGL context (permanent — the GPU will not appear) or
 * the three.js chunks failing to load (transient: a mount after
 * MINIS3D_IMPORT_RETRY_MS starts over; threeKit forgets its failed import).
 */
export const ensureMinis3d = (): Promise<boolean> => {
  if (starting) return starting;
  if (getMinis3dStatus() === "failed" && Date.now() < retryAt) return Promise.resolve(false);
  setStatus("loading");
  exposeDebug();
  starting = (async () => {
    let kit: ThreeKit;
    try {
      kit = await loadThreeKit();
    } catch (e) {
      console.warn("[minis3d] three.js failed to load, keeping sprites/tokens (will retry):", e);
      retryAt = Date.now() + MINIS3D_IMPORT_RETRY_MS;
      starting = null;
      setStatus("failed");
      return false;
    }
    try {
      minis3dStats.importMs = kit.importMs;
      const { THREE } = kit;
      // Throws "Error creating WebGL context." where WebGL is off/blocked.
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        // Kept: each render is copied out with drawImage right away, and
        // WebKit has been known to hand back a cleared buffer without it.
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setClearColor(0x000000, 0);
      renderer.setScissorTest(true);
      // Held now: a lost context hands out no extensions.
      const loseExt = renderer.getContext().getExtension("WEBGL_lose_context");
      renderer.domElement.addEventListener("webglcontextlost", (e) => {
        e.preventDefault(); // lets the browser restore it
        setStatus("lost");
      });
      renderer.domElement.addEventListener("webglcontextrestored", () => setStatus("ready"));

      const scene = new THREE.Scene();
      // Same lights as the sprite renders (scripts/figures/render.html), but
      // fixed to the BOARD, so every mini on the table is lit from one side.
      scene.add(new THREE.HemisphereLight(0xfff1dc, 0x1a1016, 0.22));
      const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
      const rim = new THREE.DirectionalLight(0xbcd4ff, 0.9);
      scene.add(key, rim);
      const camera = new THREE.PerspectiveCamera();
      camera.matrixAutoUpdate = false;
      gl = { kit, renderer, scene, camera, key, rim, loseExt, bufW: 0, bufH: 0, groups: new Map(), materials: new Map() };
      setStatus("ready");
      return true;
    } catch (e) {
      console.warn("[minis3d] WebGL unavailable, keeping sprites/tokens:", e);
      retryAt = Infinity;
      setStatus("failed");
      return false;
    }
  })();
  return starting;
};

/** Dev/probe-only (#963): overrides the material's roughness/metalness
 *  board-wide, e.g. to check whether flat shading's speckled body is a
 *  specular response a rougher paint would kill. Reachable from a script
 *  (`window.__minis3d.setMaterialOverride`) and from the URL
 *  (`?minis3dRough=`/`&minis3dMetal=`, see manifest.ts
 *  `readMinis3dDevParams`). Inert (`null`) by default in the live app —
 *  nothing here changes default rendering unless one of those sets it. */
let materialOverride: { roughness: number; metalness: number } | null = null;
export const setMinis3dMaterialOverride = (o: { roughness: number; metalness: number } | null): void => {
  materialOverride = o;
};

const materialFor = (g: Gl, tint: string, flat: boolean): Material => {
  const roughness = materialOverride?.roughness ?? 0.42;
  const metalness = materialOverride?.metalness ?? 0.15;
  const k = `${tint}|${flat}|${roughness}|${metalness}`;
  let m = g.materials.get(k);
  if (!m) {
    const { THREE } = g.kit;
    // Same paint as the sprite renders. A painted variant sets `map` here
    // from the GLB's own material instead of a flat seat tint.
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint).convertSRGBToLinear(),
      roughness,
      metalness,
      flatShading: flat,
    });
    g.materials.set(k, m);
  }
  return m;
};

/** One Group per model: its parts, each rendering through its own node
 *  matrix (the quantized attributes are never baked — see model.ts). */
const groupFor = (g: Gl, model: MiniModel): Group => {
  let group = g.groups.get(model.url);
  if (!group) {
    const { THREE } = g.kit;
    group = new THREE.Group();
    group.matrixAutoUpdate = false;
    for (const part of model.parts) {
      const mesh: Mesh = new THREE.Mesh(part.geometry);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(part.matrix);
      // Quantized bounds are not trusted for culling; the frustum is built
      // around the model anyway.
      mesh.frustumCulled = false;
      mesh.userData.flat = part.flat;
      group.add(mesh);
    }
    g.groups.set(model.url, group);
  }
  return group;
};

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
/** A direction given in the board's own frame (x right, y up, z near). */
const boardDir = (cam: MiniCamera, d: Vec3): Vec3 => {
  const m = cam.model;
  const r = norm([m[0], m[1], m[2]]), u = norm([m[4], m[5], m[6]]), n = norm([m[8], m[9], m[10]]);
  return [0, 1, 2].map((i) => r[i] * d[0] + u[i] * d[1] + n[i] * d[2]) as Vec3;
};

/**
 * Draw one mini into `target` (a 2D canvas whose backing store is already
 * `cam.rect × pixelRatio`). Returns the ms it took, or null when the renderer
 * is not ready (the caller falls back).
 */
export const renderMini = (target: HTMLCanvasElement, model: MiniModel, cam: MiniCamera, tint: string): number | null => {
  const g = gl;
  if (getMinis3dStatus() !== "ready" || !g) return null;
  const t0 = performance.now();
  const w = target.width, h = target.height;
  if (w > g.bufW || h > g.bufH) {
    g.bufW = Math.max(g.bufW, w);
    g.bufH = Math.max(g.bufH, h);
    g.renderer.setSize(g.bufW, g.bufH, false);
  }
  g.renderer.setViewport(0, 0, w, h);
  g.renderer.setScissor(0, 0, w, h);

  const group = groupFor(g, model);
  group.matrix.fromArray(cam.model);
  group.children.forEach((c) => ((c as Mesh).material = materialFor(g, tint, !!c.userData.flat)));
  // One mini in the scene at a time.
  if (group.parent !== g.scene) {
    g.scene.children.filter((c) => (c as Group).isGroup).forEach((c) => g.scene.remove(c));
    g.scene.add(group);
  }
  g.key.position.set(...boardDir(cam, [-1.2, 2.0, 1.6]));
  g.rim.position.set(...boardDir(cam, [1.0, 1.4, -2.0]));

  const f = cam.frustum;
  const camera = g.camera;
  camera.matrix.makeTranslation(...cam.eye);
  camera.matrixWorld.copy(camera.matrix);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, f.near, f.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  g.renderer.render(g.scene, camera);
  const ctx3d = g.renderer.getContext();
  if (minis3dStats.syncTiming) ctx3d.readPixels(0, 0, 1, 1, ctx3d.RGBA, ctx3d.UNSIGNED_BYTE, new Uint8Array(4));
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, w, h);
    // GL's viewport origin is bottom-left: our pixels are the buffer's last h rows.
    ctx.drawImage(g.renderer.domElement, 0, g.bufH - h, w, h, 0, 0, w, h);
  }
  const ms = performance.now() - t0;
  recordRender({ ms, w, h, url: model.url });
  return ms;
};

let debugExposed = false;
/** `window.__minis3d`: the probes' handle (stats, context loss/restore). */
const exposeDebug = () => {
  if (debugExposed || typeof window === "undefined") return;
  debugExposed = true;
  (window as unknown as { __minis3d?: unknown }).__minis3d = {
    stats: minis3dStats,
    status: getMinis3dStatus,
    scheduler: minis3dScheduler,
    load: loadMiniModel,
    loseContext: () => gl?.loseExt?.loseContext(),
    restoreContext: () => gl?.loseExt?.restoreContext(),
    setMaterialOverride: setMinis3dMaterialOverride,
  };
};
