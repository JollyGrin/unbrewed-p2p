import { act, render, screen } from "@testing-library/react";
import {
  CHUNK_RETRY_MS,
  checkForNewBuild,
  chunkFailureVariant,
  chunkIdOf,
  isChunkLoadError,
  loadChunk,
  readBuildId,
} from "./lazyChunk";
import { RELOAD_GUARD_KEY, isClientStale, reloadPage, resetClientStale } from "./staleClient";
import { resetOncePerPageLoad } from "./analyticsErrors";
import { StaleClientBanner } from "@/components/StaleClientBanner";

// p2p #1605: lazy chunks that fail, retry, and flag a stale build without a loop.

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>, _opts?: unknown) => true);
jest.mock("./analytics", () => ({
  ...jest.requireActual("./analytics"),
  track: (event: string, props?: Record<string, unknown>, opts?: unknown) => mockTrack(event, props, opts),
}));

/** What webpack's jsonp runtime throws. */
const chunkError = (variant: "error" | "timeout" | "missing" = "error", id = "4980") => {
  const url = `https://unbrewed.xyz/_next/static/chunks/545f34e4.7800b5e957e86ce3.js`;
  const err = new Error(`Loading chunk ${id} failed.\n(${variant}: ${url})`) as Error & { type: string; request: string };
  err.name = "ChunkLoadError";
  err.type = variant;
  err.request = url;
  return err;
};

const page = (buildId: string) =>
  `<!DOCTYPE html><html><head></head><body><div id="__next"></div>` +
  `<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{}},"page":"/game","query":{},"buildId":"${buildId}","nextExport":true}</script></body></html>`;

const serve = (html: string, ok = true) =>
  jest.fn(async () => ({ ok, text: async () => html }) as unknown as Response);

const chunkEvents = () => mockTrack.mock.calls.filter(([event]) => event === "chunk_load_failed");

const setPath = (path: string) => window.history.replaceState({}, "", path);

/** Run a loadChunk call to the end: past the retry delay and the stale check. */
const settle = async <T,>(p: Promise<T>) => {
  const out = p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: undefined as T | undefined, error }),
  );
  await act(async () => {
    await jest.advanceTimersByTimeAsync(CHUNK_RETRY_MS);
  });
  return out;
};

let reload: jest.SpyInstance;
const realFetch = global.fetch;

