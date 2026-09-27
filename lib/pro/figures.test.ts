import {
  FIGURES_BASE_URL,
  LARGE_FIGURE_SCALE,
  figureFor,
  figureGroundSlice,
  figureSpriteBox,
  isCleared,
  parseFigureManifest,
  straddleAnim,
} from "./figures";
import { DEFAULT_TILT_DEG } from "./tableProjection";
const { boardTiltDeg, defaultElevDeg, elevForTilt } = require("../../scripts/figures/camera.cjs") as {
  boardTiltDeg: (source?: string) => number;
  defaultElevDeg: (source?: string) => number;
  elevForTilt: (tiltDeg: number) => number;
};
const { clearanceBlockers } = require("../../scripts/figures/clearance.cjs") as {
  clearanceBlockers: (entry: unknown) => string[];
};

const kong = {
  anchor: { x: 0.5, y: 0.74 },
  imageWidthMm: 80.9,
  footprintMm: 62.8,
  aspect: 1.5,
  seats: { p1: "king-kong.p1.webp", p2: "king-kong.p2.webp" },
  // A made-up clearance for the fixture: no real model's status is decided here.
  license: "CC-BY-4.0",
  redistributable: true,
  officialHero: false,
};

const { license: _l, redistributable: _r, officialHero: _o, ...uncleared } = kong;

/** Every way an entry can fail the licence gate (unbrewed-p2p-879). */
const NOT_CLEARED: Record<string, unknown> = {
  "no licence fields at all": uncleared,
  "no license": { ...uncleared, redistributable: true, officialHero: false },
  "an empty license": { ...kong, license: "  " },
  "a non-string license": { ...kong, license: 1 },
  "no redistributable": { ...uncleared, license: "CC-BY-4.0", officialHero: false },
  "redistributable: false": { ...kong, redistributable: false },
  'redistributable: "true" (not the boolean)': { ...kong, redistributable: "true" },
  "no officialHero": { ...uncleared, license: "CC-BY-4.0", redistributable: true },
  "officialHero: true": { ...kong, officialHero: true },
  "officialHero: 0 (not the boolean false)": { ...kong, officialHero: 0 },
};

describe("licence gate", () => {
  test("a cleared entry survives, with its declarations", () => {
    const m = parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private");
    expect(m?.figures["king-kong"]).toMatchObject({ license: "CC-BY-4.0", redistributable: true, officialHero: false });
  });

  test.each(Object.entries(NOT_CLEARED))("drops an entry with %s", (_why, entry) => {
    const m = parseFigureManifest({ version: 1, figures: { "king-kong": kong, gated: entry } }, "private");
    expect(Object.keys(m?.figures ?? {})).toEqual(["king-kong"]);
    expect(figureFor(m, "gated", "p1", "private")).toBeNull();
  });

  test("render.cjs clears exactly what the app clears", () => {
    expect(clearanceBlockers(kong)).toEqual([]);
    for (const entry of Object.values(NOT_CLEARED)) {
      expect(clearanceBlockers(entry).length).toBeGreaterThan(0);
      expect(isCleared(entry as Record<string, unknown>)).toBe(false);
    }
    expect(clearanceBlockers(null)).toHaveLength(3);
  });
});

describe("parseFigureManifest", () => {
  test("accepts a well-formed manifest", () => {
    const m = parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private");
    expect(m?.figures["king-kong"].seats.p2).toBe("king-kong.p2.webp");
  });

  test("drops a malformed figure instead of rejecting the whole manifest", () => {
    const m = parseFigureManifest({
      version: 1,
      figures: { "king-kong": kong, broken: { ...kong, footprintMm: "wide" } },
    }, "private");
    expect(Object.keys(m?.figures ?? {})).toEqual(["king-kong"]);
  });

  test("rejects anything that is not a version-1 manifest", () => {
    expect(parseFigureManifest(null, "private")).toBeNull();
    expect(parseFigureManifest({ version: 2, figures: {} }, "private")).toBeNull();
    expect(parseFigureManifest("<!doctype html>", "private")).toBeNull();
  });

  test("refuses file names that could leave the figures folder", () => {
    const m = parseFigureManifest({
      version: 1,
      figures: { "king-kong": { ...kong, seats: { p1: "../secret.png", p2: "king-kong.p2.webp" } } },
    }, "private");
    expect(m?.figures["king-kong"].seats).toEqual({ p2: "king-kong.p2.webp" });
  });
});

