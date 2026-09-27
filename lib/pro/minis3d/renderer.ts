/**
 * WebGL minis spike (unbrewed-p2p-931) — ONE hidden, shared WebGL renderer
 * that draws each mini into its own small 2D canvas on demand (approach A).
 *
 * three.js and the loaders are imported dynamically, the first time a mini is
 * asked for, so nothing here reaches the tabletop's own chunk. Decoders are
 * self-hosted: Draco's wasm from `public/decoders/draco/`, Meshopt's inline in
 * its module — no third-party CDN at runtime.
 *
 * FAILURE. If a WebGL context cannot be created the status goes to "failed";
 * if the context is lost it goes to "lost" until the browser restores it.
 * Standees watch the status (useMini3dStatus) and fall back to the sprite or
 * token whenever it is not "ready".
 *
 * Every render is timed into `minis3dStats` (and `window.__minis3d` while the
 * switch is on) for the spike's probe.
 */
import type { MiniCamera, ModelBounds, Vec3 } from "./camera";
import type { Mini3dCodec } from "./manifest";

export type Minis3dStatus = "idle" | "loading" | "ready" | "failed" | "lost";

export interface MiniModel {
  url: string;
  bounds: ModelBounds;
  triangles: number;
  /** ms from the file in memory to a GPU-ready geometry (decoder + parse). */
  decodeMs: number;
  bytes: number;
  // three.js BufferGeometry — kept `any` with the shim types (see types/).
  geometry: any;
}

export interface Minis3dStats {
  renders: { ms: number; w: number; h: number; url: string }[];
  loads: { url: string; codec: Mini3dCodec; bytes: number; fetchMs: number; decodeMs: number; triangles: number }[];
  /** First dynamic import of three + loaders, ms. */
  importMs: number | null;
  status: Minis3dStatus;
  /** Probe only: wait for the GPU after each render (1-px readPixels) so
   *  `renders[].ms` includes GPU time, not just the main thread's share. */
  syncTiming: boolean;
}

export const minis3dStats: Minis3dStats = { renders: [], loads: [], importMs: null, status: "idle", syncTiming: false };

let THREE: any = null;
let renderer: any = null;
let scene: any = null;
let camera: any = null;
let key: any = null;
let rim: any = null;
let gltfLoader: any = null;
let loseExt: any = null;
let bufW = 0, bufH = 0;
const meshes = new Map<string, any>();
const materials = new Map<string, any>();

let status: Minis3dStatus = "idle";
const listeners = new Set<() => void>();
const setStatus = (s: Minis3dStatus) => {
  status = s;
  minis3dStats.status = s;
  listeners.forEach((l) => l());
};
export const getMinis3dStatus = (): Minis3dStatus => status;
export const subscribeMinis3d = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

let starting: Promise<boolean> | null = null;

/** Bring the shared renderer up once. Resolves false when WebGL is unusable. */
export const ensureMinis3d = (): Promise<boolean> => {
  if (starting) return starting;
  setStatus("loading");
  starting = (async () => {
    try {
      const t0 = performance.now();
      const [three, { GLTFLoader }, { DRACOLoader }, { MeshoptDecoder }] = await Promise.all([
        import("three"),
        import("three/examples/jsm/loaders/GLTFLoader"),
        import("three/examples/jsm/loaders/DRACOLoader"),
        import("three/examples/jsm/libs/meshopt_decoder.module"),
      ]);
      minis3dStats.importMs = performance.now() - t0;
      THREE = three;
      // Throws "Error creating WebGL context." where WebGL is off/blocked.
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
      renderer.setPixelRatio(1);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.setClearColor(0x000000, 0);
      // Held now: a lost context hands out no extensions.
      loseExt = renderer.getContext().getExtension("WEBGL_lose_context");
      const canvas: HTMLCanvasElement = renderer.domElement;
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault(); // lets the browser restore it
        setStatus("lost");
      });
      canvas.addEventListener("webglcontextrestored", () => setStatus("ready"));

      scene = new THREE.Scene();
      // Same lights as the sprite renders (scripts/figures/render.html), but
      // fixed to the BOARD, so every mini on the table is lit from one side.
      scene.add(new THREE.HemisphereLight(0xfff1dc, 0x1a1016, 0.22));
      key = new THREE.DirectionalLight(0xfff0dc, 1.6);
      rim = new THREE.DirectionalLight(0xbcd4ff, 0.9);
      scene.add(key, rim);
      camera = new THREE.PerspectiveCamera();
      camera.matrixAutoUpdate = false;

      const draco = new DRACOLoader();
      draco.setDecoderPath("/decoders/draco/");
      draco.setDecoderConfig({ type: "wasm" });
      draco.setWorkerLimit(1);
      gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(draco);
      gltfLoader.setMeshoptDecoder(MeshoptDecoder);
      setStatus("ready");
      return true;
    } catch (e) {
      console.warn("[minis3d] WebGL unavailable, keeping sprites/tokens:", e);
      setStatus("failed");
      return false;
    }
  })();
  return starting;
};

