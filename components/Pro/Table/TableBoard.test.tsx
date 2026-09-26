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
import { LARGE_FIGURE_SCALE } from "@/lib/pro/figures";

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
  it("lays a HERO without a miniature and a SIDEKICK on their spaces as round tokens", () => {
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
    // Both are the deck's own round token, flat in the board plane (the
    // anchor's ground layer) — the author's piece, like on the flat board.
    for (const token of [hero, kick]) {
      expect(token.closest("[data-standee-ground]")).toBeTruthy();
      expect(getComputedStyle(token).borderRadius).toBe("50%");
    }
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

  it("lays a LARGE fighter's tail flat on its space too, as a plain token in the owner's colour", () => {
    const { container } = render(
      <ChakraProvider>
        <TableBoard
          map={LARGE_MAP}
          fighters={[fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" })]}
        />
      </ChakraProvider>
    );
    const body = container.querySelector("[data-tail-body]") as HTMLElement;
    expect(body.closest("[data-standee-ground]")).toBeTruthy();
    expect(container.querySelectorAll('[data-fighter-base][data-space-id="s4"]')).toHaveLength(1);
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

describe("TableBoard figures", () => {
  const figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/figures/x.p1.webp" };

  it("stands a hero's miniature on the board when the page resolves one", () => {
    const fighterFigure = jest.fn(() => figure);
    const { container } = renderBoard({ fighters: [fighter({})], fighterFigure });
    expect(fighterFigure).toHaveBeenCalledWith(expect.objectContaining({ id: "p1/hero" }));
    expect(container.querySelector("img[data-table-figure]")?.getAttribute("src")).toBe(figure.url);
  });

  describe("a LARGE (two-space) hero with a miniature", () => {
    const LARGE_MAP: ProMapDef = {
      ...MAP,
      spaces: [...MAP.spaces, { id: "s4", x: 0.35, y: 0.35, zones: [], adjacentTo: ["s3"] }],
    };
    const kong = fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" });
    const renderKong = () =>
      render(
        <ChakraProvider>
          <TableBoard map={LARGE_MAP} fighters={[kong]} fighterFigure={() => figure} />
        </ChakraProvider>
      );
    const anchorOf = (face: Element) => face.parentElement!.parentElement as HTMLElement;

    it("stands the figure between its two spaces, like a big miniature on a real table", () => {
      const { container } = renderKong();
      const anchor = anchorOf(container.querySelector('[data-fighter-id="p1/kong"]')!);
      // Head s3 (0.5, 0.5), tail s4 (0.35, 0.35): the midpoint is (0.425, 0.425).
      expect(anchor.style.left).toBe("42.5%");
      expect(anchor.style.top).toBe("42.5%");
    });

    it("keeps a seat-coloured base centred on each of the two spaces", () => {
      const { container } = renderKong();
      expect(container.querySelectorAll('[data-fighter-base][data-space-id="s3"]')).toHaveLength(1);
      expect(container.querySelectorAll('[data-fighter-base][data-space-id="s4"]')).toHaveLength(1);
    });

    it("drops the upright tail disc and the name band — the figure says who it is", () => {
      const { container } = renderKong();
      expect(container.querySelector('[data-fighter-id="p1/kong-tail"]')).toBeTruthy();
      expect(container.querySelector("[data-tail-body]")).toBeNull();
      expect(screen.queryByText("King Kong")).toBeNull();
    });

    it("draws the two-space miniature larger than a one-space one", () => {
      const width = (el: Element | null) => parseFloat((el as HTMLElement).style.width);
      const large = width(renderKong().container.querySelector("img[data-table-figure]"));
      const single = width(
        renderBoard({ fighters: [fighter({})], fighterFigure: () => figure }).container.querySelector(
          "img[data-table-figure]"
        )
      );
      expect(large / single).toBeCloseTo(LARGE_FIGURE_SCALE);
    });
  });

  it("keeps the token standee when no figure is resolved", () => {
    const { container } = renderBoard({ fighters: [fighter({})], fighterFigure: () => null });
    expect(container.querySelector("img[data-table-figure]")).toBeNull();
  });
});

describe("TableBoard parity with the flat board (#877)", () => {
  const LARGE_MAP: ProMapDef = {
    ...MAP,
    spaces: [...MAP.spaces, { id: "s4", x: 0.35, y: 0.35, zones: [], adjacentTo: ["s3"] }],
  };

  it("registers a SIDEKICK in the damage-arc registry, as it does a hero", () => {
    const fighterEls = { current: new Map<string, HTMLElement>() };
    const sidekick = fighter({ id: "p1/sk", kind: "SIDEKICK", name: "Grogu", space: "s2" });
    renderBoard({ fighters: [fighter({}), sidekick], fighterEls });
    expect([...fighterEls.current.keys()].sort()).toEqual(["p1/hero", "p1/sk"]);
    // It registers the piece's own anchor — the element that holds its face.
    expect(fighterEls.current.get("p1/sk")!.querySelector('[data-fighter-id="p1/sk"]')).toBeTruthy();
  });

  it("draws the hero-state badge (tide, druid form, a counter) on the hero's standee", () => {
    const fighterTokenBadge = jest.fn((f: ViewFighter) =>
      f.kind === "HERO" ? { icon: "🌊", label: "3", title: "Tide: High", bg: "#123", color: "#fff", showLabel: true } : null
    );
    renderBoard({ fighters: [fighter({})], fighterTokenBadge });
    expect(fighterTokenBadge).toHaveBeenCalledWith(expect.objectContaining({ id: "p1/hero" }));
    const badge = screen.getByTitle("Tide: High");
    expect(badge.textContent).toBe("🌊3");
  });

  it("draws the badge over a hero's miniature too", () => {
    const figure = { anchor: { x: 0.5, y: 0.75 }, imageWidthMm: 80, footprintMm: 60, aspect: 1.5, url: "/f.webp" };
    renderBoard({
      fighters: [fighter({})],
      fighterFigure: () => figure,
      fighterTokenBadge: () => ({ icon: "🐻", label: "Bear", title: "Druid form: Bear", bg: "#321", color: "#fff" }),
    });
    expect(screen.getByTitle("Druid form: Bear")).toBeTruthy();
  });

  it("reports a hover on a LARGE fighter's tail as the fighter itself, like ProBoard", () => {
    const onFighterHover = jest.fn();
    const { container } = render(
      <ChakraProvider>
        <TableBoard
          map={LARGE_MAP}
          fighters={[fighter({ id: "p1/kong", name: "King Kong", space: "s3", tailSpace: "s4", size: "LARGE" })]}
          onFighterHover={onFighterHover}
        />
      </ChakraProvider>
    );
    const tail = container.querySelector('[data-fighter-id="p1/kong-tail"]') as HTMLElement;
    fireEvent.mouseEnter(tail);
    expect(onFighterHover).toHaveBeenLastCalledWith("p1/kong");
    fireEvent.mouseLeave(tail);
    expect(onFighterHover).toHaveBeenLastCalledWith(null);
  });
});
