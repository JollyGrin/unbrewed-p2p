import { FIGURES_BASE_URL, LARGE_FIGURE_SCALE, figureFor, figureGroundSlice, figureSpriteBox, parseFigureManifest, straddleAnim } from "./figures";

const kong = {
  anchor: { x: 0.5, y: 0.74 },
  imageWidthMm: 80.9,
  footprintMm: 62.8,
  aspect: 1.5,
  seats: { p1: "king-kong.p1.webp", p2: "king-kong.p2.webp" },
};

describe("parseFigureManifest", () => {
  test("accepts a well-formed manifest", () => {
    const m = parseFigureManifest({ version: 1, figures: { "king-kong": kong } });
    expect(m?.figures["king-kong"].seats.p2).toBe("king-kong.p2.webp");
  });

  test("drops a malformed figure instead of rejecting the whole manifest", () => {
    const m = parseFigureManifest({
      version: 1,
      figures: { "king-kong": kong, broken: { ...kong, footprintMm: "wide" } },
    });
    expect(Object.keys(m?.figures ?? {})).toEqual(["king-kong"]);
  });

  test("rejects anything that is not a version-1 manifest", () => {
    expect(parseFigureManifest(null)).toBeNull();
    expect(parseFigureManifest({ version: 2, figures: {} })).toBeNull();
    expect(parseFigureManifest("<!doctype html>")).toBeNull();
  });

  test("refuses file names that could leave the figures folder", () => {
    const m = parseFigureManifest({
      version: 1,
      figures: { "king-kong": { ...kong, seats: { p1: "../secret.png", p2: "king-kong.p2.webp" } } },
    });
    expect(m?.figures["king-kong"].seats).toEqual({ p2: "king-kong.p2.webp" });
  });
});

describe("figureFor", () => {
  const manifest = parseFigureManifest({ version: 1, figures: { "king-kong": kong } });

  test("returns the render tinted for the fighter's own seat", () => {
    expect(figureFor(manifest, "king-kong", "p2")?.url).toBe(`${FIGURES_BASE_URL}/king-kong.p2.webp`);
  });

  test("returns null for a hero without a figure, a seat without a render, or no manifest", () => {
    expect(figureFor(manifest, "thrall", "p1")).toBeNull();
    expect(figureFor(manifest, "king-kong", "p3")).toBeNull();
    expect(figureFor(null, "king-kong", "p1")).toBeNull();
    expect(figureFor(manifest, undefined, "p1")).toBeNull();
  });
});

describe("figureSpriteBox", () => {
  test("scales the model so its base spans the standee's base disc", () => {
    const fig = figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": kong } }), "king-kong", "p1")!;
    const box = figureSpriteBox(fig, 62.8);
    // 1 mm of model = 1 px here, so the image is exactly imageWidthMm wide.
    expect(box.width).toBeCloseTo(80.9);
    expect(box.height).toBeCloseTo(80.9 * 1.5);
  });

  test("places the model's ground point on the anchor (the fighter's feet)", () => {
    const fig = figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": kong } }), "king-kong", "p1")!;
    const box = figureSpriteBox(fig, 40);
    expect(box.left + fig.anchor.x * box.width).toBeCloseTo(0);
    expect(box.top + fig.anchor.y * box.height).toBeCloseTo(0);
  });
});

describe("figureGroundSlice", () => {
  const box = { width: 80, height: 120, left: -40, top: -90 }; // 30px below the feet

  test("lays the part of the image below the feet flat on the board, stretched against the tilt", () => {
    const slice = figureGroundSlice(box, 60)!;
    // cos(60°) = 0.5: the board shows an in-plane length at half size, so the
    // strip is laid out twice as deep as the 30px it must show on screen.
    expect(slice.left).toBe(-40);
    expect(slice.width).toBe(80);
    expect(slice.height).toBeCloseTo(60);
    expect(slice.imageTop).toBeCloseTo(-180);
    expect(slice.imageHeight).toBeCloseTo(240);
  });

  test("puts the image's feet line on the strip's top edge", () => {
    const slice = figureGroundSlice(box, 40)!;
    const stretch = 1 / Math.cos((40 * Math.PI) / 180);
    expect(slice.imageTop + 0.75 * slice.imageHeight).toBeCloseTo(0);
    expect(slice.height).toBeCloseTo(30 * stretch);
  });

  test("is not needed when nothing of the model reaches below its feet", () => {
    expect(figureGroundSlice({ ...box, top: -120 }, 40)).toBeNull();
  });
});

describe("LARGE fighters' figures", () => {
  test("a two-space figure is drawn larger than a one-space one", () => {
    expect(LARGE_FIGURE_SCALE).toBeGreaterThan(1);
  });

  test("the straddling figure glides along the midpoints of head and tail", () => {
    const head = { xs: [0.1, 0.2, 0.3], ys: [0.5, 0.5, 0.6], durationSec: 1 };
    const tail = { xs: [0.0, 0.1, 0.2], ys: [0.5, 0.5, 0.5], durationSec: 1 };
    const mid = straddleAnim(head, tail);
    expect(mid?.xs.map((v) => +v.toFixed(3))).toEqual([0.05, 0.15, 0.25]);
    expect(mid?.ys.map((v) => +v.toFixed(3))).toEqual([0.5, 0.5, 0.55]);
    expect(mid?.durationSec).toBe(1);
  });

  test("snaps rather than guessing when the two paths do not pair up", () => {
    const head = { xs: [0.1, 0.2], ys: [0.5, 0.5], durationSec: 0.5 };
    expect(straddleAnim(head, null)).toBeNull();
    expect(straddleAnim(head, { xs: [0.1], ys: [0.5], durationSec: 0 })).toBeNull();
    expect(straddleAnim(null, null)).toBeNull();
  });
});
