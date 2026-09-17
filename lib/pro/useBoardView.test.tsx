/**
 * Coverage for the board-view setting hook itself (tabletop board view phase
 * 1) — boardView.ts and tableProjection.ts already had unit coverage; this
 * hook, wired into the HUD chips for the first time in this change, did not.
 */
import { act, renderHook } from "@testing-library/react";
import { useBoardView, BOARD_VIEW_KEY } from "./useBoardView";

describe("useBoardView", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to the flat board on an untouched device", () => {
    const { result } = renderHook(() => useBoardView());
    expect(result.current[0]).toBe("flat");
  });

  it("toggles to table and back", () => {
    const { result } = renderHook(() => useBoardView());

    act(() => result.current[1]());
    expect(result.current[0]).toBe("table");

    act(() => result.current[1]());
    expect(result.current[0]).toBe("flat");
  });

  it("persists the choice to localStorage", () => {
    const { result } = renderHook(() => useBoardView());
    act(() => result.current[1]());
    expect(window.localStorage.getItem(BOARD_VIEW_KEY)).toBe("table");
  });

  it("reads a stored choice back on mount", () => {
    window.localStorage.setItem(BOARD_VIEW_KEY, "table");
    const { result } = renderHook(() => useBoardView());
    expect(result.current[0]).toBe("table");
  });

  it("ignores a corrupt stored value and stays on the default", () => {
    window.localStorage.setItem(BOARD_VIEW_KEY, "isometric-drone-cam");
    const { result } = renderHook(() => useBoardView());
    expect(result.current[0]).toBe("flat");
  });
});
