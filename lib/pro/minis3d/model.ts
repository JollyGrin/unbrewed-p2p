/**
 * 3D minis — MODEL LAYER: fetch + decode a mini's GLB once, keep it ready for
 * the GPU, and measure it. Knows nothing about the board, the camera or the
 * DOM; the presentation layer (renderer.ts, TableMini3D) places what this
 * returns.
 *
 * QUANTIZED STAYS QUANTIZED. Meshopt files carry `KHR_mesh_quantization`:
 * positions as normalized int16 (interleaved, padded to 4), normals as
 * normalized int8, with the dequantizing scale in the NODE transform. The GPU
 * reads those attributes natively (`normalized` on the vertex pointer), so the
 * geometry is kept exactly as decoded and each part renders through its own
 * node matrix. It is never baked: three r143's `getX`/`applyMatrix4` do NOT
 * denormalize, so baking wrote garbage minis in the spike (#931 "Traps").
 *
 * Only the measuring pass reads vertices on the CPU, through
 * `dequantize` — read-only, into nothing that is kept.
 *
 * NORMALISED FILES. Every committed mini comes out of the mini pipeline
 * already normalised (its Stage D, #945): base on y = 0, base footprint
 * diameter 1.0, x/z centred on that footprint, up = +y, front = +z. So the
 * model is drawn exactly as authored — no re-centring, no footprint guess —
 * and its base spans the disc at scale `baseDiamPx / 1`. The manifest test
 * checks the contract on every committed file.
 */
import type { BufferGeometry } from "three";
import { loadThreeKit } from "./threeKit";
import { minis3dStats } from "./stats";

export type Vec3 = [number, number, number];

/** A model's bounds in its own (normalised) units: base on y = 0. */
export interface ModelBounds {
  min: Vec3;
  max: Vec3;
  /** The base's diameter in model units — what spans the base disc. */
  footprint: number;
}

/** The pipeline's contract: a mini's base footprint is 1 model unit wide. */
export const MINI_FOOTPRINT = 1;

export interface MiniModelPart {
  /** As decoded: attributes may be quantized and interleaved. */
  geometry: BufferGeometry;
  /** Column-major 4×4 from the part's own attribute space to model space
   *  (the glTF node transform — carries the dequantizing scale). */
  matrix: number[];
  /** No normals in the file: shade flat (they cannot be computed from
   *  quantized positions in r143). */
  flat: boolean;
}

export interface MiniModel {
  url: string;
  bounds: ModelBounds;
  parts: MiniModelPart[];
  triangles: number;
  bytes: number;
}

/**
 * glTF's normalized-integer rule (KHR_mesh_quantization): signed
 * max(v / (2^(bits−1) − 1), −1), unsigned v / (2^bits − 1). `raw` is what
 * three r143's `getX` returns for such an attribute — the stored integer.
 */
export const dequantize = (raw: number, array: ArrayLike<number>, normalized: boolean): number => {
  if (!normalized) return raw;
  if (array instanceof Int8Array) return Math.max(raw / 127, -1);
  if (array instanceof Uint8Array) return raw / 255;
  if (array instanceof Int16Array) return Math.max(raw / 32767, -1);
  if (array instanceof Uint16Array) return raw / 65535;
  return raw;
};

/** The slice of a three (interleaved) BufferAttribute the measuring pass reads. */
export interface AttributeLike {
  count: number;
  normalized: boolean;
  isInterleavedBufferAttribute?: boolean;
  array?: ArrayLike<number>;
  data?: { array: ArrayLike<number> };
  getX(i: number): number;
  getY(i: number): number;
  getZ(i: number): number;
}

export const transformPoint = (m: number[], x: number, y: number, z: number): Vec3 => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/** Every vertex of every part, dequantized and through its node matrix. */
export const forEachModelPoint = (
  parts: { position: AttributeLike; matrix: number[] }[],
  visit: (p: Vec3) => void
) => {
  for (const { position: a, matrix } of parts) {
    const arr = (a.isInterleavedBufferAttribute ? a.data?.array : a.array) ?? [];
    for (let i = 0; i < a.count; i++) {
      visit(
        transformPoint(
          matrix,
          dequantize(a.getX(i), arr, a.normalized),
          dequantize(a.getY(i), arr, a.normalized),
          dequantize(a.getZ(i), arr, a.normalized)
        )
      );
    }
  }
};

/** The bounds of a normalised model, from its points (y up). */
export const measureBounds = (forEach: (visit: (p: Vec3) => void) => void): ModelBounds | null => {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  forEach((p) => {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  });
  return hi[1] > lo[1] ? { min: lo, max: hi, footprint: MINI_FOOTPRINT } : null;
};

const models = new Map<string, Promise<MiniModel | null>>();

/**
 * Fetch + decode a GLB once per URL (the promise is cached, so every piece
 * standing as the same mini shares one geometry). Resolves null when the file
 * cannot be fetched or decoded: the caller keeps its sprite or token.
 */
export const loadMiniModel = (url: string): Promise<MiniModel | null> => {
  let p = models.get(url);
  if (p) return p;
  p = (async () => {
    try {
      const { GLTFLoader, MeshoptDecoder } = await loadThreeKit();
      const f0 = performance.now();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const fetchMs = performance.now() - f0;
      const d0 = performance.now();
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.parseAsync(buf, "");
      gltf.scene.updateMatrixWorld(true);
      const raw: { geometry: BufferGeometry; matrix: number[] }[] = [];
      gltf.scene.traverse((o) => {
        const mesh = o as { isMesh?: boolean; geometry?: BufferGeometry; matrixWorld: { elements: ArrayLike<number> } };
        if (mesh.isMesh && mesh.geometry?.attributes.position)
          raw.push({ geometry: mesh.geometry, matrix: Array.from(mesh.matrixWorld.elements) });
      });
      const bounds = measureBounds((visit) =>
        forEachModelPoint(
          raw.map((r) => ({ position: r.geometry.attributes.position as unknown as AttributeLike, matrix: r.matrix })),
          visit
        )
      );
      if (!bounds) throw new Error("empty model");
      const parts = raw.map((r) => ({ geometry: r.geometry, matrix: r.matrix, flat: !r.geometry.attributes.normal }));
      const triangles = raw.reduce((n, r) => n + (r.geometry.index ? r.geometry.index.count : r.geometry.attributes.position.count) / 3, 0);
      minis3dStats.loads.push({ url, bytes: buf.byteLength, fetchMs, decodeMs: performance.now() - d0, triangles });
      return { url, bounds, parts, triangles, bytes: buf.byteLength };
    } catch (e) {
      console.warn("[minis3d] could not load", url, e);
      models.delete(url); // not cached: a later mount may retry
      return null;
    }
  })();
  models.set(url, p);
  return p;
};
