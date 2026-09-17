/**
 * Interaction coverage for the tabletop board (phase 1): this is a rendering
 * swap, not a reduced mode, so the same identity-based click contract the
 * flat board's own ProBoard.test.tsx exercises must hold here too —
 * `onSpaceClick(id)` / `onFighterClick(id)`, the "click the token, act on the
 * space underneath it" fallback, and the relocate-armed gate.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import { ProMapDef, ViewFighter, ViewToken } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [
    { id: "fire", color: "#c0392b", label: "Fire" },
    { id: "ice", color: "#3498db", label: "Ice" },
  ],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: ["fire"], adjacentTo: ["s2"], start: { slot: 1 } },
    { id: "s2", x: 0.8, y: 0.8, zones: ["fire", "ice"], adjacentTo: ["s1"], start: { slot: 2 } },
    { id: "s3", x: 0.5, y: 0.5, zones: [], adjacentTo: [] },
  ],
};

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "The Mandalorian",
  space: "s1",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});

const renderBoard = (props: Partial<React.ComponentProps<typeof TableBoard>> = {}) =>
  render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={[]} {...props} />
    </ChakraProvider>
  );

describe("TableBoard clicks", () => {
  it("fires onSpaceClick with the space id when a highlighted space is clicked", () => {
    const onSpaceClick = jest.fn();
    renderBoard({ highlightedSpaces: ["s2"], onSpaceClick });
    fireEvent.click(screen.getByTitle("s2"));
    expect(onSpaceClick).toHaveBeenCalledWith("s2");
  });

  it("does not fire onSpaceClick for a non-highlighted space", () => {
    const onSpaceClick = jest.fn();
    renderBoard({ highlightedSpaces: ["s2"], onSpaceClick });
    fireEvent.click(screen.getByTitle("s3"));
    expect(onSpaceClick).not.toHaveBeenCalled();
  });

  it("fires onFighterClick with the fighter id when a targetable fighter is clicked", () => {
    const onFighterClick = jest.fn();
    renderBoard({
      fighters: [fighter({})],
      highlightedFighters: ["p1/hero"],
      onFighterClick,
    });
    fireEvent.click(screen.getByTitle(/The Mandalorian/));
    expect(onFighterClick).toHaveBeenCalledWith("p1/hero");
  });

  it("forwards a click on a non-targetable fighter to its (highlighted) space, like ProBoard's CHOOSE_SPACE fallback", () => {
    const onSpaceClick = jest.fn();
    const onFighterClick = jest.fn();
    renderBoard({
      fighters: [fighter({ space: "s1" })],
      highlightedSpaces: ["s1"],
      highlightedFighters: [],
      onSpaceClick,
      onFighterClick,
    });
    fireEvent.click(screen.getByTitle(/The Mandalorian/));
    expect(onSpaceClick).toHaveBeenCalledWith("s1");
    expect(onFighterClick).not.toHaveBeenCalled();
  });

  it("in relocate-armed mode, only the dashed origin spaces are clickable", () => {
    const onSpaceClick = jest.fn();
    renderBoard({
      highlightedSpaces: ["s2"],
      relocateSpaces: ["s3"],
      relocateArmed: true,
      onSpaceClick,
    });
    fireEvent.click(screen.getByTitle("s2"));
    expect(onSpaceClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("s3"));
    expect(onSpaceClick).toHaveBeenCalledWith("s3");
  });
});

describe("TableBoard zones", () => {
  it("draws one pie wedge per zone for a multi-zone space", () => {
    const { container } = renderBoard();
    const s2 = container.querySelector('[data-space-id="s2"]')!;
    expect(s2.querySelectorAll("svg path")).toHaveLength(2);
  });

  it("draws no wedge SVG for a single-zone space — a plain filled disc instead", () => {
    const { container } = renderBoard();
    const s1 = container.querySelector('[data-space-id="s1"]')!;
    expect(s1.querySelectorAll("svg path")).toHaveLength(0);
  });
});

describe("TableBoard fighters", () => {
  it("renders a HERO as a masked figure silhouette and a SIDEKICK as a round token", () => {
    const { container } = renderBoard({
      fighters: [
        fighter({ id: "p1/hero", kind: "HERO", space: "s1" }),
        fighter({ id: "p1/kick", kind: "SIDEKICK", name: "Porg", space: "s2" }),
      ],
    });
    const hero = container.querySelector('[data-fighter-id="p1/hero"]')!;
    const kick = container.querySelector('[data-fighter-id="p1/kick"]')!;
    expect(hero).toBeTruthy();
    expect(kick).toBeTruthy();
    // Phase 3: a HERO plate is clipped to a non-rectangular standee
    // silhouette (`clip-path: path(...)`, see standeeSilhouettePath), no
    // longer a `border-radius` rectangle — that clip is the one visible
    // signal the brief specifically asks for. The SIDEKICK token stays a
    // plain circle, unchanged.
    expect(getComputedStyle(hero).clipPath).toContain("path(");
    expect(getComputedStyle(kick).borderRadius).toBe("50%");
  });

  it("does not place a fighter whose space does not exist on the main board (e.g. a region space, unsupported in phase 1)", () => {
    renderBoard({ fighters: [fighter({ space: "nowhere" as never })] });
    expect(screen.queryByTitle(/The Mandalorian/)).toBeNull();
  });
});

describe("TableBoard board objects", () => {
  it("renders a neutral board object (totem/corpse) at its space", () => {
    const token: ViewToken = { id: "totem-1", kind: "totem", owner: "p1", space: "s3" };
    const { container } = renderBoard({ tokens: [token] });
    expect(container.querySelectorAll('[title*="Totem"]').length).toBeGreaterThan(0);
  });
});

describe("TableBoard auto-focus picks (phase-2 fault #4)", () => {
  it("marks a highlighted (actionable) space as a pick", () => {
    const { container } = renderBoard({ highlightedSpaces: ["s2"], onSpaceClick: jest.fn() });
    expect(container.querySelector('[data-space-id="s2"][data-pick]')).toBeTruthy();
    expect(container.querySelector('[data-space-id="s3"][data-pick]')).toBeNull();
  });

  it("marks a targetable fighter as a pick", () => {
    const { container } = renderBoard({
      fighters: [fighter({})],
      highlightedFighters: ["p1/hero"],
      onFighterClick: jest.fn(),
    });
    const plate = container.querySelector('[data-fighter-id="p1/hero"]');
    expect(plate).toBeTruthy();
    // `data-pick` lives on the positioning ANCHOR (TableStandeeAnchor), an
    // ancestor of the plate that carries `data-fighter-id` — TableStage's
    // auto-focus effect only needs the bounding rect, not the fighter id.
    expect(plate!.closest("[data-pick]")).toBeTruthy();
  });

  it("does not mark a non-actionable fighter as a pick", () => {
    const { container } = renderBoard({ fighters: [fighter({})] });
    const plate = container.querySelector('[data-fighter-id="p1/hero"]');
    expect(plate!.closest("[data-pick]")).toBeNull();
  });
});

describe("TableBoard LARGE (two-space) fighters", () => {
  const LARGE_MAP: ProMapDef = {
    ...MAP,
    spaces: [...MAP.spaces, { id: "s4", x: 0.35, y: 0.35, zones: [], adjacentTo: ["s3"] }],
  };

  it("renders a trailing tail token at tailSpace, distinct from the head", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoard
          map={LARGE_MAP}
          fighters={[fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" })]}
        />
      </ChakraProvider>
    );
    expect(container.querySelector('[data-fighter-id="p1/kong"]')).toBeTruthy();
    expect(container.querySelector('[data-fighter-id="p1/kong-tail"]')).toBeTruthy();
  });

  it("labels the band at the head/tail midpoint with the fighter's identity, stripped of a leading 'The'", () => {
    render(
      <ChakraProvider>
        <TableBoard
          map={LARGE_MAP}
          fighters={[fighter({ id: "p1/kong", name: "The King Kong", space: "s3", tailSpace: "s4", size: "LARGE" })]}
        />
      </ChakraProvider>
    );
    expect(screen.getByText("King Kong")).toBeTruthy();
  });

  it("does not render a tail or band for a NORMAL fighter (no tailSpace)", () => {
    const { container } = renderBoard({ fighters: [fighter({ space: "s1" })] });
    expect(container.querySelector('[data-fighter-id="p1/hero-tail"]')).toBeNull();
  });
});

describe("TableBoard regions (phase-2 deferred item)", () => {
  it("refuses the tabletop view for a map with regions, pointing at the flat board", () => {
    const REGION_MAP: ProMapDef = {
      ...MAP,
      regions: [{ id: "hut", label: "Baba Yaga's Hut" }],
      spaces: [...MAP.spaces, { id: "hut-1", x: 0.5, y: 0.5, zones: [], adjacentTo: [], region: "hut" }],
    };
    render(
      <ChakraProvider>
        <TableBoard map={REGION_MAP} fighters={[]} />
      </ChakraProvider>
    );
    expect(screen.getByText(/isn.t ready for the tabletop view yet/i)).toBeTruthy();
    expect(screen.getByText(/flat board/i)).toBeTruthy();
  });

  it("renders normally for a map with no regions", () => {
    const { container } = renderBoard();
    expect(screen.queryByText(/isn.t ready for the tabletop view/i)).toBeNull();
    expect(container.querySelector('[data-space-id="s1"]')).toBeTruthy();
  });
});

describe("TableBoard pendingMove tweening (phase-1 deferred item)", () => {
  it("renders a fighter with a pendingMove without crashing, landing on its current space", () => {
    const { container } = renderBoard({
      fighters: [fighter({ space: "s2" })],
      pendingMove: { fighterId: "p1/hero", path: ["s1", "s2"] },
    });
    expect(container.querySelector('[data-fighter-id="p1/hero"]')).toBeTruthy();
  });
});
