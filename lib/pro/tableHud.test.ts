import type { Action } from "./protocol";
import { RAIL_WIDTH } from "./mobileLayout";
import { SEAT_COLOR } from "./seatColors";
import {
  HUD_FAN_MAX_SPREAD_REM,
  HUD_FAN_STEP_REM,
  HUD_FAN_TILT_DEG,
  HUD_GUTTER,
  HUD_HAND_VISIBLE_PX,
  HUD_TOP_RESERVE_PX,
  handFanLayout,
  hexLabelFor,
  tableHudBanner,
  tableHudControls,
  tableHudFitInset,
} from "./tableHud";

const maneuver = { type: "MANEUVER", player: "p1" } as unknown as Action;
const endManeuver = { type: "END_MANEUVER", player: "p1" } as unknown as Action;
const scheme = { type: "SCHEME", player: "p1", card: "c1" } as unknown as Action;
const other = { type: "USE_SCHEME_ITEM", player: "p1" } as unknown as Action;
const describeAction = (a: Action) => (a.type === "USE_SCHEME_ITEM" ? "Use the golden idol to heal 2" : a.type);

const base = {
  stepping: null,
  sheetShown: false,
  compact: null,
  primary: null,
  extra: 0,
  canUndo: false,
  undoPending: false,
};

describe("tableHudFitInset", () => {
  test("keeps the banner's strip and the visible hand clear, and only a gutter at the sides", () => {
    expect(tableHudFitInset()).toEqual({
      top: HUD_TOP_RESERVE_PX,
      bottom: HUD_HAND_VISIBLE_PX,
      left: HUD_GUTTER,
      right: HUD_GUTTER,
    });
  });

  test("gives the open decision sheet its column, so the focus zoom keeps picks left of it", () => {
    expect(tableHudFitInset({ sheetShown: true }).right).toBe(RAIL_WIDTH + 2 * HUD_GUTTER);
    expect(tableHudFitInset({ sheetShown: false }).right).toBe(HUD_GUTTER);
  });

  test("keeps the board out of the camera cut-out and off the home indicator", () => {
    const safe = { top: 0, right: 59, bottom: 21, left: 59 };
    expect(tableHudFitInset({ safe })).toEqual({
      top: HUD_TOP_RESERVE_PX,
      bottom: HUD_HAND_VISIBLE_PX + 21,
      left: HUD_GUTTER + 59,
      right: HUD_GUTTER + 59,
    });
    expect(tableHudFitInset({ safe, sheetShown: true }).right).toBe(RAIL_WIDTH + 2 * HUD_GUTTER + 59);
  });

  test("reserves less than the plates are tall: their corners are table, not board", () => {
    const PLATE_H_PX = 60;
    expect(HUD_TOP_RESERVE_PX).toBeLessThan(PLATE_H_PX);
  });
});

describe("SEAT_COLOR", () => {
  test("keeps the board's four seat colours", () => {
    expect(SEAT_COLOR).toEqual({ p1: "#E0A82E", p2: "#3B8BEB", p3: "#2F9E68", p4: "#C0449E" });
  });
});

describe("hexLabelFor", () => {
  test("names the three core actions by their tile", () => {
    expect(hexLabelFor(maneuver, describeAction)).toBe("Maneuver");
    expect(hexLabelFor(scheme, describeAction)).toBe("Scheme");
  });

  test("calls ending a maneuver what it does on the table", () => {
    expect(hexLabelFor(endManeuver, describeAction)).toBe("End move");
  });

  test("shortens any other action to what fits a hexagon", () => {
    expect(hexLabelFor(other, describeAction)).toBe("Use the golden…");
  });
});

