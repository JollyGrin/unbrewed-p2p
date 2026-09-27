import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { Figure } from "@/lib/pro/figures";
import { placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableFigureGround, TableFigureSprite } from "./TableFigureSprite";
import { figureGroundSlice, figureSilhouetteBox, figureSpriteBox } from "@/lib/pro/figures";
import { heroPlateSize, TableFighterStandee } from "./TableFighterStandee";
import { BADGE_COLUMN, fighterBadgesLowestPx } from "./TableFighterBadges";
import { TOKEN_BADGE_PLATE_HEIGHT } from "./TableFlatToken";

const figure: Figure = {
  anchor: { x: 0.5, y: 0.75 },
  imageWidthMm: 80,
  footprintMm: 60,
  aspect: 1.5,
  url: "/figures/king-kong.p1.webp",
};

const kong: ViewFighter = {
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s1",
  tailSpace: null,
  hp: 18,
  maxHp: 18,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
} as ViewFighter;

const standee = (extra: Partial<Parameters<typeof TableFighterStandee>[0]> = {}) =>
  render(
    <ChakraProvider>
      <TableFighterStandee
        fighter={kong}
        x={0.5}
        y={0.5}
        tiltDeg={40}
        diamPx={40}
        playerColor="#E0A82E"
        artUrl="/token/kong.png"
        selected={false}
        targetable={false}
        friendly={false}
        extendedReach={false}
        {...extra}
      />
    </ChakraProvider>
  );

describe("TableFigureSprite", () => {
  it("stands the model's ground point on the plate's bottom centre (the fighter's feet)", () => {
    const { container } = render(
      <ChakraProvider>
        <TableFigureSprite figure={figure} baseDiamPx={60} plateW={100} plateH={150} />
      </ChakraProvider>
    );
    const img = container.querySelector("img[data-table-figure]") as HTMLImageElement;
    const frame = img.parentElement as HTMLElement;
    // 60px base for a 60mm footprint: 1mm = 1px, so the image is 80 x 120.
    expect(img.style.width).toBe("80px");
    expect(img.style.height).toBe("120px");
    // Ground point at (0.5 * 80, 0.75 * 120) lands on (50, 150).
    expect(parseFloat(frame.style.left) + 0.5 * 80).toBeCloseTo(50);
    expect(parseFloat(frame.style.top) + 0.75 * 120).toBeCloseTo(150);
  });

  it("shows upright only what is above the feet — the rest would sink into the board", () => {
    const { container } = render(
      <ChakraProvider>
        <TableFigureSprite figure={figure} baseDiamPx={60} plateW={100} plateH={150} />
      </ChakraProvider>
    );
    const frame = container.querySelector("img[data-table-figure]")!.parentElement as HTMLElement;
    expect(frame.style.overflow).toBe("hidden");
    // 90px of the 120px image are above the feet; the frame stops (just past) there.
    const bottom = parseFloat(frame.style.top) + parseFloat(frame.style.height);
    expect(bottom).toBeGreaterThanOrEqual(150);
    expect(bottom).toBeLessThanOrEqual(151);
  });
});

describe("TableFigureGround", () => {
  it("lays the image's below-the-feet strip in the board plane, stretched against the tilt", () => {
    const { container } = render(
      <ChakraProvider>
        <TableFigureGround figure={figure} baseDiamPx={60} tiltDeg={40} />
      </ChakraProvider>
    );
    const slice = figureGroundSlice(figureSpriteBox(figure, 60), 40)!;
    const img = container.querySelector("img[data-table-figure-ground]") as HTMLImageElement;
    const strip = img.parentElement as HTMLElement;
    expect(img.getAttribute("src")).toBe(figure.url);
    expect(strip.style.overflow).toBe("hidden");
    expect(parseFloat(strip.style.left)).toBeCloseTo(slice.left);
    expect(parseFloat(strip.style.width)).toBeCloseTo(slice.width);
    expect(parseFloat(strip.style.height)).toBeGreaterThanOrEqual(slice.height);
    expect(parseFloat(img.style.height)).toBeCloseTo(slice.imageHeight);
    // The feet line of the stretched image sits on the feet (the strip's origin).
    expect(parseFloat(strip.style.top) + parseFloat(img.style.top) + 0.75 * parseFloat(img.style.height)).toBeCloseTo(0);
  });

  it("lays the strip out by the render's own camera elevation (#926)", () => {
    const { container } = render(
      <ChakraProvider>
        <TableFigureGround figure={{ ...figure, elevDeg: 30 }} baseDiamPx={60} tiltDeg={40} />
      </ChakraProvider>
    );
    const box = figureSpriteBox(figure, 60);
    const img = container.querySelector("img[data-table-figure-ground]") as HTMLImageElement;
    expect(parseFloat(img.style.height)).toBeCloseTo(box.height / Math.sin((30 * Math.PI) / 180));
  });

  it("draws nothing for a model with nothing below its feet", () => {
    const { container } = render(
      <ChakraProvider>
        <TableFigureGround figure={{ ...figure, anchor: { x: 0.5, y: 1 } }} baseDiamPx={60} tiltDeg={40} />
      </ChakraProvider>
    );
    expect(container.querySelector("img[data-table-figure-ground]")).toBeNull();
  });
});

