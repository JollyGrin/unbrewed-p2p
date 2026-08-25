/**
 * The Slow mode setting (#703) — the same three contracts every per-browser Pro
 * toggle has to hold, each of which is a bug if it slips:
 *
 *  - It defaults OFF. Slow mode makes the game wait on the player; a player who
 *    never asked for it must not have to discover and disable it.
 *  - It renders `false` on the FIRST paint whatever storage says, then syncs —
 *    the no-hydration-flash contract shared with `useHideOpponentCosmetics`.
 *  - Blocked storage is a silent no-op, not a crash (Safari private mode).
 */
import { act, renderHook } from "@testing-library/react";
import { SLOW_MODE_KEY, useSlowMode } from "./useSlowMode";

beforeEach(() => window.localStorage.clear());

describe("useSlowMode", () => {
  it("defaults to off", () => {
    const { result } = renderHook(() => useSlowMode());
    expect(result.current[0]).toBe(false);
  });

  it("reads a stored opt-in after mount, so the setting survives a reload", () => {
    window.localStorage.setItem(SLOW_MODE_KEY, "on");
    const { result } = renderHook(() => useSlowMode());
    expect(result.current[0]).toBe(true);
  });

  it("persists both directions", () => {
    const { result } = renderHook(() => useSlowMode());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(SLOW_MODE_KEY)).toBe("on");

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(SLOW_MODE_KEY)).toBe("off");
  });

  it("treats any other stored value as off", () => {
    for (const stored of ["off", "", "true", "yes"]) {
      window.localStorage.setItem(SLOW_MODE_KEY, stored);
      const { result } = renderHook(() => useSlowMode());
      expect(result.current[0]).toBe(false);
    }
  });

  it("survives storage that throws (private browsing) without crashing", () => {
    const getItem = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      const { result } = renderHook(() => useSlowMode());
      expect(result.current[0]).toBe(false);
      // The toggle still works for this session; it just doesn't persist.
      act(() => result.current[1]());
      expect(result.current[0]).toBe(true);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
