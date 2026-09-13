/**
 * Card-flight anchors (issue #811): a flight asks for the first anchor in a
 * chain that is actually on screen, and lands in the middle of the screen
 * when none is — it never throws and never picks a hidden element.
 */
import {
  AnchorRect,
  findAnchor,
  isAnchorOnScreen,
  resolveAnchor,
  screenCentre,
} from "./irlAnchors";

const VIEW = { width: 390, height: 844 };

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", { value: VIEW.width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: VIEW.height, configurable: true });
});

afterEach(() => {
  document.body.innerHTML = "";
  delete (document as Partial<Document>).elementFromPoint;
});

/** mount an anchor with a fixed layout box */
const anchor = (name: string, rect: AnchorRect) => {
  const el = document.createElement("div");
  el.setAttribute("data-irl-anchor", name);
  el.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top }) as DOMRect;
  document.body.appendChild(el);
  return el;
};

/** stand in for the browser's hit test: `top` is whatever is drawn there */
const hitTest = (top: (x: number, y: number) => Element | null) => {
  document.elementFromPoint = jest.fn(top);
};

const DECK = { left: 300, top: 150, width: 80, height: 64 };
const HAND = { left: 110, top: 150, width: 80, height: 64 };
const CARD = { left: 90, top: 300, width: 200, height: 280 };

describe("findAnchor", () => {
  test("the first anchor in the chain that is on screen", () => {
    anchor("deck-tile", DECK);
    anchor("hand-tile", HAND);
    expect(findAnchor(["deck-tile", "hand-tile"])).toEqual({ name: "deck-tile", rect: DECK });
  });

  test("an anchor that isn't mounted falls through to the next", () => {
    anchor("hand-tile", HAND);
    expect(findAnchor(["hand-card", "hand-tile"])?.name).toBe("hand-tile");
  });

  test("a zero-size anchor (display: none) falls through", () => {
    anchor("hand-card", { left: 0, top: 0, width: 0, height: 0 });
    anchor("hand-tile", HAND);
    expect(findAnchor(["hand-card", "hand-tile"])?.name).toBe("hand-tile");
  });

  test("an anchor whose middle is off screen falls through", () => {
    anchor("hand-grid-card-7", { ...CARD, top: VIEW.height + 40 });
    anchor("hand-tile", HAND);
    expect(findAnchor(["hand-grid-card-7", "hand-tile"])?.name).toBe("hand-tile");
  });

  test("an anchor under a sheet falls through to the one on the sheet", () => {
    const tray = anchor("hand-tile", HAND);
    const sheet = document.createElement("div");
    document.body.appendChild(sheet);
    const row = anchor("discard-row-2", CARD);
    // the sheet covers everything but its own rows
    hitTest((_x, y) => (y >= CARD.top && y <= CARD.top + CARD.height ? row : sheet));
    expect(isAnchorOnScreen(tray)).toBe(false);
    expect(findAnchor(["hand-tile", "discard-row-2"])?.name).toBe("discard-row-2");
  });

  test("a hit on a child of the anchor counts as the anchor", () => {
    const tile = anchor("deck-tile", DECK);
    const label = document.createElement("span");
    tile.appendChild(label);
    hitTest(() => label);
    expect(findAnchor(["deck-tile"])?.name).toBe("deck-tile");
  });

  test("several elements with one name: the last one on screen wins", () => {
    anchor("hand-card", CARD); // the tray card, under the card view
    const view = anchor("hand-card", { left: 40, top: 120, width: 310, height: 434 });
    hitTest(() => view);
    expect(findAnchor(["hand-card"])?.rect.width).toBe(310);
  });

  test("a trailing * matches by prefix", () => {
    anchor("boost-slot-0", { left: 250, top: 300, width: 72, height: 100 });
    anchor("boost-slot-1", { left: 250, top: 410, width: 72, height: 100 });
    expect(findAnchor(["boost-slot-*"])?.rect.top).toBe(410);
  });

  test("nothing on screen is null, not a throw", () => {
    expect(findAnchor(["deck-tile", "hand-tile"])).toBeNull();
    expect(findAnchor([])).toBeNull();
    hitTest(() => {
      throw new Error("detached");
    });
    anchor("deck-tile", DECK);
    expect(findAnchor(["deck-tile"])).toBeNull();
  });
});

describe("resolveAnchor", () => {
  test("an anchor on screen resolves to its rect", () => {
    anchor("discard-tile", DECK);
    expect(resolveAnchor(["discard-tile"], { width: 60, height: 84 })).toEqual({
      name: "discard-tile",
      rect: DECK,
    });
  });

  test("with none on screen, the middle of the screen at the given size", () => {
    const size = { width: 60, height: 84 };
    const centre = resolveAnchor(["in-play-card", "hand-tile"], size);
    expect(centre.name).toBeNull();
    expect(centre.rect).toEqual(screenCentre(size));
    expect(centre.rect).toEqual({
      left: VIEW.width / 2 - 30,
      top: VIEW.height / 2 - 42,
      width: 60,
      height: 84,
    });
  });
});
