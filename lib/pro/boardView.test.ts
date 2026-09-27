import {
  boardViewLockedHint,
  BOARD_VIEW_LABEL,
  DEFAULT_BOARD_VIEW,
  isBoardView,
  nextBoardView,
  mapHasRegions,
  resolveBoardView,
  TABLETOP_CANNOT_SHOW_MAP,
  TABLETOP_NEEDS_LANDSCAPE,
} from "./boardView";

describe("boardView", () => {
  it("leaves an untouched device on the original straight-on board", () => {
    expect(DEFAULT_BOARD_VIEW).toBe("flat");
  });

  it("rejects anything that does not name a real view", () => {
    expect(isBoardView("table")).toBe(true);
    expect(isBoardView("isometric")).toBe(false);
    expect(isBoardView("")).toBe(false);
  });

  it("toggles between the two views and back", () => {
    expect(nextBoardView("flat")).toBe("table");
    expect(nextBoardView("table")).toBe("flat");
  });

  it("labels both views for the chip that switches them", () => {
    expect(BOARD_VIEW_LABEL.flat).toBeTruthy();
    expect(BOARD_VIEW_LABEL.table).toBeTruthy();
  });

  // #870: the tabletop frame has no counter-rotation, so a portrait phone
  // (whose board frame is turned 90°) must draw the flat board.
  it("draws the flat board in portrait whatever the stored preference", () => {
    expect(resolveBoardView("table", "portrait")).toBe("flat");
    expect(resolveBoardView("flat", "portrait")).toBe("flat");
  });

  it("honours the stored preference on desktop and landscape phones", () => {
    expect(resolveBoardView("table", "rail")).toBe("table");
    expect(resolveBoardView("table", "desktop")).toBe("table");
    expect(resolveBoardView("flat", "rail")).toBe("flat");
    expect(resolveBoardView("flat", "desktop")).toBe("flat");
  });

  // #914: a region's spaces sit on their own inset image, which the tabletop
  // cannot place — such a map (Baba Yaga's Hut) draws the flat board.
  describe("maps with regions", () => {
    const HUT_MAP = { regions: [{ id: "hut", label: "Baba Yaga's Hut" }] };

    it("knows a map with a region from one without", () => {
      expect(mapHasRegions(HUT_MAP)).toBe(true);
      expect(mapHasRegions({ regions: [] })).toBe(false);
      expect(mapHasRegions({})).toBe(false);
      expect(mapHasRegions(null)).toBe(false);
      expect(mapHasRegions(undefined)).toBe(false);
    });

    it("draws the flat board for a region map whatever the stored preference", () => {
      expect(resolveBoardView("table", "desktop", HUT_MAP)).toBe("flat");
      expect(resolveBoardView("table", "rail", HUT_MAP)).toBe("flat");
      expect(resolveBoardView("flat", "desktop", HUT_MAP)).toBe("flat");
    });

    it("leaves an ordinary map, or no map yet, on the stored preference", () => {
      expect(resolveBoardView("table", "desktop", {})).toBe("table");
      expect(resolveBoardView("table", "rail", { regions: [] })).toBe("table");
      expect(resolveBoardView("table", "desktop", null)).toBe("table");
    });

    it("locks the Board toggle with the reason, the map before the layout", () => {
      expect(boardViewLockedHint("desktop", HUT_MAP)).toBe(TABLETOP_CANNOT_SHOW_MAP);
      expect(boardViewLockedHint("portrait", HUT_MAP)).toBe(TABLETOP_CANNOT_SHOW_MAP);
      expect(boardViewLockedHint("portrait", {})).toBe(TABLETOP_NEEDS_LANDSCAPE);
      expect(boardViewLockedHint("portrait")).toBe(TABLETOP_NEEDS_LANDSCAPE);
      expect(boardViewLockedHint("desktop", {})).toBeUndefined();
      expect(boardViewLockedHint("rail")).toBeUndefined();
    });
  });
});
