/**
 * #902: every badge a flat token (or a miniature) wears stands in the anchor's
 * badge layer, slid toward the camera until its LOWEST pixel clears the token
 * top — never in the upright plate, where the token's own disc and the board
 * covered it (the reach glyph's bite, the buried pick marks and status dots).
 * lib/pro/badgeLayerSlide.test.ts proves the slide's geometry; this pins the
 * wiring: which badges land in the layer, and with which inputs.
 */
import { render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import type { ViewFighter } from "@/lib/pro/protocol";
import type { Figure } from "@/lib/pro/figures";
import { badgeLayerSlide, flatTokenTopPx, placeStandee, standeeBaseDiameterPx } from "@/lib/pro/tableProjection";
import { TableFighterStandee } from "./TableFighterStandee";
import { TableSidekickToken } from "./TableSidekickToken";
import { TOKEN_BADGE_PLATE_HEIGHT } from "./TableFlatToken";
import {
  PICK_CHIP_DROP_PX,
  fighterBadgesLowestPx,
  flagBadgeLowestPx,
  heroBadgesDeepestPx,
  pickMarksLowestPx,
  statusRowLowestPx,
} from "./TableFighterBadges";

const maul = {
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Darth Maul",
  space: "s1",
  tailSpace: null,
  hp: 12,
  maxHp: 12,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  statuses: [{ kind: "PINNED" }],
} as ViewFighter;

const guard = { ...maul, id: "p1/sidekick-1", kind: "SIDEKICK", name: "Guard", hp: 1, maxHp: 1, statuses: [] } as ViewFighter;

const figure: Figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/figures/maul.webp" };

const FRAME = { frameW: 1000, frameH: 700 };
const AT = { x: 0.2, y: 0.8, tiltDeg: 40, diamPx: 60 };
const flag = { icon: "✦", label: "Tide", title: "Tide", bg: "#123", color: "#fff" };
const marks = { extendedReach: true, badgeNumber: 2, chipText: "+1 ✦" };

const hero = (extra: Partial<Parameters<typeof TableFighterStandee>[0]> = {}) =>
  render(
    <ChakraProvider>
      <TableFighterStandee
        fighter={maul}
        {...AT}
        {...FRAME}
        playerColor="#E05"
        badge={flag}
        selected={false}
        targetable={false}
        friendly={false}
        {...marks}
        {...extra}
      />
    </ChakraProvider>
  );

const layerOf = (container: HTMLElement) => container.querySelector("[data-standee-badges]") as HTMLElement;
const kinds = (el: Element) => [...el.querySelectorAll("[data-fighter-badge]")].map((b) => b.getAttribute("data-fighter-badge")).sort();

describe("fighter badges stand in the slid badge layer (#902)", () => {
  it("a flat hero token: every badge is in the layer, none in the upright plate", () => {
    const { container } = hero();
    const layer = layerOf(container);
    expect(kinds(layer)).toEqual(["flag", "hp", "pick-chip", "pick-number", "pick-reach", "reach", "status"]);
    const plate = container.querySelector("[data-standee-upright]") as HTMLElement;
    expect(plate.querySelector("[data-fighter-badge]")).toBeNull();
    expect(layer.style.pointerEvents || getComputedStyle(layer).pointerEvents).toBe("none");
  });

  it("slides it clear of the token's top, from the badges' own lowest pixel", () => {
    const { container } = hero();
    const tokenPx = standeeBaseDiameterPx(AT.diamPx);
    const plateH = tokenPx * TOKEN_BADGE_PLATE_HEIGHT;
    const placement = placeStandee(AT.y, AT.tiltDeg);
    const expected = badgeLayerSlide({
      x: AT.x,
      y: AT.y,
      ...FRAME,
      tiltDeg: AT.tiltDeg,
      plateScale: placement.scale,
      tokenTopPx: flatTokenTopPx(tokenPx),
      lowestPx: Math.min(fighterBadgesLowestPx(plateH, "hero"), -PICK_CHIP_DROP_PX, flagBadgeLowestPx(plateH), statusRowLowestPx()),
    });
    expect(expected.forwardPx).toBeGreaterThan(0);
    expect(layerOf(container).style.transform).toBe(`${placement.transform} ${expected.transform}`);
  });

  it("clears a shared-space stack lift too", () => {
    const lifted = layerOf(hero({ stack: { depthY: AT.y, order: 1, liftPx: 6 } }).container).getAttribute("data-badge-forward");
    const flat = layerOf(hero().container).getAttribute("data-badge-forward");
    expect(Number(lifted)).toBeGreaterThan(Number(flat));
  });

  it("a sidekick token: HP, reach and pick marks are in the layer, slid", () => {
    const { container } = render(
      <ChakraProvider>
        <TableSidekickToken fighter={guard} {...AT} {...FRAME} playerColor="#E05" selected={false} targetable={false} friendly={false} {...marks} />
      </ChakraProvider>
    );
    const layer = layerOf(container);
    expect(kinds(layer)).toEqual(["hp", "pick-chip", "pick-number", "pick-reach", "reach"]);
    expect(Number(layer.getAttribute("data-badge-forward"))).toBeGreaterThan(0);
    expect(container.querySelector("[data-standee-upright] [data-fighter-badge]")).toBeNull();
  });

  it("a miniature: its pick marks and status dots (below the foot) are slid too", () => {
    const { container } = hero({ figure });
    const layer = layerOf(container);
    expect(kinds(layer)).toContain("status");
    expect(kinds(layer)).toContain("pick-chip");
    expect(Number(layer.getAttribute("data-badge-forward"))).toBeGreaterThan(0);
    // The figure itself stays in the plate, unslid.
    expect(container.querySelector("[data-standee-upright] img[data-table-figure]")).not.toBeNull();
  });
});

describe("badge lowest-pixel helpers", () => {
  it("measure from the plate's foot, negative below it", () => {
    // Hero column: 8px over the top, two 25.6px cells and a 2.4px gap.
    expect(fighterBadgesLowestPx(30, "hero")).toBeCloseTo(30 + 8 - 53.6);
    expect(fighterBadgesLowestPx(30, "sidekick")).toBeCloseTo(30 + 5.6 - 40.8);
    expect(flagBadgeLowestPx(30)).toBeCloseTo(30 + 8 - 22.4);
    expect(statusRowLowestPx()).toBeCloseTo(-6.4);
    expect(pickMarksLowestPx({})).toBe(Infinity);
    expect(pickMarksLowestPx({ badgeNumber: 1 })).toBeCloseTo(-5.6);
    expect(pickMarksLowestPx({ extendedReach: true, chipText: "x" })).toBeCloseTo(-20.8);
    expect(heroBadgesDeepestPx(30)).toBeCloseTo(Math.min(30 + 8 - 53.6, -20.8));
  });
});
