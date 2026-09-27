import { contentBoxFromRects, fitContent } from "./fitContent";

describe("fitContent", () => {
  const container = { w: 1000, h: 500 };

  test("a content box equal to the whole frame reproduces the classic frame fit", () => {
    // 800x400 frame into a 1000x500 viewport: width and height both allow 1.25.
    const fit = fitContent(container, {}, { left: 0, top: 0, width: 800, height: 400 });
    expect(fit.scale).toBeCloseTo(1.25);
    expect(fit.tx).toBeCloseTo(0);
    expect(fit.ty).toBeCloseTo(0);
  });

  test("scales to the drawn content, not the layout box, when the content is shorter", () => {
    // A tilted board: the frame is 800x400 but the projection is drawn in a
    // 400x200 box inside it. The frame fit stops at 1.25x; the content fit
    // may go to min(1000/400, 500/200) = 2.5x.
    const fit = fitContent(container, {}, { left: 100, top: 100, width: 400, height: 200 });
    expect(fit.scale).toBeCloseTo(2.5);
  });

  test("centres the CONTENT in the free region, not the frame", () => {
    const content = { left: 100, top: 100, width: 400, height: 200 };
    const fit = fitContent(container, { top: 50, right: 200, bottom: 50, left: 0 }, content);
    // free region 800x400 → scale min(800/400, 400/200) = 2
    expect(fit.scale).toBeCloseTo(2);
    const drawnLeft = fit.tx + content.left * fit.scale;
    const drawnTop = fit.ty + content.top * fit.scale;
    expect(drawnLeft).toBeCloseTo(0); // 800 wide content fills the 800 region from x=0
    expect(drawnTop).toBeCloseTo(50); // 400 tall content fills the 400 region from y=50
  });

  test("respects the zoom ceiling and still centres the content", () => {
    const content = { left: 0, top: 0, width: 100, height: 50 };
    const fit = fitContent(container, {}, content, 3);
    expect(fit.scale).toBe(3);
    expect(fit.tx + (content.width * fit.scale) / 2).toBeCloseTo(500);
    expect(fit.ty + (content.height * fit.scale) / 2).toBeCloseTo(250);
  });

  test("never returns a zero or negative scale for a degenerate region", () => {
    const fit = fitContent({ w: 10, h: 10 }, { right: 50, bottom: 50 }, { left: 0, top: 0, width: 100, height: 100 });
    expect(fit.scale).toBeGreaterThan(0);
  });
});

describe("contentBoxFromRects", () => {
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

  test("expresses the union of the drawn rects in the frame's own unscaled units", () => {
    // Frame layout width 800 drawn at 400px → rendered scale 0.5, origin (20, 30).
    const box = contentBoxFromRects(rect(20, 30, 400, 200), 800, [rect(70, 80, 100, 50), rect(120, 60, 100, 40)]);
    expect(box).toEqual({ left: 100, top: 60, width: 300, height: 140 });
  });

  test("returns null when nothing is drawn or the frame has no width yet", () => {
    expect(contentBoxFromRects(rect(0, 0, 400, 200), 800, [])).toBeNull();
    expect(contentBoxFromRects(rect(0, 0, 0, 0), 800, [rect(0, 0, 10, 10)])).toBeNull();
    expect(contentBoxFromRects(rect(0, 0, 400, 200), 800, [rect(5, 5, 0, 0)])).toBeNull();
  });
});
