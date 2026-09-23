import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { Figure } from "@/lib/pro/figures";
import { standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableFigureGround, TableFigureSprite } from "./TableFigureSprite";
import { figureGroundSlice, figureSpriteBox } from "@/lib/pro/figures";
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
