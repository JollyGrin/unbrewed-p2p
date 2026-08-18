/**
 * The "hide opponent cosmetics" setting (#615). Three things are pinned, and
 * each is a bug someone would otherwise hit:
 *
 *  - It defaults OFF. Showing your upgrades to the other seat is the epic's
 *    whole point; the opt-out has to be an opt-out.
 *  - It renders `false` on the FIRST paint whatever storage says, then syncs —
 *    the same no-hydration-flash contract `useGameFx`'s toggles have.
 *  - Blocked storage is a silent no-op, not a crash (Safari private mode).
 */
import { act, renderHook } from "@testing-library/react";
import {
  HIDE_OPPONENT_COSMETICS_KEY,
  useHideOpponentCosmetics,
} from "./useHideOpponentCosmetics";

beforeEach(() => window.localStorage.clear());

describe("useHideOpponentCosmetics", () => {
  it("defaults to NOT hiding", () => {
    const { result } = renderHook(() => useHideOpponentCosmetics());
    expect(result.current[0]).toBe(false);
  });

  it("reads a stored opt-out after mount", () => {
    window.localStorage.setItem(HIDE_OPPONENT_COSMETICS_KEY, "on");
    const { result } = renderHook(() => useHideOpponentCosmetics());
    expect(result.current[0]).toBe(true);
  });

  it("persists both directions, so the setting survives a reload", () => {
    const { result } = renderHook(() => useHideOpponentCosmetics());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(HIDE_OPPONENT_COSMETICS_KEY)).toBe("on");

    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(HIDE_OPPONENT_COSMETICS_KEY)).toBe("off");
  });

  it("treats any other stored value as 'show'", () => {
    for (const stored of ["off", "", "true", "yes"]) {
      window.localStorage.setItem(HIDE_OPPONENT_COSMETICS_KEY, stored);
      const { result } = renderHook(() => useHideOpponentCosmetics());
      expect(result.current[0]).toBe(false);
    }
  });

  it("survives storage that throws (private browsing) without crashing", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      const { result } = renderHook(() => useHideOpponentCosmetics());
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
