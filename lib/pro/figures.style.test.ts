/**
 * The figure-style dropdown (unbrewed-p2p-953): which styles a board offers
 * once 3D minis join the sprite sets, which one is drawn, and what each
 * fighter falls back to (3D mini → sprite mini → token).
 */
import {
  effectiveFigureStyle,
  figureStyleOptions,
  isFigureStyle,
  parseFigureManifest,
  pieceCredit,
  pieceForStyle,
  type FigureManifests,
  type Minis3dSource,
} from "./figures";
import { parseMini3dManifest } from "./minis3d/manifest";

const clearance = {
  license: "CC0-1.0",
  redistributable: true,
  officialHero: false,
  modelName: "Model",
  creator: "JollyGrin",
  sourceUrl: "https://unbrewed.xyz",
};
const sprite = (seats: Record<string, string>) => ({
  anchor: { x: 0.5, y: 0.55 },
  imageWidthMm: 6,
  footprintMm: 3,
  aspect: 1.5,
  seats,
  ...clearance,
});
const mini = (over: Record<string, unknown> = {}) => ({ files: { play: "kt.play.glb" }, defaultLod: "play", ...clearance, ...over });

// King Taranis has a 3D mini AND an open sprite; the treant has only a sprite;
// the dragon only a private sprite; Kong has nothing.
const sprites: FigureManifests = {
  private: parseFigureManifest({ version: 1, figures: { dragon: sprite({ p1: "dragon.p1.webp", p2: "dragon.p2.webp" }) } }, "private"),
  open: parseFigureManifest(
    {
      version: 1,
      figures: {
        kt: sprite({ p1: "kt.p1.webp", p2: "kt.p2.webp" }),
        treant: sprite({ p1: "treant.p1.webp", p2: "treant.p2.webp" }),
      },
    },
    "open"
  ),
};
const minis3d: Minis3dSource = { manifest: parseMini3dManifest({ version: 1, minis: { kt: mini() } }) };
const paintedMinis: Minis3dSource = {
  manifest: parseMini3dManifest({
    version: 1,
    minis: { kt: mini({ paint: mini({ files: { play: "kt.painted.glb" }, creator: "Painter" }) }) },
  }),
};

const kt = { heroId: "kt", seat: "p1" };
const treant = { heroId: "treant", seat: "p2" };
const dragon = { heroId: "dragon", seat: "p2" };
const kong = { heroId: "kong", seat: "p2" };

describe("figure style options", () => {
  test("a board with a 3D hero offers 3D / sprite / token", () => {
    expect(figureStyleOptions(sprites, [kt, treant], minis3d)).toEqual(["3d", "open", "token"]);
    expect(figureStyleOptions(sprites, [kt, kong], minis3d)).toEqual(["3d", "open", "token"]);
  });

  test("no 3D option when no fighter on the board has a 3D model", () => {
    expect(figureStyleOptions(sprites, [treant, dragon], minis3d)).toEqual(["private", "open", "token"]);
  });

  test("no 3D option when 3D cannot be shown (no WebGL / renderer failed: source null)", () => {
    expect(figureStyleOptions(sprites, [kt, treant], null)).toEqual(["open", "token"]);
    expect(figureStyleOptions(sprites, [kt, treant])).toEqual(["open", "token"]);
    // A manifest that failed to load offers no 3D either.
    expect(figureStyleOptions(sprites, [kt, treant], { manifest: null })).toEqual(["open", "token"]);
  });

  test("no sprite option when no fighter has a sprite; 3D alone still gets tokens beside it", () => {
    expect(figureStyleOptions({ private: null, open: null }, [kt, kong], minis3d)).toEqual(["3d", "token"]);
  });

  test("nothing at all when every fighter would be a token", () => {
    expect(figureStyleOptions({ private: null, open: null }, [kong], minis3d)).toEqual([]);
  });

  test("Painted only when a fighter on the board has a painted asset", () => {
    expect(figureStyleOptions(sprites, [kt, treant], minis3d)).not.toContain("3d-painted");
    expect(figureStyleOptions(sprites, [kt, treant], paintedMinis)).toEqual(["3d", "3d-painted", "open", "token"]);
    expect(figureStyleOptions(sprites, [treant], paintedMinis)).toEqual(["open", "token"]);
  });
});

