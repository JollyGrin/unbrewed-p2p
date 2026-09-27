/**
 * Shared spaces on the tabletop (issue #872). Since protocol v28 up to four
 * SMALL fighters and one non-small share a space, and board objects (corpses,
 * totems) stack too. The flat board rings them with lib/pro/tokenStack.ts; the
 * tabletop used to plant every piece at exactly `space.x/space.y`, so a crowd
 * drew as one token and the covered ones could not be seen or clicked.
 *
 * Each expected position below is computed BY HAND from the flat board's slot
 * (`stackLayout` — the function ProBoard lays its tokens out with): the flat
 * board draws a token `diameter × scale` of the board's width wide and
 * translates it by `dx%`/`dy%` of that width, so in board units the centre is
 * `x + dx/100 · w` and `y + dy/100 · w · (frameW / frameH)`.
 */
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TableBoard } from "./TableBoard";
import type { ProMapDef, ViewFighter, ViewToken } from "@/lib/pro/protocol";
import { objectStackOffsets, stackLayout } from "@/lib/pro/tokenStack";

/** TableBoard's DEFAULT_DIAMETER — the map below sets none. */
const DIAMETER = 0.021;
/** The frame the stage measures: a 2:1 board, so the y conversion matters. */
const FRAME_W = 1000;
const FRAME_H = 500;

const MAP: ProMapDef = {
  schemaVersion: "1",
  id: "stack-map",
  meta: { title: "Stack Map", minPlayers: 2, maxPlayers: 2, specialRules: false, imageUrl: "/test.png" },
  zones: [],
  spaces: [
    { id: "s1", x: 0.2, y: 0.3, zones: [], adjacentTo: ["s2"] },
    { id: "s2", x: 0.5, y: 0.5, zones: [], adjacentTo: ["s1", "s3"] },
    { id: "s3", x: 0.6, y: 0.5, zones: [], adjacentTo: ["s2"] },
  ],
};
const spaceOf = (id: string) => MAP.spaces.find((s) => s.id === id)!;

const fighter = (over: Partial<ViewFighter>): ViewFighter => ({
  id: "p1/hero",
  owner: "p1",
  kind: "HERO",
  name: "Gerry",
  space: "s2",
  tailSpace: null,
  hp: 10,
  maxHp: 10,
  reach: "MELEE",
  size: "NORMAL",
  defeated: false,
  ...over,
});
const larry = (n: number, over: Partial<ViewFighter> = {}) =>
  fighter({ id: `p1/larry-${n}`, kind: "SIDEKICK", name: `Larry ${n}`, size: "SMALL", hp: 1, maxHp: 1, ...over });
const corpse = (n: number, space = "s2"): ViewToken => ({
  id: `corpse-${n}`,
  kind: "corpse",
  owner: "p1",
  space,
  origin: `corpse-of:p1/larry-${n}`,
});

let restore: (() => void) | null = null;
beforeEach(() => {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, get: () => FRAME_W });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => FRAME_H });
  const RO = (global as { ResizeObserver?: unknown }).ResizeObserver;
  (global as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  restore = () => {
    if (w) Object.defineProperty(HTMLElement.prototype, "offsetWidth", w);
    if (h) Object.defineProperty(HTMLElement.prototype, "offsetHeight", h);
    (global as { ResizeObserver?: unknown }).ResizeObserver = RO;
  };
});
afterEach(() => restore?.());

/** Renders, then lets framer-motion apply the positions from the MEASURED
 *  frame (the first render sees a 0×0 frame; the move lands a frame later). */
