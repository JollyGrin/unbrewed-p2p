/**
 * The turn reminder setting — the same per-browser-toggle contracts as
 * `useSlowMode.test.tsx`, mirrored here with the DEFAULT flipped:
 *
 *  - It defaults ON. A player who never opened the menu still gets nudged.
 *  - It renders `true` on the FIRST paint whatever storage says, then syncs —
 *    the no-hydration-flash contract every per-browser Pro toggle shares.
 *  - Blocked storage is a silent no-op, not a crash (Safari private mode).
 */
import { act, renderHook } from "@testing-library/react";
import { TURN_REMINDER_KEY, useTurnReminderSetting } from "./useTurnReminderSetting";

beforeEach(() => window.localStorage.clear());

describe("useTurnReminderSetting", () => {
  it("defaults to on", () => {
    const { result } = renderHook(() => useTurnReminderSetting());
    expect(result.current[0]).toBe(true);
  });

  it("reads a stored opt-out after mount, so the setting survives a reload", () => {
    window.localStorage.setItem(TURN_REMINDER_KEY, "off");
    const { result } = renderHook(() => useTurnReminderSetting());
    expect(result.current[0]).toBe(false);
  });

  it("persists both directions", () => {
    const { result } = renderHook(() => useTurnReminderSetting());
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(TURN_REMINDER_KEY)).toBe("off");

    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(TURN_REMINDER_KEY)).toBe("on");
  });

  it("treats any other stored value as on", () => {
    for (const stored of ["on", "", "true", "no"]) {
      window.localStorage.setItem(TURN_REMINDER_KEY, stored);
      const { result } = renderHook(() => useTurnReminderSetting());
      expect(result.current[0]).toBe(true);
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
      const { result } = renderHook(() => useTurnReminderSetting());
      expect(result.current[0]).toBe(true);
      // The toggle still works for this session; it just doesn't persist.
      act(() => result.current[1]());
      expect(result.current[0]).toBe(false);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
