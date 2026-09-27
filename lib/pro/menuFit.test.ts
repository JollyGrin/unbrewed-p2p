import { MENU_MIN_H, menuMaxHeight } from "./menuFit";

// iPhone 14 landscape viewport: 844 × 390 (Playwright's device descriptor).
const landscape = { viewportHeight: 390, safeTop: 0, safeBottom: 21 };

describe("menuMaxHeight (#917)", () => {
  it("side-opening list (tabletop right-start) gets the whole safe height, not the room below its trigger", () => {
    // trigger low in the left column — the list slides up via preventOverflow
    expect(menuMaxHeight({ side: "right", triggerTop: 250, triggerBottom: 294, ...landscape })).toBe(390 - 21 - 8 - 8);
  });

  it("list opening upward (portrait bottom bar, top-end) gets the room above the trigger", () => {
    expect(
      menuMaxHeight({ side: "top", triggerTop: 740, triggerBottom: 784, viewportHeight: 844, safeTop: 47, safeBottom: 34 }),
    ).toBe(740 - 8 - (47 + 8));
  });

  it("list opening downward (landscape rail, bottom-end) gets the room below the trigger", () => {
    expect(menuMaxHeight({ side: "bottom", triggerTop: 8, triggerBottom: 52, ...landscape })).toBe(390 - 21 - 8 - 52 - 8);
  });

  it("never collapses below a few rows", () => {
    expect(menuMaxHeight({ side: "bottom", triggerTop: 300, triggerBottom: 344, ...landscape })).toBe(MENU_MIN_H);
  });
});