const renderBoard = async (fighters: ViewFighter[], tokens: ViewToken[] = []) => {
  const r = render(
    <ChakraProvider>
      <TableBoard map={MAP} fighters={fighters} tokens={tokens} />
    </ChakraProvider>
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  return r;
};

/** The piece's anchor: the nearest ancestor framer-motion positions inline. */
const anchorOf = (el: Element): HTMLElement => {
  let n: HTMLElement | null = el as HTMLElement;
  while (n && !(n.style.left && n.style.top)) n = n.parentElement;
  if (!n) throw new Error("no anchor");
  return n;
};
const fighterAnchor = (c: HTMLElement, id: string) => anchorOf(c.querySelector(`[data-fighter-id="${id}"]`)!);
const at = (el: HTMLElement) => ({ x: parseFloat(el.style.left) / 100, y: parseFloat(el.style.top) / 100 });
const zOf = (el: HTMLElement) => Number(getComputedStyle(el).zIndex);

/** Where the flat board centres a token with this slot, in board units. */
const flatBoardCentre = (spaceId: string, slot: { dx: number; dy: number }, scale: number) => {
  const s = spaceOf(spaceId);
  const w = DIAMETER * scale;
  return { x: s.x + (slot.dx / 100) * w, y: s.y + (slot.dy / 100) * w * (FRAME_W / FRAME_H) };
};

describe("TableBoard — fighters sharing a space", () => {
  const crowd = [fighter({}), larry(1), larry(2), larry(3), larry(4)];

  it("gives N fighters on one space N distinct anchors, each on the flat board's slot", async () => {
    const { container } = await renderBoard(crowd);
    const slots = stackLayout(crowd.map((f) => ({ key: f.id, size: f.size! })));
    const seen = new Set<string>();
    for (const f of crowd) {
      const slot = slots.get(f.id)!;
      const want = flatBoardCentre("s2", slot, slot.scale);
      const got = at(fighterAnchor(container, f.id));
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
      seen.add(`${got.x.toFixed(5)},${got.y.toFixed(5)}`);
    }
    expect(seen.size).toBe(crowd.length);
  });

  it("draws the smalls above the body they stand on, whatever their ring position", async () => {
    const { container } = await renderBoard(crowd);
    const hero = zOf(fighterAnchor(container, "p1/hero"));
    // Larry 1 sits at 12 o'clock — FARTHER into the board than the hero, so a
    // plain painter's order by its own y would slide it under the hero.
    for (let n = 1; n <= 4; n++) expect(zOf(fighterAnchor(container, `p1/larry-${n}`))).toBeGreaterThan(hero);
  });

  it("lays each small ON the body it overlaps, not under its thicker top face", async () => {
    // The board plane is preserve-3d: the browser orders flat tokens by their
    // real height, so z-index alone left a ringed small under the big token.
    const { container } = await renderBoard(crowd);
    const z = (el: Element | null) => Number(/translateZ\((-?[\d.]+)px\)/.exec((el as HTMLElement)?.getAttribute("style") ?? "")?.[1] ?? 0);
    const heroTop = z(container.querySelector('[data-fighter-id="p1/hero"]'));
    for (let n = 1; n <= 4; n++) {
      const ground = fighterAnchor(container, `p1/larry-${n}`).querySelector("[data-standee-ground]");
      expect(z(ground)).toBeGreaterThan(heroTop);
    }
  });

  it("lets a click through the big body's upright badge plate to the piece lying behind it", async () => {
    const { container } = await renderBoard(crowd);
    const plate = fighterAnchor(container, "p1/hero").querySelector("[data-stacked-plate]");
    expect(plate).not.toBeNull();
    expect(getComputedStyle(plate as Element).pointerEvents).toBe("none");
  });

  it("draws a SMALL small, as the flat board does", async () => {
    const { container } = await renderBoard(crowd);
    const width = (id: string) => parseFloat(getComputedStyle(fighterAnchor(container, id)).width);
    expect(width("p1/larry-1") / width("p1/hero")).toBeCloseTo(0.52 / 0.82, 4);
  });

  it("rings smalls around a LARGE fighter's tail space too", async () => {
    const kong = fighter({ id: "p2/kong", owner: "p2", name: "King Kong", size: "LARGE", space: "s1", tailSpace: "s2" });
    const { container } = await renderBoard([kong, larry(1)]);
    const tail = at(fighterAnchor(container, "p2/kong-tail"));
    expect(tail).toEqual({ x: 0.5, y: 0.5 });
    const want = flatBoardCentre("s2", { dx: 0, dy: -46 }, 0.52);
    const got = at(fighterAnchor(container, "p1/larry-1"));
    expect(got.x).toBeCloseTo(want.x, 6);
    expect(got.y).toBeCloseTo(want.y, 6);
  });

  it("leaves a lone piece dead-centre on its space", async () => {
    const { container } = await renderBoard([fighter({ space: "s1" }), larry(1, { space: "s3" })]);
    expect(at(fighterAnchor(container, "p1/hero"))).toEqual({ x: 0.2, y: 0.3 });
    expect(at(fighterAnchor(container, "p1/larry-1"))).toEqual({ x: 0.6, y: 0.5 });
    expect(container.querySelector("[data-stacked-plate]")).toBeNull();
  });
});

describe("TableBoard — board objects sharing a space", () => {
  const corpses = [corpse(1), corpse(2), corpse(3), corpse(4)];
  const objectAnchors = (c: HTMLElement) =>
    Array.from(c.querySelectorAll<HTMLElement>('[title^="Corpse"]')).map((el) => anchorOf(el));

  it("rings four corpses on one space onto the flat board's four object slots", async () => {
    const { container } = await renderBoard([], corpses);
    const anchors = objectAnchors(container);
    expect(anchors).toHaveLength(4);
    const offsets = objectStackOffsets(4);
    anchors.forEach((a, i) => {
      const want = flatBoardCentre("s2", offsets[i], 0.62);
      expect(at(a).x).toBeCloseTo(want.x, 6);
      expect(at(a).y).toBeCloseTo(want.y, 6);
    });
    expect(new Set(anchors.map((a) => `${a.style.left},${a.style.top}`)).size).toBe(4);
  });

  it("keeps stacked objects behind a fighter standing on the same space", async () => {
    const { container } = await renderBoard([fighter({})], corpses);
    const hero = zOf(fighterAnchor(container, "p1/hero"));
    for (const a of objectAnchors(container)) expect(zOf(a)).toBeLessThan(hero);
  });
});