describe("the style drawn", () => {
  test("no stored choice: the board's best option — 3D where offered", () => {
    expect(effectiveFigureStyle(null, ["3d", "open", "token"])).toBe("3d");
    expect(effectiveFigureStyle(null, ["3d", "3d-painted", "open", "token"])).toBe("3d");
    expect(effectiveFigureStyle(null, ["open", "token"])).toBe("open");
    expect(effectiveFigureStyle(null, [])).toBe("token");
  });

  test("a stored choice holds wherever it is offered", () => {
    for (const s of ["3d", "open", "token"] as const) expect(effectiveFigureStyle(s, ["3d", "open", "token"])).toBe(s);
  });

  test("a stored 3D choice without 3D (no WebGL) lands on sprites, never on tokens", () => {
    expect(effectiveFigureStyle("3d", ["open", "token"])).toBe("open");
    expect(effectiveFigureStyle("3d", ["private", "open", "token"])).toBe("private");
    expect(effectiveFigureStyle("3d-painted", ["3d", "open", "token"])).toBe("3d");
    expect(effectiveFigureStyle("3d", ["token"])).toBe("token");
  });

  test("a stored sprite choice falls down the sprite sets, else to the board's best", () => {
    expect(effectiveFigureStyle("private", ["open", "token"])).toBe("open");
    expect(effectiveFigureStyle("open", ["3d", "token"])).toBe("3d");
  });
});

describe("per-fighter fallback: 3D mini → sprite mini → token", () => {
  test("under 3D each fighter stands at its best available level", () => {
    const ktPiece = pieceForStyle(sprites, minis3d, "3d", "kt", "p1");
    expect(ktPiece.mini3d).toMatchObject({ url: "/minis3d/kt.play.glb", variant: "unpainted" });
    // The sprite rides along: the standee draws it whenever the renderer is not ready.
    expect(ktPiece.figure?.url).toBe("/figures-open/kt.p1.webp");
    expect(pieceForStyle(sprites, minis3d, "3d", "treant", "p2")).toEqual({
      mini3d: null,
      figure: expect.objectContaining({ url: "/figures-open/treant.p2.webp" }),
    });
    expect(pieceForStyle(sprites, minis3d, "3d", "dragon", "p2").figure?.url).toBe("/figures/dragon.p2.webp");
    expect(pieceForStyle(sprites, minis3d, "3d", "kong", "p2")).toEqual({ mini3d: null, figure: null });
  });

  test("3D without a 3D source (WebGL off) is sprites", () => {
    expect(pieceForStyle(sprites, null, "3d", "kt", "p1")).toEqual({
      mini3d: null,
      figure: expect.objectContaining({ url: "/figures-open/kt.p1.webp" }),
    });
  });

  test("painted falls back to the plain 3D mini, then on down", () => {
    expect(pieceForStyle(sprites, paintedMinis, "3d-painted", "kt", "p1").mini3d).toMatchObject({ variant: "painted", url: "/minis3d/kt.painted.glb" });
    expect(pieceForStyle(sprites, minis3d, "3d-painted", "kt", "p1").mini3d).toMatchObject({ variant: "unpainted" });
    expect(pieceForStyle(sprites, paintedMinis, "3d-painted", "treant", "p2").figure?.url).toBe("/figures-open/treant.p2.webp");
  });

  test("sprite and token styles never draw a 3D mini", () => {
    expect(pieceForStyle(sprites, minis3d, "open", "kt", "p1").mini3d).toBeNull();
    expect(pieceForStyle(sprites, minis3d, "open", "dragon", "p2").figure).toBeNull();
    expect(pieceForStyle(sprites, minis3d, "token", "kt", "p1")).toEqual({ mini3d: null, figure: null });
  });

  test("the credit is the one for what the fighter actually stands as", () => {
    expect(pieceCredit(pieceForStyle(sprites, paintedMinis, "3d-painted", "kt", "p1"))?.creator).toBe("Painter");
    expect(pieceCredit(pieceForStyle(sprites, minis3d, "open", "kt", "p1"))?.modelName).toBe("Model");
    expect(pieceCredit(pieceForStyle(sprites, minis3d, "token", "kt", "p1"))).toBeNull();
  });
});

test("stored values: the new styles are valid, garbage is not", () => {
  for (const v of ["3d", "3d-painted", "private", "open", "token"]) expect(isFigureStyle(v)).toBe(true);
  for (const v of ["3D", "sprite", "", null]) expect(isFigureStyle(v)).toBe(false);
});
