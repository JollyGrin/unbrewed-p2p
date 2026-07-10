/**
 * DOM environment for the per-seat render fuzz (unbrewed-p2p-179).
 *
 * The harness mounts the REAL Pro game page (pages/pro/game.tsx) under a
 * headless DOM so a server view can be rendered exactly as a browser would —
 * catching the "valid server state, throws in React" (Hollow-Oak white-screen)
 * class before a human ever sees it.
 *
 * Two consumers, two entry points:
 *
 *   - The CLI (scripts/render-fuzz.mts) runs in plain Node with no DOM, so it
 *     calls `createJsdomEnv()` FIRST to stand up a jsdom `window`/`document`
 *     and copy its globals (SVGElement, HTMLElement, …) onto `globalThis`.
 *     framer-motion and Chakra reach for those bare globals at render time.
 *
 *   - The Jest test already runs under jest-environment-jsdom, so it SKIPS
 *     `createJsdomEnv()` — the globals are already there — and only needs the
 *     shared polyfills + fake socket.
 *
 * Everything here is pure, deterministic scripting: no network, no LLM, no
 * live dev server (unbrewed-engine#79's rule).
 */
import { JSDOM, VirtualConsole } from "jsdom";

/** Globals we must NOT clobber when copying jsdom's window onto globalThis:
 *  Node built-ins and things we set explicitly below. */
const PROTECTED_GLOBALS = new Set([
  "window", "self", "top", "parent", "frames", "globalThis", "global",
  "process", "Buffer", "console", "navigator", "location", "document",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
  "setImmediate", "clearImmediate", "queueMicrotask", "fetch",
]);

const define = (key: string, value: unknown) => {
  try {
    (globalThis as Record<string, unknown>)[key] = value;
  } catch {
    // Node 22 makes some globals (navigator) read-only getters — force it.
    try {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    } catch {
      /* give up on this one key; the render will surface it if it matters */
    }
  }
};

/**
 * Stand up a jsdom window and expose its DOM constructors as bare globals.
 * Idempotent: safe to call more than once (only the first call builds a DOM).
 * CLI-only — never call this under Jest (it already has a jsdom global).
 */
export function createJsdomEnv(): void {
  if ((globalThis as Record<string, unknown>).__renderFuzzJsdom) return;

  // Swallow jsdom's own error channel: the page fires a background card-art
  // XHR (useProCardArt) that has no server to hit and rejects harmlessly (the
  // app catches it). We don't want that noise in the fuzz summary. Set
  // RENDER_FUZZ_DEBUG=1 to see it.
  const virtualConsole = new VirtualConsole();
  if (process.env.RENDER_FUZZ_DEBUG) virtualConsole.sendTo(console);

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/pro/game",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window as unknown as Record<string, unknown>;

  define("window", win);
  define("document", win.document);
  define("navigator", win.navigator);

  for (const key of Object.getOwnPropertyNames(win)) {
    if (PROTECTED_GLOBALS.has(key)) continue;
    if ((globalThis as Record<string, unknown>)[key] !== undefined) continue;
    define(key, win[key]);
  }

  (globalThis as Record<string, unknown>).__renderFuzzJsdom = dom;
  installPolyfills();
}

/**
 * Browser APIs jsdom omits that Chakra/framer-motion touch during render, plus
 * React's act() opt-in flag. Idempotent; safe under both the CLI jsdom and
 * Jest's jsdom.
 */
export function installPolyfills(): void {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

  const w = (typeof window !== "undefined" ? window : globalThis) as Record<string, unknown>;

  if (!w.matchMedia) {
    const matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    });
    w.matchMedia = matchMedia;
    define("matchMedia", matchMedia);
  }

  class StubObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  }
  if (!w.ResizeObserver) { w.ResizeObserver = StubObserver; define("ResizeObserver", StubObserver); }
  if (!w.IntersectionObserver) { w.IntersectionObserver = StubObserver; define("IntersectionObserver", StubObserver); }
  if (!w.scrollTo) w.scrollTo = () => {};
}

/**
 * Drop-in for the browser WebSocket. useProSocket constructs one on mount; the
 * harness never connects to anything — it grabs the instance and drives
 * `onopen`/`onmessage` by hand to deliver a STATE, exactly like a live server
 * push. `reset()` clears the registry before each mount so `latest()` is
 * unambiguous.
 */
export class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  static reset(): void {
    FakeWebSocket.instances = [];
  }
  static latest(): FakeWebSocket | null {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1] ?? null;
  }

  readyState = 0;
  url: string;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }
  addEventListener(): void {}
  removeEventListener(): void {}
}

/** Install the fake socket as the global WebSocket. Idempotent. */
export function installFakeWebSocket(): void {
  define("WebSocket", FakeWebSocket);
  if (typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).WebSocket = FakeWebSocket;
  }
}
