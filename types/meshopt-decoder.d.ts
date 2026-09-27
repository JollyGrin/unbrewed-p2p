// three r143 ships its Meshopt decoder (examples/jsm/libs) without types, and
// @types/three@0.143 does not cover it. Only what GLTFLoader needs.
declare module "three/examples/jsm/libs/meshopt_decoder.module" {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decodeGltfBuffer(target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter: string): void;
  };
}
