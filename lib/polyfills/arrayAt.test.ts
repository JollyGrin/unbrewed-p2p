import fs from "fs";
import path from "path";

type Proto = { at?: unknown };
const typedProto = Object.getPrototypeOf(Int8Array.prototype) as Proto;
const protos: Proto[] = [Array.prototype, String.prototype, typedProto];
const natives = protos.map((p) => Object.getOwnPropertyDescriptor(p, "at"));

function loadPolyfill() {
  jest.isolateModules(() => {
    require("./arrayAt");
  });
}

afterEach(() => {
  protos.forEach((p, i) => {
    const d = natives[i];
    if (d) Object.defineProperty(p, "at", d);
    else delete p.at;
  });
});

describe("Array/String/TypedArray .at polyfill (#1606)", () => {
  beforeEach(() => {
    protos.forEach((p) => delete p.at);
  });

  it("restores Array.prototype.at with spec results", () => {
    expect(([] as number[]).at).toBeUndefined();
    loadPolyfill();
    expect([1, 2, 3].at(-1)).toBe(3);
    expect([].at(-1)).toBeUndefined();
    expect([1, 2].at(0)).toBe(1);
    expect([1, 2].at(2)).toBeUndefined();
    expect([1, 2].at(-3)).toBeUndefined();
    expect([1, 2, 3].at(1.7)).toBe(2);
    expect([1, 2, 3].at(NaN)).toBe(1);
    expect([1, 2, 3].at("-1" as unknown as number)).toBe(3);
    expect([1, 2].at(Infinity)).toBeUndefined();
    expect(Array.prototype.at.call({ length: 2, 0: "a", 1: "b" }, -1)).toBe("b");
  });

  it("is non-enumerable so for-in over arrays is unchanged", () => {
    loadPolyfill();
    const d = Object.getOwnPropertyDescriptor(Array.prototype, "at");
    expect(d).toMatchObject({ enumerable: false, writable: true, configurable: true });
    const keys: string[] = [];
    for (const k in [10, 20]) keys.push(k);
    expect(keys).toEqual(["0", "1"]);
  });

  it("restores String.prototype.at and the typed-array version", () => {
    loadPolyfill();
    expect("abc".at(-1)).toBe("c");
    expect("abc".at(5)).toBeUndefined();
    expect(String.prototype.at.call(123, 0)).toBe("1");
    expect(new Uint8Array([4, 5, 6]).at(-1)).toBe(6);
    expect(new Float32Array([]).at(0)).toBeUndefined();
  });
});

describe("does not replace a native implementation", () => {
  it("leaves an existing .at untouched", () => {
    const sentinels = protos.map((p) => {
      const fn = function at() {
        return "native";
      };
      Object.defineProperty(p, "at", { value: fn, writable: true, configurable: true });
      return fn;
    });
    loadPolyfill();
    protos.forEach((p, i) => expect(p.at).toBe(sentinels[i]));
  });
});

describe("pages/_app.tsx", () => {
  it("imports the polyfill before anything else", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../pages/_app.tsx"), "utf8");
    const firstImport = src.split("\n").find((l) => l.startsWith("import "));
    expect(firstImport).toBe('import "@/lib/polyfills/arrayAt";');
  });
});
