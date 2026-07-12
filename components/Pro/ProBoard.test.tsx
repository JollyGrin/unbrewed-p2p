import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { ProBoard } from "./ProBoard";
import { ProMapDef, ViewFighter } from "@/lib/pro/protocol";

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "test-map",
  meta: { title: "Test Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.2, zones: [], adjacentTo: ["s2"], start: { slot: 1 } },
    { id: "s2", x: 0.8, y: 0.8, zones: [], adjacentTo: ["s1"], start: { slot: 2 } },
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
  defeated: false,
  ...over,
});

// Regression coverage for issue #129: a wrapper-sizing change (ba6e176) plus a
// component swap for framer-motion support (3dc3b75) silently dropped the
// fighter token's `display: flex`, so its centered `alignItems`/`justifyContent`
// went inert — initials rendered at the block-flow top instead of centered.
describe("ProBoard fighter token", () => {
  it("gives the token box display: flex so alignItems/justifyContent actually center the initials", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    const token = screen.getByTitle(/The Mandalorian/);
    expect(getComputedStyle(token).display).toBe("flex");
  });

  it("never renders the literal word THE, even for a degenerate 'The'-only name", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ name: "The" })]} />
      </ChakraProvider>
    );
    const token = screen.getByTitle(/^The —/);
    expect(token.textContent).not.toMatch(/^THE/i);
  });

  it("still strips a real 'The ' prefix for normal hero names", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({ name: "The Mandalorian" })]} />
      </ChakraProvider>
    );
    expect(screen.getByText("MAN")).toBeInTheDocument();
  });
});

// Portrait token art (issue #247): fighterTokenArt paints a URL into the circle;
// initials stay in the DOM (legible over a scrim). Decks without art omit the
// prop / return null and render exactly as before.
describe("ProBoard fighter token art", () => {
  const artFor = (url: string | null) => () => url;

  it("clips the resolved portrait into the token and keeps the initials", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ name: "The Piper of the Underroads" })]}
          fighterTokenArt={artFor("/evergreen-decks/art/piper/token-piper.webp")}
        />
      </ChakraProvider>
    );
    const img = container.querySelector('img[src="/evergreen-decks/art/piper/token-piper.webp"]');
    expect(img).toBeInTheDocument();
    // initials remain rendered on top of the art for legibility
    expect(screen.getByText("PIP")).toBeInTheDocument();
  });

  it("renders no token art when the resolver returns null (converted decks)", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} fighterTokenArt={artFor(null)} />
      </ChakraProvider>
    );
    // scope to the token itself — the board's own map background is an <img> too
    const token = screen.getByTitle(/The Mandalorian/);
    expect(token.querySelector("img")).toBeNull();
  });

  it("paints art only on the HEAD segment of a two-space (LARGE) fighter, never the tail", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ id: "p1/kong", name: "King Kong", space: "s1", tailSpace: "s2" })]}
          fighterTokenArt={artFor("/art/kong.webp")}
        />
      </ChakraProvider>
    );
    // exactly one art layer — the head token; the tail circle stays plain
    expect(container.querySelectorAll('img[src="/art/kong.webp"]')).toHaveLength(1);
  });
});

// v9 board regions (Baba Yaga's Hut): region spaces render inside an inset
// panel with its own positioning frame; a closed region greys out and stops
// taking pointer events.
const REGION_MAP: ProMapDef = {
  ...MAP,
  regions: [{ id: "HUT", label: "The Hut", imageUrl: "/pro/regions/baba-yaga-hut.webp", spaceDiameter: 0.18 }],
  spaces: [
    ...MAP.spaces,
    { id: "hut-1", x: 0.28, y: 0.47, zones: [], adjacentTo: ["hut-2"], region: "HUT" },
    { id: "hut-2", x: 0.51, y: 0.33, zones: [], adjacentTo: ["hut-1"], region: "HUT" },
  ],
};

describe("ProBoard regions", () => {
  it("renders a region as an inset panel and puts a region-space fighter inside it", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "hut-1" })]} />
      </ChakraProvider>
    );
    const panel = screen.getByTitle("The Hut");
    expect(panel).toContainElement(screen.getByAltText("The Hut")); // inset background art
    expect(panel).toContainElement(screen.getByTitle(/The Mandalorian/));
  });

  it("keeps main-board fighters out of the inset panel", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "s1" })]} />
      </ChakraProvider>
    );
    expect(screen.getByTitle("The Hut")).not.toContainElement(screen.getByTitle(/The Mandalorian/));
  });

  it("greys out a closed region's panel and disables its art, but keeps the header live", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} closedRegions={["HUT"]} />
      </ChakraProvider>
    );
    const panel = screen.getByTitle("The Hut");
    expect(getComputedStyle(panel).filter).toContain("grayscale");
    // the art frame stops taking clicks…
    const artFrame = screen.getByAltText("The Hut").parentElement as HTMLElement;
    expect(getComputedStyle(artFrame).pointerEvents).toBe("none");
    // …but the header still works, so a dead panel can be collapsed/dragged away
    expect(getComputedStyle(panel).pointerEvents).toBe("auto");
    // case-sensitive: the overlay says "CLOSED"; the header chip says "closed"
    expect(screen.getByText(/The Hut — CLOSED/)).toBeInTheDocument();
  });

  it("collapses to just the header bar via the toggle, and re-expands", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({ space: "hut-1" })]} />
      </ChakraProvider>
    );
    const toggle = screen.getByLabelText("toggle The Hut");
    fireEvent.click(toggle);
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument(); // art gone, bar stays
    expect(screen.getByTitle("The Hut")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByAltText("The Hut")).toBeInTheDocument();
  });

  it("auto-expands a collapsed panel while a space inside the region is highlighted", () => {
    const { rerender } = render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    fireEvent.click(screen.getByLabelText("toggle The Hut"));
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument();
    // legalActions now offer an interior destination -> the panel must open
    rerender(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} highlightedSpaces={["hut-1"]} />
      </ChakraProvider>
    );
    expect(screen.getByAltText("The Hut")).toBeInTheDocument();
    // highlight gone -> the player's collapse preference comes back
    rerender(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} />
      </ChakraProvider>
    );
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument();
  });
});

