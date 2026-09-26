/**
 * A LARGE (two-space) fighter's band on the tabletop board (#868): the name
 * pill at the band's midpoint must paint above BOTH of the fighter's own
 * pieces, and only the HEAD segment may settle a pending move — a second,
 * late settle from the tail would clear a new incoming move.
 */
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import type { TableFighterTailProps } from "./TableFighterTail";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";
import { standeeZIndex } from "@/lib/pro/tableProjection";

// Spy on the tail's props while still rendering the real component.
const tailProps: TableFighterTailProps[] = [];
jest.mock("./TableFighterTail", () => {
  const actual = jest.requireActual("./TableFighterTail");
  return {
    TableFighterTail: (props: TableFighterTailProps) => {
      tailProps.push(props);
      return actual.TableFighterTail(props);
    },
  };
});

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [{ id: "fire", color: "#c0392b", label: "Fire" }],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: ["fire"], adjacentTo: ["s2"] },
    { id: "s2", x: 0.3, y: 0.3, zones: ["fire"], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s2", "s4"] },
    { id: "s4", x: 0.35, y: 0.65, zones: [], adjacentTo: ["s3"] },
  ],
};

const kong: ViewFighter = {
  id: "p1/kong",
  owner: "p1",
  kind: "HERO",
  name: "King Kong",
  space: "s3",
  tailSpace: "s4",
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "LARGE",
  defeated: false,
};

const renderKong = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[kong]} {...props} />
    </ChakraProvider>
  );

const zOf = (el: Element) => Number(getComputedStyle(el).zIndex);

beforeEach(() => {
  tailProps.length = 0;
});

describe("TableBoard LARGE fighter name pill", () => {
  it("paints above the standeeZIndex of both band ends", () => {
    renderKong();
    const pillZ = zOf(screen.getByText("King Kong"));
    // Head s3 (y 0.5), tail s4 (y 0.65) — the tail is the nearer end here.
    expect(pillZ).toBeGreaterThan(standeeZIndex(0.5));
    expect(pillZ).toBeGreaterThan(standeeZIndex(0.65));
  });

  it("paints above the fighter's own rendered head and tail anchors", () => {
    const { container } = renderKong();
    const pillZ = zOf(screen.getByText("King Kong"));
    const tail = container.querySelector('[data-fighter-id="p1/kong-tail"]')!;
    const head = container.querySelector('[data-fighter-id="p1/kong"]')!.closest("[title]")!;
    expect(zOf(tail)).toBeGreaterThan(0);
    expect(zOf(head)).toBeGreaterThan(0);
    expect(pillZ).toBeGreaterThan(zOf(tail));
    expect(pillZ).toBeGreaterThan(zOf(head));
  });

  it("stays click-through, so a pick space under it still takes the tap", () => {
    renderKong();
    expect(getComputedStyle(screen.getByText("King Kong")).pointerEvents).toBe("none");
  });
});

describe("TableBoard LARGE fighter move settle", () => {
  it("never hands onPendingMoveSettled to the tail, even while the tail tweens", () => {
    const onPendingMoveSettled = jest.fn();
    renderKong({
      pendingMove: { fighterId: "p1/kong", path: ["s2", "s3"], trailPath: ["s1", "s2", "s4"] },
      onPendingMoveSettled,
    });
    expect(tailProps.length).toBeGreaterThan(0);
    // The tail really is animating this move — otherwise the check is vacuous.
    expect(tailProps.some((p) => p.anim)).toBe(true);
    for (const p of tailProps) expect(p.onAnimComplete).toBeUndefined();
  });
});
