import { dequantize, forEachModelPoint, measureBounds, MINI_FOOTPRINT, type AttributeLike, type Vec3 } from "./model";

/**
 * An interleaved, normalized int16 position attribute the way Meshopt +
 * KHR_mesh_quantization files deliver it (xyz padded to 4 components), with
 * three r143's accessor semantics: getX returns the STORED integer.
 */
const interleavedInt16 = (points: Vec3[]): AttributeLike => {
  const arr = new Int16Array(points.length * 4);
  points.forEach((p, i) => p.forEach((v, k) => (arr[i * 4 + k] = Math.round(v * 32767))));
  return {
    count: points.length,
    normalized: true,
    isInterleavedBufferAttribute: true,
    data: { array: arr },
    getX: (i) => arr[i * 4],
    getY: (i) => arr[i * 4 + 1],
    getZ: (i) => arr[i * 4 + 2],
  };
};

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/** Column-major uniform scale s then translate t (a glTF node transform). */
const node = (s: number, t: Vec3) => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, t[0], t[1], t[2], 1];

describe("dequantize (glTF normalized integers)", () => {
  test.each([
    [new Int16Array(1), 32767, 1],
    [new Int16Array(1), -32768, -1],
    [new Int8Array(1), 127, 1],
    [new Int8Array(1), -128, -1],
    [new Uint8Array(1), 255, 1],
    [new Uint16Array(1), 65535, 1],
  ])("%p %p → %p", (arr, raw, want) => {
    expect(dequantize(raw, arr, true)).toBeCloseTo(want, 6);
  });

  test("floats and non-normalized ints pass through", () => {
    expect(dequantize(0.25, new Float32Array(1), false)).toBe(0.25);
    expect(dequantize(7, new Int16Array(1), false)).toBe(7);
  });
});

describe("measuring a quantized, interleaved model (#931 trap)", () => {
  // A 2-unit-wide square base at y = −1 and a tip at y = +1, in [−1, 1]
  // quantized space; the node scales by 0.95 and shifts.
  const pts: Vec3[] = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, -1, 1],
    [-1, -1, 1],
    [0, 1, 0],
  ];
  const parts = [{ position: interleavedInt16(pts), matrix: node(0.95, [0.1, 0.2, 0.3]) }];

  test("reads through the stride and the node transform, never the raw integers", () => {
    const seen: Vec3[] = [];
    forEachModelPoint(parts, (p) => seen.push(p));
    expect(seen).toHaveLength(5);
    expect(seen[0][0]).toBeCloseTo(-0.95 + 0.1, 4);
    expect(seen[4][1]).toBeCloseTo(0.95 + 0.2, 4);
  });

  test("measures the bounds as authored — a normalised file is never re-centred", () => {
    const b = measureBounds((visit) => forEachModelPoint(parts, visit))!;
    expect(b.min[0]).toBeCloseTo(-0.95 + 0.1, 4);
    expect(b.min[1]).toBeCloseTo(-0.95 + 0.2, 4);
    expect(b.max[1]).toBeCloseTo(0.95 + 0.2, 4);
    expect(b.max[2]).toBeCloseTo(0.95 + 0.3, 4);
    // The pipeline's contract, not a measurement: the base is 1 unit wide.
    expect(b.footprint).toBe(MINI_FOOTPRINT);
  });

  test("an empty or flat model measures as nothing", () => {
    expect(measureBounds(() => {})).toBeNull();
    expect(measureBounds((visit) => forEachModelPoint([{ position: interleavedInt16([[0, 1, 0]]), matrix: IDENTITY }], visit))).toBeNull();
  });
});