describe("figureFor", () => {
  const manifest = parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private");

  test("returns the render tinted for the fighter's own seat", () => {
    expect(figureFor(manifest, "king-kong", "p2", "private")?.url).toBe(`${FIGURES_BASE_URL}/king-kong.p2.webp`);
  });

  test("returns null for a hero without a figure, a seat without a render, or no manifest", () => {
    expect(figureFor(manifest, "thrall", "p1", "private")).toBeNull();
    expect(figureFor(manifest, "king-kong", "p3", "private")).toBeNull();
    expect(figureFor(null, "king-kong", "p1", "private")).toBeNull();
    expect(figureFor(manifest, undefined, "p1", "private")).toBeNull();
  });
});

describe("figureSpriteBox", () => {
  test("scales the model so its base spans the standee's base disc", () => {
    const fig = figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private"), "king-kong", "p1", "private")!;
    const box = figureSpriteBox(fig, 62.8);
    // 1 mm of model = 1 px here, so the image is exactly imageWidthMm wide.
    expect(box.width).toBeCloseTo(80.9);
    expect(box.height).toBeCloseTo(80.9 * 1.5);
  });

  test("places the model's ground point on the anchor (the fighter's feet)", () => {
    const fig = figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private"), "king-kong", "p1", "private")!;
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

  test("un-foreshortens the render's own ground plane: 1/sin of the render's elevation (#926)", () => {
    // The renders are taken from 90° − tilt, where that is 1/cos(tilt)…
    expect(figureGroundSlice(box, 40, 50)).toEqual(figureGroundSlice(box, 40));
    // …and a render taken from elsewhere is laid out by ITS angle, not the board's.
    const slice = figureGroundSlice(box, 40, 30)!;
    expect(slice.height).toBeCloseTo(30 / Math.sin((30 * Math.PI) / 180));
    expect(slice.imageTop + 0.75 * slice.imageHeight).toBeCloseTo(0);
  });

  test("a base of radius R, drawn R·sin(elev) below the anchor, lies R deep on the board", () => {
    const tilt = 40;
    const elev = 90 - tilt;
    const R = 31.4;
    const below = R * Math.sin((elev * Math.PI) / 180);
    const slice = figureGroundSlice({ width: 80, height: 100 + below, left: -40, top: -100 }, tilt, elev)!;
    expect(slice.height).toBeCloseTo(R);
  });

  test("ignores an elevation no render can have", () => {
    for (const bad of [0, -20, 120, NaN]) expect(figureGroundSlice(box, 40, bad)).toEqual(figureGroundSlice(box, 40));
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

describe("the render camera (#926)", () => {
  test("reads the board's tilt out of tableProjection.ts", () => {
    expect(boardTiltDeg()).toBe(DEFAULT_TILT_DEG);
    expect(boardTiltDeg("export const DEFAULT_TILT_DEG = 35;\n")).toBe(35);
    expect(() => boardTiltDeg("const nothing = 1;")).toThrow(/DEFAULT_TILT_DEG/);
  });

  test("stands the complementary angle above the ground, so a model's base is the board's ellipse", () => {
    expect(defaultElevDeg()).toBe(90 - DEFAULT_TILT_DEG);
    const rad = (d: number) => (d * Math.PI) / 180;
    for (const tilt of [25, 40, 55]) {
      // A flat disc under rotateX(tilt) is cos(tilt) tall; a camera `elev`
      // above the ground sees a disc on the ground sin(elev) tall.
      expect(Math.sin(rad(elevForTilt(tilt)))).toBeCloseTo(Math.cos(rad(tilt)));
    }
  });
});

describe("a figure's render elevation (#926)", () => {
  const withElev = (elevDeg: unknown) =>
    figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": { ...kong, elevDeg } } }, "private"), "king-kong", "p1", "private");

  test("is carried from the manifest to the figure", () => {
    expect(withElev(50)?.elevDeg).toBe(50);
  });

  test("is optional, and dropped when it is not a camera angle — the figure stays", () => {
    const plain = figureFor(parseFigureManifest({ version: 1, figures: { "king-kong": kong } }, "private"), "king-kong", "p1", "private");
    expect(plain).not.toBeNull();
    expect(plain?.elevDeg).toBeUndefined();
    for (const bad of ["50", 0, 400, null]) {
      expect(withElev(bad)).not.toBeNull();
      expect(withElev(bad)?.elevDeg).toBeUndefined();
    }
  });
});