// issue #161: when several same-named sidekicks can each declare an attack, the
// sidebar offers one button per attacker but the board gave no clue which token
// was which. ProBoard now badges a token with a disambiguator number (matched to
// the button label) so "Attack … with Raptor 2" visibly points at the #2 token.
describe("ProBoard fighter disambiguator badge (issue #161)", () => {
  const raptor = (id: string, space: string) =>
    fighter({ id, owner: "p1", kind: "SIDEKICK", name: "Raptor", space, hp: 3, maxHp: 3 });

  it("renders no badge when none are provided (single-attacker case stays clean)", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[raptor("p1/sidekick-1", "s1")]} />
      </ChakraProvider>
    );
    expect(container.querySelector('[title^="#"]')).toBeNull();
  });

  it("badges each same-named token with its disambiguator number", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[raptor("p1/sidekick-1", "s1"), raptor("p1/sidekick-2", "s2")]}
          fighterBadges={{ "p1/sidekick-1": 1, "p1/sidekick-2": 2 }}
        />
      </ChakraProvider>
    );
    const badges = container.querySelectorAll('[title^="#"]');
    expect(badges).toHaveLength(2);
    expect([...badges].map((b) => b.textContent)).toStrictEqual(["1", "2"]);
    expect(badges[0].getAttribute("title")).toBe("#1");
    expect(badges[1].getAttribute("title")).toBe("#2");
  });

  it("leaves an unbadged fighter alone when only its sibling carries a number", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[raptor("p1/sidekick-1", "s1"), raptor("p1/sidekick-2", "s2")]}
          fighterBadges={{ "p1/sidekick-2": 2 }}
        />
      </ChakraProvider>
    );
    const badges = container.querySelectorAll('[title^="#"]');
    expect(badges).toHaveLength(1);
    expect(badges[0].getAttribute("title")).toBe("#2");
  });
});


// during the attack phase. The arrowhead is the only <polygon> the board draws,
// so it uniquely identifies the arrow.
describe("ProBoard attack arrow (issue #148)", () => {
  const attacker = fighter({ id: "p1/hero", owner: "p1", space: "s1" });
  const target = fighter({ id: "p2/hero", owner: "p2", name: "Kong", space: "s2" });

  it("draws no arrow when there is no active combat", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[attacker, target]} />
      </ChakraProvider>
    );
    expect(container.querySelector("polygon")).toBeNull();
  });

  it("draws an attacker->target arrow while combat is active", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[attacker, target]}
          attack={{ attacker: "p1/hero", target: "p2/hero" }}
        />
      </ChakraProvider>
    );
    // arrowhead present
    expect(container.querySelector("polygon")).not.toBeNull();
    // tip points toward the target space (s2 at 0.8,0.8 -> ~80 in 0-100 space),
    // away from the attacker (s1 at 0.2,0.2 -> ~20): first point x > 50
    const tipX = Number(
      container.querySelector("polygon")!.getAttribute("points")!.split(" ")[0].split(",")[0]
    );
    expect(tipX).toBeGreaterThan(50);
  });

  it("draws no arrow when a named combatant is off the board", () => {
    const { container } = render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[attacker]} // target absent
          attack={{ attacker: "p1/hero", target: "p2/hero" }}
        />
      </ChakraProvider>
    );
    expect(container.querySelector("polygon")).toBeNull();
  });
});

