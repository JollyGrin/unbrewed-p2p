import { FIGURES_BASE_URL, figureFor, figureSpriteBox, parseFigureManifest } from "./figures";

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
