import { act, renderHook } from "@testing-library/react";
import { FIGURE_STYLE_KEY, useFigureStyle } from "./useFigureStyle";
import { effectiveFigureStyle } from "./figures";

afterEach(() => window.localStorage.clear());

describe("useFigureStyle", () => {
  test("is unchosen until the viewer picks, then survives a reload", () => {
    const first = renderHook(() => useFigureStyle());
    expect(first.result.current[0]).toBeNull();
    act(() => first.result.current[1]("token"));
    expect(first.result.current[0]).toBe("token");
    first.unmount();
    // A fresh mount stands in for a reload: it reads the stored choice.
    const again = renderHook(() => useFigureStyle());
    expect(again.result.current[0]).toBe("token");
  });

  // #953 migration: the three values the #903 toggle ever stored keep their
  // meaning (and key), so nobody loses their choice when 3D minis arrive.
  test.each([
    ["private", ["3d", "private", "open", "token"], "private"],
    ["open", ["3d", "open", "token"], "open"],
    ["token", ["3d", "open", "token"], "token"],
    // A board that cannot show the old choice: the next sprite set, else the board's best.
    ["private", ["3d", "open", "token"], "open"],
    ["open", ["3d", "token"], "3d"],
  ] as const)("a stored #903 value %p survives the upgrade (board %p → %p)", (stored, options, drawn) => {
    window.localStorage.setItem(FIGURE_STYLE_KEY, stored);
    const { result } = renderHook(() => useFigureStyle());
    expect(result.current[0]).toBe(stored);
    expect(effectiveFigureStyle(result.current[0], [...options])).toBe(drawn);
    expect(window.localStorage.getItem(FIGURE_STYLE_KEY)).toBe(stored);
  });

  test("the 3D styles are stored under the same key", () => {
    const first = renderHook(() => useFigureStyle());
    act(() => first.result.current[1]("3d"));
    first.unmount();
    expect(window.localStorage.getItem(FIGURE_STYLE_KEY)).toBe("3d");
    expect(renderHook(() => useFigureStyle()).result.current[0]).toBe("3d");
  });

  test("ignores a stored value that is not a style", () => {
    window.localStorage.setItem(FIGURE_STYLE_KEY, "hologram");
    expect(renderHook(() => useFigureStyle()).result.current[0]).toBeNull();
  });

  test("blocked storage never throws", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useFigureStyle());
    act(() => result.current[1]("open"));
    expect(result.current[0]).toBe("open");
    spy.mockRestore();
    set.mockRestore();
  });
});