beforeEach(() => {
  jest.useFakeTimers();
  mockTrack.mockReset().mockImplementation(() => true);
  resetOncePerPageLoad();
  resetClientStale();
  window.sessionStorage.clear();
  setPath("/");
  (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__ = { buildId: "build-old" };
  global.fetch = serve(page("build-old"));
  reload = jest.spyOn(reloadPage, "run").mockImplementation(() => {});
});

afterEach(() => {
  reload.mockRestore();
  global.fetch = realFetch;
  delete (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__;
  jest.useRealTimers();
});

describe("chunk error parsing", () => {
  it("recognises webpack's ChunkLoadError by name or message", () => {
    expect(isChunkLoadError(chunkError())).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 12 failed.\n(error: x)"))).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 7 failed.\n(x)"))).toBe(true);
    expect(isChunkLoadError(new TypeError("x is undefined"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError("Loading chunk 1 failed")).toBe(false);
  });

  it("reads the variant and the chunk id", () => {
    expect(chunkFailureVariant(chunkError("timeout"))).toBe("timeout");
    expect(chunkFailureVariant(new Error("Loading chunk 1 failed.\n(timeout: u)"))).toBe("timeout");
    expect(chunkFailureVariant(chunkError("error"))).toBe("error");
    expect(chunkFailureVariant(chunkError("missing"))).toBe("error");
    expect(chunkIdOf(chunkError("error", "4980"))).toBe("4980");
    expect(chunkIdOf(new Error("boom"))).toBe("unknown");
  });

  it("reads buildId from a page's __NEXT_DATA__", () => {
    expect(readBuildId(page("abc123"))).toBe("abc123");
    expect(readBuildId("<html></html>")).toBeNull();
    expect(readBuildId(`<script id="__NEXT_DATA__" type="application/json">{not json</script>`)).toBeNull();
  });
});

describe("loadChunk", () => {
  it("retries once after a chunk failure and reports it as recovered", async () => {
    const load = jest.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce("mod");
    const p = loadChunk(load);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(CHUNK_RETRY_MS - 1);
    });
    expect(load).toHaveBeenCalledTimes(1);
    const { value, error } = await settle(p);
    expect(error).toBeNull();
    expect(value).toBe("mod");
    expect(load).toHaveBeenCalledTimes(2);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chunkEvents()).toEqual([
      ["chunk_load_failed", { chunk: "4980", variant: "error", stale: false, recovered: true }, undefined],
    ]);
  });

  it("a second failure rejects with the original error; a later call starts a fresh import", async () => {
    const first = chunkError();
    const load = jest.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(chunkError());
    const { error } = await settle(loadChunk(load));
    expect(error).toBe(first);
    expect(load).toHaveBeenCalledTimes(2);

    load.mockResolvedValueOnce("mod");
    const { value } = await settle(loadChunk(load));
    expect(value).toBe("mod");
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("does not retry an error that is not a chunk failure", async () => {
    const boom = new TypeError("boom");
    const load = jest.fn().mockRejectedValue(boom);
    const { error } = await settle(loadChunk(load));
    expect(error).toBe(boom);
    expect(load).toHaveBeenCalledTimes(1);
    expect(chunkEvents()).toHaveLength(0);
  });

  it("same build (a timeout): no banner, no reload, one event per chunk per page load", async () => {
    const load = jest.fn().mockRejectedValue(chunkError("timeout"));
    await settle(loadChunk(load));
    await settle(loadChunk(load));
    expect(global.fetch).toHaveBeenCalledWith(window.location.href, expect.objectContaining({ cache: "no-store" }));
    expect(isClientStale()).toBe(false);
    render(<StaleClientBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(chunkEvents()).toEqual([
      ["chunk_load_failed", { chunk: "4980", variant: "timeout", stale: false, recovered: false }, undefined],
    ]);
  });

  it("newer build on /game: banner, never a reload; Reload loads the new build", async () => {
    setPath("/game?name=alice&gid=room1");
    global.fetch = serve(page("build-new"));
    const load = jest.fn().mockRejectedValue(chunkError());
    await settle(loadChunk(load));
    await settle(loadChunk(load));

    expect(isClientStale()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull();
    expect(chunkEvents()).toEqual([
      ["chunk_load_failed", { chunk: "4980", variant: "error", stale: true, recovered: false }, undefined],
    ]);

    render(<StaleClientBanner />);
    expect(screen.getByText(/The game updated — refresh the page/)).toBeTruthy();
    act(() => screen.getByRole("button", { name: "Reload" }).click());
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it.each(["/offline", "/irl", "/table", "/pro/game", "/game.html", "/decks", "/bag", "/"])(
    "newer build on %s: banner only, never an automatic reload",
    async (path) => {
      setPath(path);
      global.fetch = serve(page("build-new"));
      await settle(loadChunk(jest.fn().mockRejectedValue(chunkError())));
      expect(isClientStale()).toBe(true);
      expect(reload).not.toHaveBeenCalled();
      expect(window.sessionStorage.getItem(RELOAD_GUARD_KEY)).toBeNull();
    },
  );

  it("no table on screen (/bag token editor): repeated failures never reload, the banner stays", async () => {
    setPath("/bag");
    global.fetch = serve(page("build-new"));
    const load = jest.fn().mockRejectedValue(chunkError());
    for (let i = 0; i < 3; i++) {
      await settle(loadChunk(load));
      // A hidden tab coming back is no reload trigger either.
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }
    jest.setSystemTime(Date.now() + 11 * 60 * 1000);
    await settle(loadChunk(load));
    expect(reload).not.toHaveBeenCalled();
    render(<StaleClientBanner />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("a stale verdict is reported even after the chunk was reported as not stale", async () => {
    const load = jest.fn().mockRejectedValue(chunkError());
    await settle(loadChunk(load));
    // A deploy lands; the same chunk fails again.
    global.fetch = serve(page("build-new"));
    await settle(loadChunk(load));
    await settle(loadChunk(load));
    expect(chunkEvents().map(([, props]) => props)).toEqual([
      { chunk: "4980", variant: "error", stale: false, recovered: false },
      { chunk: "4980", variant: "error", stale: true, recovered: false },
    ]);
  });

  it("a stale verdict is reported even after the chunk recovered once", async () => {
    const load = jest.fn().mockRejectedValueOnce(chunkError()).mockResolvedValueOnce("mod");
    await settle(loadChunk(load));
    global.fetch = serve(page("build-new"));
    load.mockRejectedValue(chunkError());
    await settle(loadChunk(load));
    expect(chunkEvents().map(([, props]) => props)).toEqual([
      { chunk: "4980", variant: "error", stale: false, recovered: true },
      { chunk: "4980", variant: "error", stale: true, recovered: false },
    ]);
  });
});

describe("checkForNewBuild", () => {
  it("stale for a different buildId", async () => {
    global.fetch = serve(page("build-new"));
    await expect(checkForNewBuild()).resolves.toBe(true);
  });

  it("not stale for the same buildId", async () => {
    await expect(checkForNewBuild()).resolves.toBe(false);
  });

  it("not stale when the fetch fails, is not OK, or the page has no buildId", async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(checkForNewBuild()).resolves.toBe(false);
    global.fetch = serve(page("build-new"), false);
    await expect(checkForNewBuild()).resolves.toBe(false);
    global.fetch = serve("<html>maintenance</html>");
    await expect(checkForNewBuild()).resolves.toBe(false);
  });

  it("not stale when this page has no buildId of its own", async () => {
    delete (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__;
    global.fetch = serve(page("build-new"));
    await expect(checkForNewBuild()).resolves.toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("concurrent callers share one request", async () => {
    global.fetch = serve(page("build-new"));
    await expect(Promise.all([checkForNewBuild(), checkForNewBuild()])).resolves.toEqual([true, true]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("a finished check is not reused: the next one asks again", async () => {
    await expect(checkForNewBuild()).resolves.toBe(false);
    global.fetch = serve(page("build-new"));
    await expect(checkForNewBuild()).resolves.toBe(true);
    // Also after a check that settled without any request.
    resetClientStale();
    delete (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__;
    await expect(checkForNewBuild()).resolves.toBe(false);
    (window as unknown as { __NEXT_DATA__?: unknown }).__NEXT_DATA__ = { buildId: "build-old" };
    await expect(checkForNewBuild()).resolves.toBe(true);
  });
});