describe("tableHudControls", () => {
  test("offers the primary action in gold, the rest behind MORE, and undo", () => {
    const c = tableHudControls({ ...base, primary: maneuver, extra: 2, canUndo: true }, describeAction);
    expect(c.main).toEqual({ id: "primary", label: "Maneuver", emphasis: "gold", disabled: false });
    expect(c.minor.map((m) => m.id)).toEqual(["undo", "more"]);
    expect(c.minor.find((m) => m.id === "more")?.label).toBe("+2");
  });

  test("an END MOVE primary is the outline hex, never the gold one", () => {
    const c = tableHudControls({ ...base, primary: endManeuver }, describeAction);
    expect(c.main?.emphasis).toBe("outline");
  });

  test("a walk in progress gets END MOVE and CANCEL, whatever else is legal", () => {
    const c = tableHudControls(
      { ...base, primary: maneuver, extra: 3, stepping: { canEnd: false, commitLabel: undefined } },
      describeAction
    );
    expect(c.main).toEqual({ id: "end-move", label: "End move", emphasis: "outline", disabled: true });
    expect(c.minor.map((m) => m.id)).toEqual(["cancel-move"]);
  });

  test("an effect move commits with its own wording", () => {
    const c = tableHudControls({ ...base, stepping: { canEnd: true, commitLabel: "Commit here" } }, describeAction);
    expect(c.main?.label).toBe("Commit here");
    expect(c.main?.disabled).toBe(false);
  });

  test("a board-pick prompt keeps its skip/decline answers one tap away", () => {
    const c = tableHudControls({ ...base, compact: "board-pick" }, describeAction);
    expect(c.main).toEqual({ id: "open-sheet", label: "Options", emphasis: "outline", disabled: false });
  });

  test("a minimised decision calls itself back in gold", () => {
    const c = tableHudControls({ ...base, compact: "minimized" }, describeAction);
    expect(c.main).toEqual({ id: "open-sheet", label: "Open", emphasis: "gold", disabled: false });
  });

  test("shows no hexagons while the decision sheet is open — the sheet carries every answer", () => {
    const c = tableHudControls({ ...base, sheetShown: true, primary: maneuver, canUndo: true }, describeAction);
    expect(c).toEqual({ main: null, minor: [] });
  });

  test("an undo already asked for is shown, disabled", () => {
    const c = tableHudControls({ ...base, canUndo: true, undoPending: true }, describeAction);
    expect(c.main).toBeNull();
    expect(c.minor).toEqual([{ id: "undo", label: "Asked", emphasis: "plain", disabled: true }]);
  });
});

describe("tableHudBanner", () => {
  const turn = { mine: true, pips: 2, label: "Your turn" };

  test("says whose turn it is, with the actions left as pips", () => {
    expect(tableHudBanner({ hint: null, combatSummary: null, stepping: null, turn })).toEqual({
      title: "Your turn",
      detail: null,
      pips: 2,
      tone: "mine",
    });
  });

  test("a board instruction replaces the turn line", () => {
    const b = tableHudBanner({ hint: "tap a gold space to move there (2 options)", combatSummary: null, stepping: null, turn });
    expect(b?.title).toBe("Tap a gold space to move there (2 options)");
    expect(b?.pips).toBe(2);
  });

  test("a walk says who is walking and how far is left", () => {
    const b = tableHudBanner({
      hint: "ignored",
      combatSummary: null,
      stepping: { fighterName: "King Kong", movesLeft: 1 },
      turn,
    });
    expect(b).toEqual({ title: "Tap a gold space to move King Kong", detail: "1 move left", pips: 0, tone: "mine" });
  });

  test("a decided combat's result stands in when there is nothing to tap", () => {
    const b = tableHudBanner({ hint: null, combatSummary: "Attacker wins · 3 dmg", stepping: null, turn });
    expect(b?.title).toBe("Attacker wins · 3 dmg");
  });

  test("the opponent's turn reads as theirs, without pips", () => {
    const b = tableHudBanner({
      hint: null,
      combatSummary: null,
      stepping: null,
      turn: { mine: false, pips: 0, label: "Darth Maul's turn" },
    });
    expect(b).toEqual({ title: "Darth Maul's turn", detail: null, pips: 0, tone: "theirs" });
  });

  test("is empty outside a live game", () => {
    expect(tableHudBanner({ hint: null, combatSummary: null, stepping: null, turn: null })).toBeNull();
  });
});

describe("handFanLayout", () => {
  test("a single card stands upright in the middle", () => {
    expect(handFanLayout(1)).toEqual([{ x: 0, rotate: 0, drop: 0 }]);
  });

  test("fans symmetrically, outer cards tilted outward and lower", () => {
    const fan = handFanLayout(3);
    expect(fan.map((c) => c.x)).toEqual([-HUD_FAN_STEP_REM, 0, HUD_FAN_STEP_REM]);
    expect(fan[0].rotate).toBe(-HUD_FAN_TILT_DEG);
    expect(fan[2].rotate).toBe(HUD_FAN_TILT_DEG);
    expect(fan[0].drop).toBeGreaterThan(0);
    expect(fan[1].drop).toBe(0);
  });

  test("a big hand closes up so the fan never outgrows its lane", () => {
    const fan = handFanLayout(12);
    expect(fan[11].x - fan[0].x).toBeCloseTo(HUD_FAN_MAX_SPREAD_REM);
  });

  test("an empty hand draws nothing", () => {
    expect(handFanLayout(0)).toEqual([]);
  });
});
