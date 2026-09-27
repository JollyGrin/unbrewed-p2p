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
  LICENSE_DEEDS,
  effectiveFigureStyle,
  figureFor,
  figureForStyle,
  figureStyleOptions,
  heroViewFigure,
  parseFigureManifest,
} from "./figures";
const { openRenderBlockers, OPEN_LICENSE_DEEDS } = require("../../scripts/figures/clearance.cjs") as {
  openRenderBlockers: (entry: unknown) => string[];
  OPEN_LICENSE_DEEDS: Record<string, string>;
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
  "a licence with no version (no deed to link)": { ...tri, license: "CC-BY-SA" },
  "a named licence with no deed": { ...tri, license: "Standard Digital File License" },
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
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      sourceUrl: "https://example.org/triceratops",
      modified: false,
    });
  });

  // CC BY / BY-SA 4.0 s3(a)(1): the credit links the licence, and a render
  // (lit, recoloured, flattened) is a change that must be indicated.
  test("a BY-SA entry links its deed and declares the renders modified", () => {
    const fig = figureFor(openManifest({ witch: { ...tri, license: "CC-BY-SA-4.0" } }), "witch", "p1", "open");
    expect(fig?.credit?.licenseUrl).toBe("https://creativecommons.org/licenses/by-sa/4.0/");
    expect(fig?.credit?.modified).toBe(true);
  });

  test("the app and render.cjs link the same licence deeds", () => {
    expect(LICENSE_DEEDS).toEqual(OPEN_LICENSE_DEEDS);
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
  test("an entry keeps its silhouette bounds, and stands without them", () => {
    const bounds = { left: 0.02, top: 0.36, right: 0.98, bottom: 0.64 };
    const m = openManifest({ triceratops: { ...tri, bounds }, plain: tri });
    expect(figureFor(m, "triceratops", "p1", "open")?.bounds).toEqual(bounds);
    expect(figureFor(m, "plain", "p1", "open")).not.toBeNull();
    expect(figureFor(m, "plain", "p1", "open")?.bounds).toBeUndefined();
  });

  test.each([
    ["out of range", { left: -0.1, top: 0, right: 1, bottom: 1 }],
    ["inside out", { left: 0.6, top: 0, right: 0.4, bottom: 1 }],
    ["incomplete", { left: 0, top: 0, right: 1 }],
  ])("ignores %s bounds rather than dropping the figure", (_why, bounds) => {
    const fig = figureFor(openManifest({ triceratops: { ...tri, bounds } }), "triceratops", "p1", "open");
    expect(fig).not.toBeNull();
    expect(fig?.bounds).toBeUndefined();
  });

  // unbrewed-p2p-965: an alias shares the canonical id's renders — its
  // manifest entry's seats just name that id's files, nothing physically
  // duplicated. `parseFigureManifest` only checks a seat value is a plain
  // file name, never that it matches the entry's own key.
  test("a seat may name another id's file (alias sharing)", () => {
    const m = openManifest({
      "king-taranis": tri,
      "king-taranis-spice": { ...tri, seats: tri.seats },
    });
    const spice = figureFor(m, "king-taranis-spice", "p2", "open");
    expect(spice?.url).toBe(`${FIGURE_SET_BASE_URL.open}/${tri.seats.p2}`);
    expect(spice?.url).toBe(figureFor(m, "king-taranis", "p2", "open")?.url);
  });

  test("the private set does not require attribution", () => {
    const m = parseFigureManifest({ version: 1, figures: { triceratops: without("creator") } }, "private");
    expect(figureFor(m, "triceratops", "p1", "private")?.credit).toBeNull();
  });

  test("a private entry keeps a credit whose licence has no deed, unlinked", () => {
    const m = parseFigureManifest({ version: 1, figures: { triceratops: { ...tri, license: "LOCAL" } } }, "private");
    expect(figureFor(m, "triceratops", "p1", "private")?.credit).toMatchObject({ license: "LOCAL", licenseUrl: null, modified: true });
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

  // unbrewed-p2p-928: the badges hang off these, so a re-render (or a merge)
  // that leaves them stale or drops them has to fail here, not on the table.
  test("every entry's silhouette bounds are the ones its renders really have", async () => {
    const { figureBounds } = require("../../scripts/figures/bounds.cjs") as {
      figureBounds: (files: string[]) => Promise<Record<string, number> | null>;
    };
    const parsed = parseFigureManifest(raw, "open")!;
    for (const [heroId, entry] of Object.entries(parsed.figures)) {
      const measured = await figureBounds(Object.values(entry.seats).map((f) => path.join(dir, f)));
      expect({ heroId, bounds: entry.bounds }).toEqual({ heroId, bounds: measured });
    }
  });

  test("the manifest matches its config (no hand-edited or stale entry)", () => {
    const heroes = (config.figures as { heroId: string }[]).map((f) => f.heroId).sort();
    expect(Object.keys(raw.figures).sort()).toEqual(heroes);
    for (const f of config.figures) expect(openRenderBlockers(f)).toEqual([]);
  });

  test("no committed entry's credit names the generation tool (unbrewed-p2p-975)", () => {
    for (const entry of Object.values(raw.figures) as { modelName?: string }[]) expect(entry.modelName).not.toMatch(/meshy/i);
    for (const f of config.figures as { modelName?: string }[]) expect(f.modelName).not.toMatch(/meshy/i);
  });
});

describe("figure style", () => {
  const privateTri = { ...tri, seats: { p1: "triceratops.p1.webp" } };
  const both: FigureManifests = {
    private: parseFigureManifest({ version: 1, figures: { triceratops: privateTri } }, "private"),
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

  test("a hero view prefers the loaded private render, else the open one", () => {
    expect(heroViewFigure(both, "triceratops")?.set).toBe("private");
    expect(heroViewFigure({ ...both, private: null }, "triceratops")?.set).toBe("open");
    expect(heroViewFigure(both, "king-kong")).toBeNull();
  });
});
