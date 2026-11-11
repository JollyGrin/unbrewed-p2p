// `Array.prototype.at` (plus the String and typed-array versions) for
// browsers older than Safari 15.4 / Chrome 92 / Firefox 90. Next 13's
// built-in polyfills do not cover it, and @3d-dice/dice-box-threejs calls
// `result.at(-1)` inside its animation loop, which threw uncaught on
// Safari 13 (#1606). Imported first in pages/_app.tsx so it runs before any
// app code or lazily loaded chunk.
//
// Follows the spec: ToIntegerOrInfinity on the index, negative counts from
// the end, out of range gives undefined. A native implementation is never
// replaced.

// Spec ToIntegerOrInfinity + relative index. Returns -1 when out of range.
function relativeIndex(index: unknown, len: number): number {
  let n = Math.trunc(Number(index)) || 0; // NaN and -0 become 0
  if (n < 0) n += len;
  return n < 0 || n >= len ? -1 : n;
}

function arrayAt(this: unknown, index: number): unknown {
  if (this == null) throw new TypeError("at called on null or undefined");
  const o = Object(this) as ArrayLike<unknown>;
  const len = Math.min(Math.max(Math.trunc(Number(o.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
  const i = relativeIndex(index, len);
  return i < 0 ? undefined : o[i];
}

function stringAt(this: unknown, index: number): string | undefined {
  if (this == null) throw new TypeError("at called on null or undefined");
  const s = String(this);
  const i = relativeIndex(index, s.length);
  return i < 0 ? undefined : s.charAt(i);
}

export function installAtPolyfill(): void {
  const targets: Array<[object, (this: unknown, index: number) => unknown]> = [
    [Array.prototype, arrayAt],
    [String.prototype, stringAt],
  ];
  if (typeof Int8Array !== "undefined") {
    // %TypedArray%.prototype, shared by every typed array class.
    targets.push([Object.getPrototypeOf(Int8Array.prototype), arrayAt]);
  }
  for (const [proto, value] of targets) {
    if (typeof (proto as { at?: unknown }).at === "function") continue;
    Object.defineProperty(proto, "at", {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
}

installAtPolyfill();