const models = new Map<string, Promise<MiniModel | null>>();

/** Fetch + decode a GLB once; its base is put on y = 0, centred. */
export const loadMiniModel = (url: string, codec: Mini3dCodec): Promise<MiniModel | null> => {
  let p = models.get(url);
  if (p) return p;
  p = (async () => {
    if (!(await ensureMinis3d())) return null;
    try {
      const f0 = performance.now();
      const buf = await (await fetch(url)).arrayBuffer();
      const fetchMs = performance.now() - f0;
      const d0 = performance.now();
      const gltf = await gltfLoader.parseAsync(buf, "");
      gltf.scene.updateMatrixWorld(true);
      const parts: unknown[] = [];
      gltf.scene.traverse((o: { isMesh?: boolean; geometry: { clone: () => { applyMatrix4: (m: unknown) => void } }; matrixWorld: unknown }) => {
        if (!o.isMesh) return;
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        parts.push(g);
      });
      if (parts.length === 0) return null;
      let geo: any = parts[0];
      if (parts.length > 1) {
        const { mergeBufferGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils");
        geo = mergeBufferGeometries(parts);
      }
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      geo.computeBoundingBox();
      const height = geo.boundingBox.max.y;
      // The base: widest horizontal extent in the bottom 2% (as render.html).
      const pos = geo.attributes.position;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > height * 0.02) continue;
        x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i));
        z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i));
      }
      const b = geo.boundingBox;
      const decodeMs = performance.now() - d0;
      const triangles = (geo.index ? geo.index.count : pos.count) / 3;
      const model: MiniModel = {
        url,
        geometry: geo,
        bounds: { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z], footprint: Math.max(x1 - x0, z1 - z0) },
        triangles,
        decodeMs,
        bytes: buf.byteLength,
      };
      minis3dStats.loads.push({ url, codec, bytes: buf.byteLength, fetchMs, decodeMs, triangles });
      return model;
    } catch (e) {
      console.warn("[minis3d] could not load", url, e);
      return null;
    }
  })();
  models.set(url, p);
  return p;
};

const materialFor = (tint: string) => {
  let m = materials.get(tint);
  if (!m) {
    // Same paint as the sprite renders. A painted variant would set `map`
    // here (and the mesh would keep its UVs) — see the PR body.
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint).convertSRGBToLinear(), roughness: 0.42, metalness: 0.15 });
    materials.set(tint, m);
  }
  return m;
};

const meshFor = (model: MiniModel) => {
  let m = meshes.get(model.url);
  if (!m) {
    m = new THREE.Mesh(model.geometry);
    m.matrixAutoUpdate = false;
    meshes.set(model.url, m);
  }
  return m;
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
export const renderMini = (target: HTMLCanvasElement, model: MiniModel, cam: MiniCamera, tint: string, pixelRatio: number): number | null => {
  if (status !== "ready" || !renderer) return null;
  const t0 = performance.now();
  const w = Math.max(1, Math.round(cam.rect.width * pixelRatio));
  const h = Math.max(1, Math.round(cam.rect.height * pixelRatio));
  if (w > bufW || h > bufH) {
    bufW = Math.max(bufW, w);
    bufH = Math.max(bufH, h);
    renderer.setSize(bufW, bufH, false);
  }
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(true);

  const mesh = meshFor(model);
  mesh.material = materialFor(tint);
  mesh.matrix.fromArray(cam.model);
  scene.children.filter((c: unknown) => (c as { isMesh?: boolean }).isMesh).forEach((c: unknown) => scene.remove(c));
  scene.add(mesh);
  key.position.set(...boardDir(cam, [-1.2, 2.0, 1.6]));
  rim.position.set(...boardDir(cam, [1.0, 1.4, -2.0]));

  const f = cam.frustum;
  camera.matrix.makeTranslation(...cam.eye);
  camera.matrixWorld.copy(camera.matrix);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camera.projectionMatrix.makePerspective(f.left, f.right, f.top, f.bottom, f.near, f.far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  renderer.render(scene, camera);
  if (minis3dStats.syncTiming) renderer.getContext().readPixels(0, 0, 1, 1, 0x1908, 0x1401, new Uint8Array(4)); // RGBA, UNSIGNED_BYTE
  const ctx = target.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, target.width, target.height);
    // GL's viewport origin is bottom-left: our pixels are the canvas's last h rows.
    ctx.drawImage(renderer.domElement, 0, bufH - h, w, h, 0, 0, target.width, target.height);
  }
  const ms = performance.now() - t0;
  if (minis3dStats.renders.length < 200000) minis3dStats.renders.push({ ms, w, h, url: model.url });
  return ms;
};

/** Probe hooks: lose / restore the shared context (WEBGL_lose_context). */
export const minis3dDebug = {
  loseContext: () => loseExt?.loseContext(),
  restoreContext: () => loseExt?.restoreContext(),
};

if (typeof window !== "undefined") {
  (window as unknown as { __minis3d?: unknown }).__minis3d = { stats: minis3dStats, load: loadMiniModel, ...minis3dDebug };
}
