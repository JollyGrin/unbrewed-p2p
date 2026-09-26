import { act, renderHook } from "@testing-library/react";
import { FIGURE_STYLE_KEY, useFigureStyle } from "./useFigureStyle";

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
