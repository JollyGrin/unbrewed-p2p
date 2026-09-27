import {
  boardViewLockedHint,
  BOARD_VIEW_LABEL,
  DEFAULT_BOARD_VIEW,
  isBoardView,
  nextBoardView,
  mapHasRegions,
  resolveBoardView,
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

  it("locks the Board toggle only in portrait", () => {
    expect(boardViewLockedHint("portrait")).toBe(TABLETOP_NEEDS_LANDSCAPE);
    expect(boardViewLockedHint("desktop")).toBeUndefined();
    expect(boardViewLockedHint("rail")).toBeUndefined();
  });

  // #922 (hybrid): a region map (Baba Yaga's Hut) no longer falls back to the
  // flat board — TableBoard renders its main spaces in 3D and floats the
  // region as its own 2D inset panel over that frame. `mapHasRegions` itself
  // survives only as the "which spaces are main vs region" helper TableBoard
  // uses to build its 3D space list; it no longer feeds `resolveBoardView`.
  describe("maps with regions", () => {
    const HUT_MAP = { regions: [{ id: "hut", label: "Baba Yaga's Hut" }] };

    it("knows a map with a region from one without", () => {
      expect(mapHasRegions(HUT_MAP)).toBe(true);
      expect(mapHasRegions({ regions: [] })).toBe(false);
      expect(mapHasRegions({})).toBe(false);
      expect(mapHasRegions(null)).toBe(false);
      expect(mapHasRegions(undefined)).toBe(false);
    });

    it("resolves a region map to the tabletop view exactly like any other map", () => {
      expect(resolveBoardView("table", "desktop")).toBe("table");
      expect(resolveBoardView("table", "rail")).toBe("table");
      expect(resolveBoardView("flat", "desktop")).toBe("flat");
    });

    it("still forces the flat board for a region map in portrait", () => {
      expect(resolveBoardView("table", "portrait")).toBe("flat");
    });
  });
});
