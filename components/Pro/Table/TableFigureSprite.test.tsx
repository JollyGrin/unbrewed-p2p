import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { Figure } from "@/lib/pro/figures";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableFigureSprite } from "./TableFigureSprite";
import { TableFighterStandee } from "./TableFighterStandee";

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
    // 60px base for a 60mm footprint: 1mm = 1px, so the image is 80 x 120.
    expect(img.style.width).toBe("80px");
    expect(img.style.height).toBe("120px");
    // Ground point at (0.5 * 80, 0.75 * 120) lands on (50, 150).
    expect(parseFloat(img.style.left) + 0.5 * 80).toBeCloseTo(50);
    expect(parseFloat(img.style.top) + 0.75 * 120).toBeCloseTo(150);
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

  it("keeps the token-art standee when there is no figure for this hero", () => {
    const { container } = standee({ figure: null });
    const face = container.querySelector('[data-fighter-id="p1/hero"]') as HTMLElement;
    expect(face.style.clipPath).toContain("path(");
    expect(container.querySelector("img[data-table-figure]")).toBeNull();
  });
});
