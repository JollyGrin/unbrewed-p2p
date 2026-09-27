// WebGL minis spike (unbrewed-p2p-931): three.js arrives at 0.143 through
// @3d-dice/dice-box-threejs and ships no types of its own at that version.
// Shorthand declarations (everything `any`) keep the spike off @types/three;
// the production ticket should add @types/three@0.143 instead (see PR body).
declare module "three";
declare module "three/examples/jsm/loaders/GLTFLoader";
declare module "three/examples/jsm/loaders/DRACOLoader";
declare module "three/examples/jsm/libs/meshopt_decoder.module";
declare module "three/examples/jsm/utils/BufferGeometryUtils";
