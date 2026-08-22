/**
 * Skull Kid's Clock Tower mitigation line (issue #663 ↔ engine #449).
 *
 * The engine asks the same static question up to five times in a row; this module
 * is what turns that into a decidable one. The tests below pin the two things that
 * make it safe to compute on EVERY prompt in EVERY game: it is silent unless a Skull
 * Kid seat is genuinely mid-strike, and it reads the banked reduction from whichever
 * seat the engine banks it on.
 */
import {
  CLOCK_TOWER_DAMAGE,
  clockTowerMitigation,
  clockTowerMitigationLine,
} from "./clockTower";
import type { ClockTowerSeat } from "./clockTower";
import type { ViewPrompt } from "./protocol";

const yesNo = (player: ViewPrompt["player"]): Pick<ViewPrompt, "kind" | "player"> => ({
  kind: "YES_NO",
  player,
});

/** p1 = Skull Kid mid-strike, p2 = the opponent being asked.
 *
 *  An emptied dial is an ABSENT key on the wire, not `TIME: 0` — the engine deletes a
 *  counter key when it reaches zero — so the fixture omits it, exactly as a live STATE
 *  frame does. `withTimeZero` pins that an explicit 0 reads identically. */
const striking = (mitigation = 0): ClockTowerSeat[] => [
  { id: "p1", heroId: "skull-kid", counters: { MITIGATION: mitigation } },
  { id: "p2", heroId: "king-kong", counters: {} },
];

describe("clockTowerMitigation", () => {
  it("is null for every prompt in a game with no Skull Kid", () => {
    expect(
      clockTowerMitigation(yesNo("p2"), [
        { id: "p1", heroId: "king-kong", counters: {} },
        { id: "p2", heroId: "thetis", counters: {} },
      ] as ClockTowerSeat[])
    ).toBeNull();
  });

  it("is null while the clock is still running — only TIME 0 is a strike", () => {
    const seats: ClockTowerSeat[] = [
      { id: "p1", heroId: "skull-kid", counters: { TIME: 1, MITIGATION: 0 } },
      { id: "p2", heroId: "king-kong", counters: {} },
    ];
    expect(clockTowerMitigation(yesNo("p2"), seats)).toBeNull();
  });

  it("is null for non-YES_NO prompts and for no prompt at all", () => {
    expect(clockTowerMitigation({ kind: "CHOOSE_SPACE", player: "p2" }, striking())).toBeNull();
    expect(clockTowerMitigation(null, striking())).toBeNull();
    expect(clockTowerMitigation(undefined, striking())).toBeNull();
  });

  it("is null for a YES_NO addressed to Skull Kid himself — he never buys down his own tower", () => {
    expect(clockTowerMitigation(yesNo("p1"), striking(2))).toBeNull();
  });

  it("reads an explicit TIME: 0 the same as an absent key", () => {
    const seats: ClockTowerSeat[] = [
      { id: "p1", heroId: "skull-kid", counters: { TIME: 0, MITIGATION: 3 } },
      { id: "p2", heroId: "king-kong", counters: {} },
    ];
    expect(clockTowerMitigation(yesNo("p2"), seats)).toEqual({ reduced: 3, landing: 2 });
  });

  it("is null for a Skull Kid seat carrying no counters at all (malformed/truncated)", () => {
    expect(
      clockTowerMitigation(yesNo("p2"), [
        { id: "p1", heroId: "skull-kid" },
        { id: "p2", heroId: "king-kong", counters: {} },
      ])
    ).toBeNull();
  });

  it("reports the banked reduction and what would still land", () => {
    expect(clockTowerMitigation(yesNo("p2"), striking(0))).toEqual({ reduced: 0, landing: 5 });
    expect(clockTowerMitigation(yesNo("p2"), striking(3))).toEqual({ reduced: 3, landing: 2 });
    expect(clockTowerMitigation(yesNo("p2"), striking(5))).toEqual({ reduced: 5, landing: 0 });
  });

  it("never reports negative damage — an over-discard is a no-op, not a heal", () => {
    // Engine caps MITIGATION at 5, but a net-negative damage is a silent no-op
    // server-side, so the line must not promise healing if the cap ever moves.
    expect(clockTowerMitigation(yesNo("p2"), striking(7))).toEqual({ reduced: 7, landing: 0 });
  });

  it("reads MITIGATION banked on the CHOOSING seat too (engine #449 is moving to per-opponent)", () => {
    const seats: ClockTowerSeat[] = [
      { id: "p1", heroId: "skull-kid", counters: { TIME: 0, MITIGATION: 0 } },
      { id: "p2", heroId: "king-kong", counters: { MITIGATION: 4 } },
    ];
    expect(clockTowerMitigation(yesNo("p2"), seats)).toEqual({ reduced: 4, landing: 1 });
  });

  it("addresses each opposing seat independently in a multi-hostile format", () => {
    const seats: ClockTowerSeat[] = [
      { id: "p1", heroId: "skull-kid", counters: { TIME: 0, MITIGATION: 0 } },
      { id: "p2", heroId: "king-kong", counters: { MITIGATION: 2 } },
      { id: "p3", heroId: "thetis", counters: { MITIGATION: 0 } },
    ];
    expect(clockTowerMitigation(yesNo("p2"), seats)).toEqual({ reduced: 2, landing: 3 });
    expect(clockTowerMitigation(yesNo("p3"), seats)).toEqual({ reduced: 0, landing: 5 });
  });
});

describe("clockTowerMitigationLine", () => {
  it("states the full damage before anything is discarded", () => {
    expect(clockTowerMitigationLine(yesNo("p2"), striking(0), "p2")).toBe(
      `Clock Tower: ${CLOCK_TOWER_DAMAGE} damage to each of your fighters — nothing discarded yet, so all ${CLOCK_TOWER_DAMAGE} would land.`
    );
  });

  it("states the running reduction and the remainder — the whole point of the line", () => {
    expect(clockTowerMitigationLine(yesNo("p2"), striking(3), "p2")).toBe(
      "Clock Tower: 5 damage to each of your fighters — currently reduced by 3, so 2 would land."
    );
  });

  it("says so plainly once the damage is fully covered (stop discarding)", () => {
    expect(clockTowerMitigationLine(yesNo("p2"), striking(5), "p2")).toBe(
      "Clock Tower: 5 damage to each of your fighters — currently reduced by 5: fully covered, no damage would land."
    );
  });

  it("renders for the WATCHING seat too, in the third person (every input is public)", () => {
    expect(clockTowerMitigationLine(yesNo("p2"), striking(3), "p1")).toBe(
      "Clock Tower: 5 damage to each of their fighters — currently reduced by 3, so 2 would land."
    );
  });

  it("is null wherever the mitigation itself is", () => {
    expect(clockTowerMitigationLine(yesNo("p1"), striking(2), "p1")).toBeNull();
    expect(clockTowerMitigationLine(null, striking(2), "p1")).toBeNull();
  });
});
