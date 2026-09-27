import { renderHook, waitFor } from "@testing-library/react";
import { resetFigureManifestCache, useFigureManifest, useFigureManifests } from "./useFigureManifest";

const manifest = {
  version: 1,
  figures: {
    "king-kong": { anchor: { x: 0.5, y: 0.7 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, seats: { p1: "king-kong.p1.webp" },
      license: "CC-BY-4.0",
      redistributable: true,
      officialHero: false,
    },
  },
};

const mockFetch = (impl: (...args: unknown[]) => Promise<unknown>) => {
  const fn = jest.fn(impl);
  (global as unknown as { fetch: unknown }).fetch = fn;
  return fn;
};

const originalFetch = (global as unknown as { fetch?: unknown }).fetch;

afterEach(() => {
  resetFigureManifestCache();
  (global as unknown as { fetch?: unknown }).fetch = originalFetch;
});

describe("useFigureManifest", () => {
  test("loads and validates the manifest", async () => {
    mockFetch(async () => ({ ok: true, json: async () => manifest }));
    const { result } = renderHook(() => useFigureManifest());
    await waitFor(() => expect(result.current?.figures["king-kong"]).toBeDefined());
  });

  // #877: the flat board draws no figures, so it must not request them.
  test("makes no request while disabled, then loads once enabled", async () => {
    const fetch = mockFetch(async () => ({ ok: true, json: async () => manifest }));
    const { result, rerender } = renderHook(({ on }) => useFigureManifest(on), { initialProps: { on: false } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
    rerender({ on: true });
    await waitFor(() => expect(result.current?.figures["king-kong"]).toBeDefined());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("is null when the deploy has no figures folder (404)", async () => {
    const fetch = mockFetch(async () => ({ ok: false, json: async () => ({}) }));
    const { result } = renderHook(() => useFigureManifest());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  test("is null, not a crash, when the request itself fails", async () => {
    const fetch = mockFetch(async () => {
      throw new Error("offline");
    });
    const { result } = renderHook(() => useFigureManifest());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  // jsdom — every page test in this repo — has no fetch at all. Calling it
  // throws synchronously, before any promise exists to catch it, and that
  // took down 19 unrelated suites the first time this hook shipped.
  test("is null, not a crash, where there is no fetch at all", async () => {
    (global as unknown as { fetch?: unknown }).fetch = undefined;
    const { result } = renderHook(() => useFigureManifest());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBeNull();
  });

  test("fetches once, however many boards ask", async () => {
    const fetch = mockFetch(async () => ({ ok: true, json: async () => manifest }));
    const a = renderHook(() => useFigureManifest());
    const b = renderHook(() => useFigureManifest());
    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

// #903: the committed open set is a second manifest beside the private one.
describe("useFigureManifests", () => {
  const openManifest = {
    version: 1,
    figures: {
      "baba-yaga": { ...manifest.figures["king-kong"], seats: { p1: "baba-yaga.p1.webp" },
        modelName: "Test Witch", creator: "Test Maker", sourceUrl: "https://example.org/witch" },
    },
  };

  test("loads both sets, each from its own folder", async () => {
    const fetch = mockFetch(async (...args: unknown[]) => {
      const url = args[0] as string;
      return { ok: true, json: async () => (url === "/figures-open/manifest.json" ? openManifest : manifest) };
    });
    const { result } = renderHook(() => useFigureManifests());
    await waitFor(() => expect(result.current.open?.figures["baba-yaga"]).toBeDefined());
    await waitFor(() => expect(result.current.private?.figures["king-kong"]).toBeDefined());
    expect(fetch.mock.calls.map((c) => c[0]).sort()).toEqual(["/figures-open/manifest.json", "/figures/manifest.json"]);
  });

  // #877 still holds for the second set: the flat board requests neither.
  test("requests neither manifest while disabled", async () => {
    const fetch = mockFetch(async () => ({ ok: true, json: async () => manifest }));
    renderHook(() => useFigureManifests(false));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetch).not.toHaveBeenCalled();
  });
});