describe("TableFighterStandee with a figure", () => {
  it("draws the miniature, unclipped, instead of the token art", () => {
    const { container } = standee({ figure });
    const face = container.querySelector('[data-fighter-id="p1/hero"]') as HTMLElement;
    expect(face.style.clipPath).toBe("");
    const img = face.querySelector("img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(figure.url);
  });

  it("sizes the miniature off the standee's base disc, so it stays inside its space", () => {
    const { container } = standee({ figure });
    const img = container.querySelector("img[data-table-figure]") as HTMLImageElement;
    const base = standeeBaseDiameterPx(40);
    expect(parseFloat(img.style.width)).toBeCloseTo(figure.imageWidthMm * (base / figure.footprintMm));
  });

  it("scales the base disc like the miniature standing on it (#926)", () => {
    const { container } = standee({ figure, y: 0.25 });
    const base = container.querySelector("[data-fighter-base]") as HTMLElement;
    const upright = container.querySelector("[data-standee-upright]") as HTMLElement;
    const ground = container.querySelector("[data-standee-ground]") as HTMLElement;
    const scale = `scale(${placeStandee(0.25, 40).scale})`;
    expect(base.style.transform).toBe(`translate(-50%, 50%) ${scale}`);
    expect(ground.style.transform).toBe(scale);
    expect(upright.style.transform).toContain(`scale(${placeStandee(0.25, 40).scale.toFixed(3)})`);
  });

  it("puts the model's base front on the board, in plane, not in the upright billboard", () => {
    const { container } = standee({ figure });
    const ground = container.querySelector("[data-standee-ground]") as HTMLElement;
    expect(ground.querySelector("img[data-table-figure-ground]")).not.toBeNull();
    const face = container.querySelector('[data-fighter-id="p1/hero"]') as HTMLElement;
    expect(face.contains(ground)).toBe(false);
  });

  it("without a figure, lies on its space as the author's round token, not an upright cut-out", () => {
    const { container } = standee({ figure: null });
    const face = container.querySelector('[data-fighter-id="p1/hero"]') as HTMLElement;
    const ground = container.querySelector("[data-standee-ground]") as HTMLElement;
    expect(ground.contains(face)).toBe(true);
    expect(face.style.clipPath).toBe("");
    expect(face.querySelector("img")?.getAttribute("src")).toBe("/token/kong.png");
    expect(container.querySelector("img[data-table-figure]")).toBeNull();
    // The token is the base: exactly one, in the owner's colour, on the space.
    const bases = container.querySelectorAll("[data-fighter-base]");
    expect(bases).toHaveLength(1);
    expect((bases[0] as HTMLElement).style.borderColor.toLowerCase()).toBe("#e0a82e");
    expect(bases[0].getAttribute("data-space-id")).toBe("s1");
  });
});

// unbrewed-p2p-928: the badges hang off the plate's corners, so the plate has
// to be the box the model's own silhouette fills — not one generic shape.
describe("a miniature's badge plate (#928)", () => {
  // The committed open set's real numbers: an upright treant and a low, wide
  // quadruped, both fitted into the same 2:3 render frame.
  const treant: Figure = {
    anchor: { x: 0.5, y: 0.7349 },
    imageWidthMm: 1.5768,
    footprintMm: 1.2786,
    aspect: 1.5,
    bounds: { left: 0.0183, top: 0.0911, right: 0.9817, bottom: 0.9089 },
    url: "/figures-open/hollow-oak.p1.webp",
  };
  const quadruped: Figure = {
    anchor: { x: 0.5, y: 0.556 },
    imageWidthMm: 6.1271,
    footprintMm: 2.8253,
    aspect: 1.5,
    bounds: { left: 0.0183, top: 0.3567, right: 0.9817, bottom: 0.6433 },
    url: "/figures-open/triceratops.p1.webp",
  };
  const DIAM = 50;
  const base = standeeBaseDiameterPx(DIAM);
  const anchorOf = (container: HTMLElement) => container.querySelector("[data-badge-owner]") as HTMLElement;
  const badgesOf = (container: HTMLElement) => container.querySelector("[data-standee-badges]") as HTMLElement;

  it.each([
    ["treant", treant],
    ["quadruped", quadruped],
  ])("is the box the %s's own silhouette fills above its feet", (_name, fig) => {
    const { container } = standee({ figure: fig, diamPx: DIAM });
    const box = figureSpriteBox(fig, base);
    const anchor = anchorOf(container);
    // Top edge = the silhouette's topmost pixel; side edges = its widest.
    expect(parseFloat(getComputedStyle(anchor).height)).toBeCloseTo((fig.anchor.y - fig.bounds!.top) * box.height);
    expect(parseFloat(getComputedStyle(anchor).width)).toBeCloseTo((fig.bounds!.right - fig.bounds!.left) * box.width);
    // The badge layer fills that same box.
    expect(getComputedStyle(badgesOf(container)).width).toBe("100%");
    expect(getComputedStyle(badgesOf(container)).height).toBe("100%");
  });

  it("differs per model: the low quadruped's plate is lower and wider than the treant's", () => {
    const t = heroPlateSize(treant, base, base);
    const q = heroPlateSize(quadruped, base, base);
    expect(q.heightPx).toBeLessThan(t.heightPx);
    expect(q.widthPx).toBeGreaterThan(t.widthPx);
    // Neither is the old generic plate (1.55 × 2.33 space diameters).
    for (const p of [t, q]) expect(p.heightPx).toBeLessThan(DIAM * 1.55 * 1.5 * 0.6);
  });

  it("keeps the figure on the feet whatever the plate's size", () => {
    const { container } = standee({ figure: quadruped, diamPx: DIAM });
    const frame = (container.querySelector("img[data-table-figure]") as HTMLElement).parentElement as HTMLElement;
    const plate = heroPlateSize(quadruped, base, base);
    const box = figureSpriteBox(quadruped, base);
    expect(parseFloat(frame.style.left)).toBeCloseTo(plate.widthPx / 2 + box.left);
    expect(parseFloat(frame.style.top)).toBeCloseTo(plate.heightPx + box.top);
  });

  it("scales with a LARGE fighter's straddling figure", () => {
    const one = heroPlateSize(treant, base, base);
    const large = heroPlateSize(treant, base, base * 1.5);
    expect(large.heightPx).toBeCloseTo(one.heightPx * 1.5);
    expect(large.widthPx).toBeCloseTo(one.widthPx * 1.5);
  });

  it("measures a figure without bounds by its whole image", () => {
    const box = figureSpriteBox(figure, base);
    expect(figureSilhouetteBox(figure, base)).toEqual({ halfWidth: box.width / 2, height: -box.top });
    expect(heroPlateSize(figure, base, base)).toEqual({ widthPx: box.width, heightPx: -box.top });
  });

  it("takes the wider side of an off-centre silhouette", () => {
    const lopsided: Figure = { ...treant, bounds: { left: 0.4, top: 0.1, right: 1, bottom: 0.9 } };
    expect(figureSilhouetteBox(lopsided, base).halfWidth).toBeCloseTo(0.5 * figureSpriteBox(lopsided, base).width);
  });

  it("is never lower or narrower than a flat token's badge strip", () => {
    const flat: Figure = { ...treant, bounds: { left: 0.45, top: 0.73, right: 0.55, bottom: 0.9 } };
    expect(heroPlateSize(flat, base, base)).toEqual({ widthPx: base, heightPx: base * TOKEN_BADGE_PLATE_HEIGHT });
    expect(heroPlateSize(null, base, base)).toEqual({ widthPx: base, heightPx: base * TOKEN_BADGE_PLATE_HEIGHT });
  });

  it("tells the badge slide where the column really ends on a low model", () => {
    // The column hangs from the plate's top; on the quadruped it now reaches
    // below the feet, and the layer has to slide clear of the base (#902).
    const plate = heroPlateSize(quadruped, base, base);
    const c = BADGE_COLUMN.hero;
    expect(fighterBadgesLowestPx(plate.heightPx, "hero")).toBeCloseTo(plate.heightPx + c.offset - (2 * c.cell + c.gap));
    expect(fighterBadgesLowestPx(plate.heightPx, "hero")).toBeLessThan(0);
    const { container } = standee({ figure: quadruped, diamPx: DIAM, frameW: 900, frameH: 600 });
    expect(parseFloat(badgesOf(container).getAttribute("data-badge-forward")!)).toBeGreaterThan(0);
  });
});
