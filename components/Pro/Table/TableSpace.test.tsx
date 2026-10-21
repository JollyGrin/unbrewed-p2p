/**
 * The zone disc is a toggle (#1395): OFF draws nothing but the pick rings —
 * the board art carries the zones — and ON paints a fully OPAQUE disc (the
 * zone's plain hex, no alpha) with the crisp rim, dark outline, wedge seams
 * and translucent dish shade on top.
 */
import { fireEvent, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TABLE_SPACE_OUTLINE, TABLE_SPACE_SEAM, TABLE_SPACE_SHADE, TableSpace, type TableSpaceProps } from "./TableSpace";
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

const renderSpace = (props: Partial<TableSpaceProps> = {}) => {
  const utils = render(
    <ChakraProvider>
      <TableSpace
        space={space()}
        zoneColor={zoneColor}
        diameterPct={4}
        frameW={1000}
        highlighted={false}
        relocateOrigin={false}
        relocateArmed={false}
        {...props}
      />
    </ChakraProvider>
  );
  const hit = utils.container.querySelector('[data-space-id="s1"]') as HTMLElement;
  return { ...utils, hit, disc: hit.firstElementChild as HTMLElement };
};

describe("TableSpace with zone discs OFF (the default)", () => {
  it("paints no fill, rim, outline, pie or shade — the art shows through untouched", () => {
    const { hit, disc } = renderSpace({ space: space({ zones: ["fire", "ice"] }) });
    const style = getComputedStyle(disc);
    expect(style.background).toBe("");
    expect(style.backgroundColor).toBe("");
    expect(style.boxShadow).toBe("");
    expect(hit.querySelectorAll("svg path")).toHaveLength(0);
    expect(hit.querySelector("[data-space-shade]")).toBeNull();
  });

  it("draws nothing for a single-zone space or a space with no zone either", () => {
    for (const zones of [["fire"], []]) {
      const { disc, hit, unmount } = renderSpace({ space: space({ zones }) });
      expect(getComputedStyle(disc).background).toBe("");
      expect(getComputedStyle(disc).boxShadow).toBe("");
      expect(hit.querySelector("[data-space-shade]")).toBeNull();
      unmount();
    }
  });

  it("keeps the padded hit circle, data-pick, the gold walk ring, and routes the click", () => {
    const onClick = jest.fn();
    const { hit, disc } = renderSpace({ highlighted: true, onClick });
    expect(hit.hasAttribute("data-pick")).toBe(true);
    expect(getComputedStyle(hit).pointerEvents).toBe("auto");
    // The hit circle is still sized (never smaller than the 40px disc at a 1000px frame).
    expect(parseFloat(getComputedStyle(hit).width)).toBeGreaterThanOrEqual(40);
    expect(getComputedStyle(disc).outline).toContain("#E0A82E");
    fireEvent.click(hit);
    expect(onClick).toHaveBeenCalledWith("s1");
  });

  it("keeps the dashed cyan relocate ring and the hover preview", () => {
    const onHoverChange = jest.fn();
    const { disc } = renderSpace({ relocateOrigin: true, onClick: jest.fn() });
    expect(getComputedStyle(disc).outline).toContain("dashed");
    expect(getComputedStyle(disc).outline).toContain("#38D9E8");
    const hovered = renderSpace({ highlighted: true, onHoverChange });
    fireEvent.mouseEnter(hovered.hit);
    expect(onHoverChange).toHaveBeenCalledWith("s1");
  });
});

describe("TableSpace with zone discs ON", () => {
  it("fills a single-zone disc with the zone's PLAIN hex — fully opaque, no alpha suffix", () => {
    const { disc } = renderSpace({ zoneDiscs: true });
    // jsdom normalizes a `#rrggbb` to rgb(...) and would keep an alpha
    // channel as rgba(...): the whole point is that there is none.
    const bg = getComputedStyle(disc).background;
    expect(bg).toContain("rgb(192, 57, 43)");
    expect(bg).not.toContain("rgba(");
  });

  it("gives the disc a crisp, fully-saturated inset rim carrying zone identity", () => {
    const { disc } = renderSpace({ zoneDiscs: true });
    const shadow = getComputedStyle(disc).boxShadow;
    expect(shadow).toContain("inset");
    expect(shadow).toContain("#c0392b");
  });

  it("gives each pie wedge the plain zone hex, split by a thin dark seam", () => {
    const { hit } = renderSpace({ zoneDiscs: true, space: space({ zones: ["fire", "ice"] }) });
    const paths = Array.from(hit.querySelectorAll("svg path"));
    expect(paths).toHaveLength(2);
    expect(paths.map((p) => p.getAttribute("fill"))).toEqual(["#c0392b", "#3498db"]);
    for (const p of paths) {
      expect(p.getAttribute("fill")).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.getAttribute("stroke")).toBe(TABLE_SPACE_SEAM);
    }
  });

  it("outlines the disc in dark ink so it reads as printed on the board", () => {
    const { disc } = renderSpace({ zoneDiscs: true, space: space({ zones: ["fire", "ice"] }) });
    expect(getComputedStyle(disc).boxShadow).toContain(TABLE_SPACE_OUTLINE);
  });

  it("falls back to the neutral wash for a space with no zone", () => {
    const { disc } = renderSpace({ zoneDiscs: true, space: space({ zones: [] }) });
    expect(getComputedStyle(disc).background).toContain("rgba(224, 168, 46, 0.16)");
  });

  it("shades the disc like a shallow dish, lit from the upper left", () => {
    const { hit } = renderSpace({ zoneDiscs: true });
    expect(hit.querySelector("[data-space-shade]")).not.toBeNull();
    // jsdom drops multi-gradient values, so the recipe itself is checked as
    // data: a light stop toward the upper left, a dark one toward the lower right.
    expect(TABLE_SPACE_SHADE).toMatch(/circle at 3\d% 2\d%, rgba\(255/);
    expect(TABLE_SPACE_SHADE).toMatch(/circle at 6\d% 7\d%, rgba\(8/);
  });

  it("the gold ring replaces the dark outline on a pick, as before", () => {
    const { disc } = renderSpace({ zoneDiscs: true, highlighted: true, onClick: jest.fn() });
    expect(getComputedStyle(disc).boxShadow).not.toContain(TABLE_SPACE_OUTLINE);
    expect(getComputedStyle(disc).outline).toContain("#E0A82E");
  });
});
