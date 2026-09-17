/**
 * Fault #2 coverage (phase-2 report): a space's fill must be TRANSLUCENT (so
 * the board art shows through) with a crisp, fully-saturated rim carrying
 * zone identity — not the old flat, fully-opaque disc.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableSpace, zoneAlphaFill } from "./TableSpace";
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

  it("gives each pie wedge of a multi-zone space its own translucent fill AND a crisp full-color stroke", () => {
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
    const paths = container.querySelectorAll('[data-space-id="s1"] svg path');
    expect(paths).toHaveLength(2);
    const fireWedge = Array.from(paths).find((p) => p.getAttribute("stroke") === "#c0392b")!;
    expect(fireWedge.getAttribute("fill")).toBe(zoneAlphaFill("#c0392b"));
  });
});
