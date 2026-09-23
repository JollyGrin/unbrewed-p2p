import { pickTapSizePx, tableFocusBox } from "./tableFocus";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("tableFocusBox", () => {
  test("returns null when there is nothing to pick, so the view can release its focus", () => {
    expect(tableFocusBox([], [box(0, 0, 10, 10)])).toBeNull();
  });

  test("with no fighters to keep in view, frames exactly the picks", () => {
    expect(tableFocusBox([box(10, 20, 30, 40), box(50, 5, 60, 25)], [])).toEqual(box(10, 5, 60, 40));
  });

  test("grows to keep every fighter in frame, not just the picks", () => {
    // The picks sit top-left; the opponent stands far to the right. A focus on
    // the picks alone pushed that opponent under the landscape rail.
    const picks = [box(100, 100, 130, 120), box(150, 100, 180, 120)];
    const fighters = [box(90, 80, 110, 110), box(480, 200, 500, 240)];
    expect(tableFocusBox(picks, fighters)).toEqual(box(90, 80, 500, 240));
  });

  test("ignores zero-size rects, which are elements not laid out yet", () => {
    const picks = [box(10, 10, 20, 20), box(0, 0, 0, 0)];
    const fighters = [box(900, 900, 900, 900)];
    expect(tableFocusBox(picks, fighters)).toEqual(box(10, 10, 20, 20));
  });

  test("returns null when every pick is zero-size", () => {
    expect(tableFocusBox([box(5, 5, 5, 5)], [box(0, 0, 10, 10)])).toBeNull();
  });
});

describe("pickTapSizePx", () => {
  test("a foreshortened space counts by its area, not its short side", () => {
    // 60 x 40 on screen: comfortable under a thumb, though only 40 tall.
    expect(pickTapSizePx({ width: 60, height: 40 })).toBeCloseTo(48.99, 1);
  });

  test("a round pick is simply its diameter", () => {
    expect(pickTapSizePx({ width: 44, height: 44 })).toBe(44);
  });

  test("a sliver is still small, however long it is", () => {
    expect(pickTapSizePx({ width: 90, height: 10 })).toBe(30);
  });
});