// issue #185: a CHOOSE_SPACE prompt highlights the space, but the fighter token
// (zIndex 4) sits on top of the space hit-circle (zIndex 3) and swallowed the
// click — Chain Lightning et al. could not be aimed at an occupied space. The
// token now forwards a click to onSpaceClick when its own space is highlighted,
// while still routing fighter-target clicks to onFighterClick.
describe("ProBoard fighter token over a highlighted space (issue #185)", () => {
  it("forwards a click on a fighter standing on a highlighted space to onSpaceClick", () => {
    const onSpaceClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ space: "s1" })]}
          highlightedSpaces={["s1"]}
          onSpaceClick={onSpaceClick}
        />
      </ChakraProvider>
    );
    fireEvent.click(screen.getByTitle(/The Mandalorian/));
    expect(onSpaceClick).toHaveBeenCalledWith("s1");
  });

  it("gives that token a pointer cursor so it reads as clickable", () => {
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ space: "s1" })]}
          highlightedSpaces={["s1"]}
          onSpaceClick={() => {}}
        />
      </ChakraProvider>
    );
    expect(getComputedStyle(screen.getByTitle(/The Mandalorian/)).cursor).toBe("pointer");
  });

  it("does not forward when the token's space is not the highlighted one", () => {
    const onSpaceClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ space: "s1" })]}
          highlightedSpaces={["s2"]}
          onSpaceClick={onSpaceClick}
        />
      </ChakraProvider>
    );
    fireEvent.click(screen.getByTitle(/The Mandalorian/));
    expect(onSpaceClick).not.toHaveBeenCalled();
  });

  it("still routes a fighter-target click to onFighterClick, not onSpaceClick", () => {
    const onFighterClick = jest.fn();
    const onSpaceClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard
          map={MAP}
          fighters={[fighter({ id: "p1/hero", space: "s1" })]}
          highlightedFighters={["p1/hero"]}
          onFighterClick={onFighterClick}
          onSpaceClick={onSpaceClick}
        />
      </ChakraProvider>
    );
    fireEvent.click(screen.getByTitle(/The Mandalorian/));
    expect(onFighterClick).toHaveBeenCalledWith("p1/hero");
    expect(onSpaceClick).not.toHaveBeenCalled();
  });
});

// issue #120: pinch/scroll zoom + drag pan, gated behind the `zoomMap` flag.
// The frame (shrink-wrap box holding the art + every overlay) is transformed as
// one unit; the identity-based click model is untouched, so a click still lands
// the same action at any zoom/pan. `frame` = the img's parent positioning box.
const frameOf = () => screen.getByAltText("Test Map").parentElement as HTMLElement;

describe("ProBoard zoom/pan (issue #120)", () => {
  it("adds no transform and no reset control when zoomable is off (default)", () => {
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} onSpaceClick={() => {}} highlightedSpaces={["s2"]} />
      </ChakraProvider>
    );
    // no transform on the shrink-wrap frame — the board is untouched
    expect(["", "none"]).toContain(getComputedStyle(frameOf()).transform);
    // reset-to-fit control only exists once the feature is on AND off-identity
    expect(screen.queryByText("reset view")).not.toBeInTheDocument();
  });

  it("keeps identity-based clicks working when zoomable is on", () => {
    const onSpaceClick = jest.fn();
    render(
      <ChakraProvider>
        <ProBoard map={MAP} fighters={[fighter({})]} highlightedSpaces={["s2"]} onSpaceClick={onSpaceClick} zoomable />
      </ChakraProvider>
    );
    // the transform rides the frame (identity to start — same visual as off)
    expect(getComputedStyle(frameOf()).transform).toMatch(/scale|matrix/);
    // a plain click on the highlighted space still fires its action untouched:
    // no screen-coordinate math, so zoom/pan can't desync the hit target
    const circle = frameOf().querySelectorAll("div");
    // the highlighted hit-circle is the one wired with a pointer cursor
    const hit = [...circle].find((el) => getComputedStyle(el).cursor === "pointer");
    expect(hit).toBeTruthy();
    fireEvent.click(hit as HTMLElement);
    expect(onSpaceClick).toHaveBeenCalledWith("s2");
  });

  // issue #216: with zoomMap on, the inset panel is a child of the pan target,
  // so a header-drag pointerdown used to start BOTH the panel drag and a board
  // pan (a parallax). The header now stops propagation and useZoomPan ignores
  // any gesture that begins inside a region panel — so the board stays put.
  it("dragging a region panel's header does not pan the board", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} zoomable />
      </ChakraProvider>
    );
    const frame = frameOf();
    const before = getComputedStyle(frame).transform; // identity, feature on
    const header = screen.getByText("The Hut").parentElement as HTMLElement;
    fireEvent.pointerDown(header, { pointerId: 1, clientX: 100, clientY: 100 });
    // a move well past PAN_THRESHOLD — would translate the frame if it panned
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(getComputedStyle(frame).transform).toBe(before); // board untouched
    // and no drag-swallow lingered: the reset control never appeared
    expect(screen.queryByText("reset view")).not.toBeInTheDocument();
  });

  // the panel's own controls keep working under zoom (its collapse caret
  // stops propagation itself, so it never reaches the pan path either).
  it("keeps the region panel's collapse toggle working with zoom on", () => {
    render(
      <ChakraProvider>
        <ProBoard map={REGION_MAP} fighters={[fighter({})]} zoomable />
      </ChakraProvider>
    );
    expect(screen.getByAltText("The Hut")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("toggle The Hut"));
    expect(screen.queryByAltText("The Hut")).not.toBeInTheDocument(); // collapsed
  });
});
