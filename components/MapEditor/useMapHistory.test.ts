import { act, renderHook } from "@testing-library/react";
import { useMapHistory } from "./useMapHistory";

describe("useMapHistory", () => {
  it("commits, undoes, and redoes", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.commit({ n: 1 }));
    act(() => result.current.commit((p) => ({ n: p.n + 1 })));
    expect(result.current.present).toEqual({ n: 2 });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 1 });
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 0 });
    expect(result.current.canUndo).toBe(false);

    act(() => result.current.redo());
    expect(result.current.present).toEqual({ n: 1 });
    expect(result.current.canRedo).toBe(true);
  });

  it("ignores no-op commits", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.commit((p) => p)); // returns same reference
    expect(result.current.canUndo).toBe(false);
  });

  it("folds a transient gesture into a single history entry", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.beginTransient());
    act(() => result.current.update({ n: 1 }));
    act(() => result.current.update({ n: 2 }));
    act(() => result.current.update({ n: 3 }));
    act(() => result.current.endTransient());
    expect(result.current.present).toEqual({ n: 3 });

    // one undo returns to the pre-gesture baseline, not each intermediate step
    act(() => result.current.undo());
    expect(result.current.present).toEqual({ n: 0 });
  });

  it("endTransient with no change records nothing (click, not drag)", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.beginTransient());
    act(() => result.current.endTransient());
    expect(result.current.canUndo).toBe(false);
  });

  it("commit clears the redo stack", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.commit({ n: 1 }));
    act(() => result.current.undo());
    act(() => result.current.commit({ n: 9 }));
    expect(result.current.canRedo).toBe(false);
    expect(result.current.present).toEqual({ n: 9 });
  });

  it("load replaces present and drops history", () => {
    const { result } = renderHook(() => useMapHistory({ n: 0 }));
    act(() => result.current.commit({ n: 1 }));
    act(() => result.current.load({ n: 42 }));
    expect(result.current.present).toEqual({ n: 42 });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });
});
