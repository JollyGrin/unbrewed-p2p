/**
 * 3D minis — the lazy three.js kit: three r143, its GLTFLoader and the
 * Meshopt decoder, behind ONE dynamic `import()`. Nothing here is imported
 * statically, so none of it reaches any route's first load or the tabletop's
 * own chunk: the kit is fetched the first time a mini is asked for.
 *
 * Meshopt only (#945): the decoder is 19.7 KB with its wasm inlined, bundled
 * into a same-origin chunk — no Draco wasm, no worker, no `public/decoders/`,
 * no third-party CDN at runtime.
 */
export interface ThreeKit {
  THREE: typeof import("three");
  GLTFLoader: typeof import("three/examples/jsm/loaders/GLTFLoader").GLTFLoader;
  MeshoptDecoder: typeof import("three/examples/jsm/libs/meshopt_decoder.module").MeshoptDecoder;
  /** ms the first import took (chunk fetch + evaluation). */
  importMs: number;
}

let kit: Promise<ThreeKit> | null = null;

export const loadThreeKit = (): Promise<ThreeKit> =>
  (kit ??= (async () => {
    const t0 = performance.now();
    const [THREE, { GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
      import("three"),
      import("three/examples/jsm/loaders/GLTFLoader"),
      import("three/examples/jsm/libs/meshopt_decoder.module"),
    ]);
    await MeshoptDecoder.ready;
    return { THREE, GLTFLoader, MeshoptDecoder, importMs: performance.now() - t0 };
  })().catch((e) => {
    kit = null; // a failed chunk fetch may succeed on the next mini
    throw e;
  }));
