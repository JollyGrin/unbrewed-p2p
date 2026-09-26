/**
 * Fault #2 coverage (phase-2 report): a space's fill must be TRANSLUCENT (so
 * the board art shows through) with a crisp, fully-saturated rim carrying
 * zone identity — not the old flat, fully-opaque disc.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TABLE_SPACE_OUTLINE, TABLE_SPACE_SEAM, TABLE_SPACE_SHADE, TableSpace, zoneAlphaFill } from "./TableSpace";
import type { ProMapSpace } from "@/lib/pro/protocol";

const space = (over: Partial<ProMapSpace> = {}): ProMapSpace => ({
  id: "s1",
  x: 0.5,
  y: 0.5,
  zones: ["fire"],
  adjacentTo: [],
  ...over,
});

const zoneColor = (id: string) => (id === "fire" ? "#c0392b" : "#3498db");

describe("TableSpace translucency", () => {
  it("fills a single-zone disc with the ALPHA (translucent) form of its zone color, not the opaque one", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSpace
          space={space()}
          zoneColor={zoneColor}
          diameterPct={4}
          frameW={1000}
          highlighted={false}
          relocateOrigin={false}
          relocateArmed={false}
        />
      </ChakraProvider>
    );
    const disc = container.querySelector('[data-space-id="s1"]')!.firstElementChild as HTMLElement;
    // jsdom's getComputedStyle normalizes the `#rrggbb + alpha-hex` shorthand
    // to rgba(...) — this asserts the ALPHA CHANNEL survived (0.4, matching
    // ZONE_FILL_ALPHA), which is the whole point of `zoneAlphaFill`.
    const bg = getComputedStyle(disc).background;
    expect(bg).toContain("rgba(192, 57, 43, 0.4)");
    expect(bg).not.toContain("rgb(192, 57, 43)");
  });

  it("gives the disc a crisp, FULLY-SATURATED inset rim carrying zone identity", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSpace
          space={space()}
          zoneColor={zoneColor}
          diameterPct={4}
          frameW={1000}
          highlighted={false}
          relocateOrigin={false}
          relocateArmed={false}
        />
      </ChakraProvider>
    );
    const disc = container.querySelector('[data-space-id="s1"]')!.firstElementChild as HTMLElement;
    const shadow = getComputedStyle(disc).boxShadow;
    expect(shadow).toContain("inset");
    // The rim is FULL saturation — no alpha suffix — unlike the interior fill.
    expect(shadow).toContain("#c0392b");
  });

  it("gives each pie wedge its own translucent fill, split by a thin dark seam rather than a saturated stroke", () => {
    // Saturated wedge strokes are what made the spaces read as a diagram laid
    // over the art instead of discs printed on the board (owner feedback,
    // 2026-09-23: "nicht clean"). The fill still carries the zone.
    const { container } = render(
      <ChakraProvider>
        <TableSpace
          space={space({ zones: ["fire", "ice"] })}
          zoneColor={zoneColor}
          diameterPct={4}
          frameW={1000}
          highlighted={false}
          relocateOrigin={false}
          relocateArmed={false}
        />
      </ChakraProvider>
    );
    const paths = Array.from(container.querySelectorAll('[data-space-id="s1"] svg path'));
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.getAttribute("fill"))).toContain(zoneAlphaFill("#c0392b"));
    for (const p of paths) expect(p.getAttribute("stroke")).toBe(TABLE_SPACE_SEAM);
  });

  it("outlines the disc in dark ink so it reads as printed on the board", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSpace
          space={space({ zones: ["fire", "ice"] })}
          zoneColor={zoneColor}
          diameterPct={4}
          frameW={1000}
          highlighted={false}
          relocateOrigin={false}
          relocateArmed={false}
        />
      </ChakraProvider>
    );
    const disc = container.querySelector('[data-space-id="s1"]')!.firstElementChild as HTMLElement;
    expect(getComputedStyle(disc).boxShadow).toContain(TABLE_SPACE_OUTLINE);
  });

  it("shades the disc like a shallow dish, lit from the upper left", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSpace
          space={space()}
          zoneColor={zoneColor}
          diameterPct={4}
          frameW={1000}
          highlighted={false}
          relocateOrigin={false}
          relocateArmed={false}
        />
      </ChakraProvider>
    );
    const shade = container.querySelector('[data-space-id="s1"] [data-space-shade]') as HTMLElement | null;
    expect(shade).not.toBeNull();
    // jsdom drops multi-gradient values, so the recipe itself is checked as
    // data: a light stop toward the upper left, a dark one toward the lower right.
    expect(TABLE_SPACE_SHADE).toMatch(/circle at 3\d% 2\d%, rgba\(255/);
    expect(TABLE_SPACE_SHADE).toMatch(/circle at 6\d% 7\d%, rgba\(8/);
  });
});
