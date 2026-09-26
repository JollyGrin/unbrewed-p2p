/**
 * The committed open-licence figure set and the figure-style toggle
 * (unbrewed-p2p-903). The open set ships to every checkout and deploy, so its
 * gate is the #879 clearance PLUS the attribution CC-BY obliges us to show.
 */
import fs from "fs";
import path from "path";
import {
  FIGURE_SET_BASE_URL,
  FigureManifests,
  effectiveFigureStyle,
  figureFor,
  figureForStyle,
  figureStyleOptions,
  heroViewFigure,
  nextFigureStyle,
  parseFigureManifest,
} from "./figures";
const { openRenderBlockers } = require("../../scripts/figures/clearance.cjs") as {
  openRenderBlockers: (entry: unknown) => string[];
};

const tri = {
  anchor: { x: 0.5, y: 0.55 },
  imageWidthMm: 6.1,
  footprintMm: 2.8,
  aspect: 1.5,
  seats: { p1: "triceratops.p1.webp", p2: "triceratops.p2.webp" },
  license: "CC0-1.0",
  redistributable: true,
  officialHero: false,
  modelName: "Triceratops Horridus Marsh",
  creator: "Smithsonian Institution",
  sourceUrl: "https://example.org/triceratops",
};

const without = (key: keyof typeof tri) => {
  const copy: Record<string, unknown> = { ...tri };
  delete copy[key];
  return copy;
};

/** Every way an OPEN entry can fail its gate. */
const NOT_CLEARED_OPEN: Record<string, unknown> = {
  "no license": without("license"),
  "no redistributable": without("redistributable"),
  "redistributable: false": { ...tri, redistributable: false },
  "no officialHero": without("officialHero"),
  "officialHero: true": { ...tri, officialHero: true },
  "no modelName": without("modelName"),
  "an empty modelName": { ...tri, modelName: " " },
  "no creator": without("creator"),
  "no sourceUrl": without("sourceUrl"),
  "an http (not https) sourceUrl": { ...tri, sourceUrl: "http://example.org/x" },
  "a javascript: sourceUrl": { ...tri, sourceUrl: "javascript:alert(1)" },
};

const openManifest = (figures: Record<string, unknown>) => parseFigureManifest({ version: 1, figures }, "open");

describe("open-set gate", () => {
  test("a fully cleared, attributed entry survives with its credit", () => {
    const fig = figureFor(openManifest({ triceratops: tri }), "triceratops", "p2", "open");
    expect(fig?.url).toBe(`${FIGURE_SET_BASE_URL.open}/triceratops.p2.webp`);
    expect(fig?.set).toBe("open");
    expect(fig?.credit).toEqual({
      modelName: "Triceratops Horridus Marsh",
      creator: "Smithsonian Institution",
      license: "CC0-1.0",
      sourceUrl: "https://example.org/triceratops",
    });
  });

  test.each(Object.entries(NOT_CLEARED_OPEN))("drops an open entry with %s", (_why, entry) => {
    const m = openManifest({ triceratops: tri, gated: entry });
    expect(Object.keys(m?.figures ?? {})).toEqual(["triceratops"]);
    expect(figureFor(m, "gated", "p1", "open")).toBeNull();
  });

  test("render.cjs --open refuses exactly what the app drops", () => {
    expect(openRenderBlockers(tri)).toEqual([]);
    for (const entry of Object.values(NOT_CLEARED_OPEN)) expect(openRenderBlockers(entry).length).toBeGreaterThan(0);
  });

  // The private set predates attribution: an entry there needs none, but
  // keeps it when it has one.
  test("the private set does not require attribution", () => {
    const m = parseFigureManifest({ version: 1, figures: { triceratops: without("creator") } });
    expect(figureFor(m, "triceratops", "p1")?.credit).toBeNull();
  });
});

describe("the committed open set", () => {
  const dir = path.join(__dirname, "..", "..", "public", "figures-open");
  const raw = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "scripts", "figures", "figures-open.json"), "utf8"));

  test("every committed entry passes the gate, credit included", () => {
    const parsed = parseFigureManifest(raw, "open");
    expect(Object.keys(parsed?.figures ?? {}).sort()).toEqual(Object.keys(raw.figures).sort());
    for (const entry of Object.values(parsed!.figures)) expect(entry.credit).toBeDefined();
  });

  test("every seat render the manifest names is committed next to it", () => {
    for (const entry of Object.values(raw.figures) as { seats: Record<string, string> }[])
      for (const file of Object.values(entry.seats)) expect(fs.existsSync(path.join(dir, file))).toBe(true);
  });

  test("the manifest matches its config (no hand-edited or stale entry)", () => {
    const heroes = (config.figures as { heroId: string }[]).map((f) => f.heroId).sort();
    expect(Object.keys(raw.figures).sort()).toEqual(heroes);
    for (const f of config.figures) expect(openRenderBlockers(f)).toEqual([]);
  });
});

describe("figure style", () => {
  const privateTri = { ...tri, seats: { p1: "triceratops.p1.webp" } };
  const both: FigureManifests = {
    private: parseFigureManifest({ version: 1, figures: { triceratops: privateTri } }),
    open: openManifest({ triceratops: tri, "baba-yaga": { ...tri, seats: { p2: "baba-yaga.p2.webp" } } }),
  };
  const board = [
    { heroId: "triceratops", seat: "p1" },
    { heroId: "baba-yaga", seat: "p2" },
  ];

  test("each style draws only its own set", () => {
    expect(figureForStyle(both, "private", "triceratops", "p1")?.url).toBe("/figures/triceratops.p1.webp");
    expect(figureForStyle(both, "open", "triceratops", "p1")?.url).toBe("/figures-open/triceratops.p1.webp");
    expect(figureForStyle(both, "private", "baba-yaga", "p2")).toBeNull();
    expect(figureForStyle(both, "token", "triceratops", "p1")).toBeNull();
  });

  test("offers every style that changes this board", () => {
    expect(figureStyleOptions(both, board)).toEqual(["private", "open", "token"]);
  });

  test("never offers a set with nothing for this board's heroes", () => {
    expect(figureStyleOptions({ ...both, private: null }, board)).toEqual(["open", "token"]);
    expect(figureStyleOptions(both, [{ heroId: "baba-yaga", seat: "p2" }])).toEqual(["open", "token"]);
  });

  test("offers nothing at all when every hero would be a token", () => {
    expect(figureStyleOptions({ private: null, open: null }, board)).toEqual([]);
    expect(figureStyleOptions(both, [{ heroId: "king-kong", seat: "p1" }])).toEqual([]);
  });

  test("the viewer's choice holds only where it is offered", () => {
    expect(effectiveFigureStyle("token", ["open", "token"])).toBe("token");
    expect(effectiveFigureStyle("private", ["open", "token"])).toBe("open");
    expect(effectiveFigureStyle(null, ["open", "token"])).toBe("open");
    expect(effectiveFigureStyle("open", [])).toBe("token");
  });

  test("the toggle cycles through the offered styles", () => {
    expect(nextFigureStyle("open", ["open", "token"])).toBe("token");
    expect(nextFigureStyle("token", ["open", "token"])).toBe("open");
    expect(nextFigureStyle("private", ["private", "open", "token"])).toBe("open");
  });

  test("a hero view prefers the loaded private render, else the open one", () => {
    expect(heroViewFigure(both, "triceratops")?.set).toBe("private");
    expect(heroViewFigure({ ...both, private: null }, "triceratops")?.set).toBe("open");
    expect(heroViewFigure(both, "king-kong")).toBeNull();
  });
});
