/**
 * The shared renderer's start-up (review item 3): a failed three.js import is
 * retried by a later mount after a backoff; a missing WebGL context is not.
 * three itself is faked — jsdom has no WebGL.
 */
const mockLoadThreeKit = jest.fn();
jest.mock("./threeKit", () => ({ loadThreeKit: () => mockLoadThreeKit() }));

class Obj {
  matrixAutoUpdate = true;
  add() {}
}
const fakeKit = (webgl: boolean) => ({
  importMs: 1,
  THREE: {
    sRGBEncoding: 3001,
    WebGLRenderer: class {
      outputEncoding = 0;
      domElement = { addEventListener() {} };
      constructor() {
        if (!webgl) throw new Error("Error creating WebGL context.");
      }
      setPixelRatio() {}
      setClearColor() {}
      setScissorTest() {}
      getContext() {
        return { getExtension: () => null };
      }
    },
    Scene: Obj,
    HemisphereLight: Obj,
    DirectionalLight: Obj,
    PerspectiveCamera: Obj,
  },
});

type Renderer = typeof import("./renderer");
const fresh = (): Renderer => {
  let mod!: Renderer;
  jest.isolateModules(() => {
    mod = require("./renderer");
  });
  return mod;
};

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, "now").mockImplementation(() => now);
  jest.spyOn(console, "warn").mockImplementation(() => {});
  mockLoadThreeKit.mockReset();
});
afterEach(() => jest.restoreAllMocks());

test("a failed three.js import is retried by a later mount, after the backoff", async () => {
  const r = fresh();
  mockLoadThreeKit.mockRejectedValueOnce(new Error("ChunkLoadError")).mockResolvedValue(fakeKit(true));
  expect(await r.ensureMinis3d()).toBe(false);
  expect(r.getMinis3dStatus()).toBe("failed");

  // Straight away: still backing off — no second fetch.
  expect(await r.ensureMinis3d()).toBe(false);
  expect(mockLoadThreeKit).toHaveBeenCalledTimes(1);

  now += r.MINIS3D_IMPORT_RETRY_MS + 1;
  expect(await r.ensureMinis3d()).toBe(true);
  expect(r.getMinis3dStatus()).toBe("ready");
  expect(mockLoadThreeKit).toHaveBeenCalledTimes(2);
});

test("no WebGL context is permanent: no retry however long we wait", async () => {
  const r = fresh();
  mockLoadThreeKit.mockResolvedValue(fakeKit(false));
  expect(await r.ensureMinis3d()).toBe(false);
  expect(r.getMinis3dStatus()).toBe("failed");
  now += 10 * 60_000;
  expect(await r.ensureMinis3d()).toBe(false);
  expect(mockLoadThreeKit).toHaveBeenCalledTimes(1);
});

test("a successful start happens once, however many pieces ask", async () => {
  const r = fresh();
  mockLoadThreeKit.mockResolvedValue(fakeKit(true));
  const all = await Promise.all([r.ensureMinis3d(), r.ensureMinis3d(), r.ensureMinis3d()]);
  expect(all).toEqual([true, true, true]);
  expect(mockLoadThreeKit).toHaveBeenCalledTimes(1);
});
