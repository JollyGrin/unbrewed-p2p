import { act, renderHook, waitFor } from "@testing-library/react";
import { loadGameIcons, resetGameIcons, useGameIcons } from "./gameIcons";

// p2p #1605: a failed icon chunk is not cached; a later load can succeed.

jest.mock("react-icons/gi", () => ({ GiFireShield: () => null }));

const chunkError = () => Object.assign(new Error("Loading chunk 4980 failed.\n(error: x)"), { name: "ChunkLoadError" });

// loadChunk's own retry/stale logic is covered in lib/lazyChunk.test.tsx; here
// it fails when told to and otherwise runs the real import.
let mockFailNext = 0;
const mockLoadChunk = jest.fn((load: () => Promise<unknown>) => {
  if (mockFailNext > 0) {
    mockFailNext -= 1;
    return Promise.reject(chunkError());
  }
  return load();
});
jest.mock("../lazyChunk", () => ({
  loadChunk: (load: () => Promise<unknown>) => mockLoadChunk(load),
}));

beforeEach(() => {
  resetGameIcons();
  mockFailNext = 0;
  mockLoadChunk.mockClear();
});

describe("loadGameIcons", () => {
  it("after a failed load, a later call loads the set", async () => {
    mockFailNext = 1;
    await expect(loadGameIcons()).rejects.toMatchObject({ name: "ChunkLoadError" });
    const icons = await loadGameIcons();
    expect(Object.keys(icons)).toContain("GiFireShield");
    expect(mockLoadChunk).toHaveBeenCalledTimes(2);
    // Loaded: no further download.
    await loadGameIcons();
    expect(mockLoadChunk).toHaveBeenCalledTimes(2);
  });
});

describe("useGameIcons", () => {
  it("a failure leaves icons off without an unhandled rejection; a new retryKey loads them", async () => {
    mockFailNext = 1;
    const { result, rerender } = renderHook(({ open }) => useGameIcons(true, open), {
      initialProps: { open: false },
    });
    await act(async () => {});
    expect(mockLoadChunk).toHaveBeenCalledTimes(1);
    expect(result.current).toBeNull();

    rerender({ open: true });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(mockLoadChunk).toHaveBeenCalledTimes(2);
  });

  it("a load started by one caller fills every mounted hook", async () => {
    mockFailNext = 1;
    const board = renderHook(() => useGameIcons(true));
    await act(async () => {});
    expect(board.result.current).toBeNull();

    // The token library opens and its load succeeds: the board gets the icons too.
    const library = renderHook(() => useGameIcons(true, true));
    await waitFor(() => expect(library.result.current).not.toBeNull());
    expect(board.result.current).toBe(library.result.current);
  });

  it("disabled: no download", async () => {
    renderHook(() => useGameIcons(false));
    await act(async () => {});
    expect(mockLoadChunk).not.toHaveBeenCalled();
  });
});
