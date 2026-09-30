import type { ScenarioListing } from "./protocol";
import {
  adventureCreateFields,
  rosterOptions,
  scenarioFor,
  setScenario,
  adventureSeats,
  clampHumans,
  defaultAdventureSetup,
  minionSlotCount,
  setHumans,
  setMinion,
  setVillain,
} from "./adventureLobby";

describe("adventure lobby setup", () => {
  it("defaults to a solo table with random enemies", () => {
    expect(defaultAdventureSetup()).toEqual({ scenarioId: null, humans: 1, villainId: null, minionIds: [null] });
  });

  it("clamps the table to 1..4", () => {
    expect([0, 1, 4, 9, NaN].map(clampHumans)).toEqual([1, 1, 4, 4, 1]);
  });

  it("scales minion slots with the table, keeping existing picks", () => {
    let s = setHumans(defaultAdventureSetup(), 3);
    expect(s.minionIds).toHaveLength(minionSlotCount(3));
    s = setMinion(s, 0, "raptor");
    s = setHumans(s, 2);
    expect(s.minionIds).toEqual(["raptor", null]);
  });

  it("refuses a duplicate minion (R5) but allows re-picking the same slot", () => {
    let s = setHumans(defaultAdventureSetup(), 2);
    s = setMinion(s, 0, "raptor");
    expect(setMinion(s, 1, "raptor")).toBe(s);
    expect(setMinion(s, 0, "raptor").minionIds).toEqual(["raptor", null]);
    expect(setMinion(s, 5, "x")).toBe(s);
  });

  it("sets and clears the villain", () => {
    const s = setVillain(defaultAdventureSetup(), "indominus-rex");
    expect(s.villainId).toBe("indominus-rex");
    expect(setVillain(s, null).villainId).toBeNull();
  });

  it("lists the pre-fillable seats for the table size", () => {
    expect(adventureSeats(1)).toEqual([]);
    expect(adventureSeats(3)).toEqual(["p2", "p3"]);
    expect(adventureSeats(4)).toEqual(["p2", "p3", "p4"]);
  });
});

const enemy = (id: string, role: "VILLAIN" | "MINION" = "MINION") => ({ id, name: id, role, hp: [5], move: 3, size: "NORMAL" as const });
const ISLA: ScenarioListing = {
  id: "isla-nublar",
  label: "Isla Nublar",
  formatIds: ["adventure"],
  mapId: "isla-nublar",
  villain: "indominus-rex",
  villains: [enemy("indominus-rex", "VILLAIN"), enemy("t-rex", "VILLAIN")],
  fixedMinions: [],
  minionPool: [enemy("raptor"), enemy("compy")],
  minionsPerPlayer: 1,
  duplicateMinions: false,
};

describe("adventure roster from LIST_SCENARIOS (#1107)", () => {
  it("defaults to the first listing and offers its villains and minion pool", () => {
    expect(scenarioFor(defaultAdventureSetup(), [ISLA])).toBe(ISLA);
    expect(rosterOptions(ISLA).villains.map((v) => v.id)).toEqual(["indominus-rex", "t-rex"]);
    expect(rosterOptions(ISLA).minions.map((m) => m.id)).toEqual(["raptor", "compy"]);
    expect(rosterOptions(null)).toEqual({ villains: [], minions: [] });
  });

  it("sends only the scenario id when every pick is random", () => {
    expect(adventureCreateFields(defaultAdventureSetup(), [ISLA])).toEqual({ ok: true, scenarioId: "isla-nublar" });
  });

  it("sends picks as a roster, one minion slot per hero seat", () => {
    let s = setHumans(defaultAdventureSetup(), 2);
    s = setVillain(s, "t-rex");
    s = setMinion(s, 1, "compy");
    expect(adventureCreateFields(s, [ISLA])).toEqual({
      ok: true,
      scenarioId: "isla-nublar",
      roster: { villain: "t-rex", minions: [null, "compy"] },
    });
  });

  it("drops picks the scenario does not offer instead of sending them", () => {
    const s = setMinion(setVillain(defaultAdventureSetup(), "gone"), 0, "gone");
    expect(adventureCreateFields(s, [ISLA])).toEqual({ ok: true, scenarioId: "isla-nublar" });
  });

  it("a fixed roster (minionsPerPlayer 0) has no pickable slots", () => {
    const fixed = { ...ISLA, minionsPerPlayer: 0, minionPool: [] };
    expect(setScenario(setHumans(defaultAdventureSetup(), 3), fixed).minionIds).toEqual([]);
  });

  it("refuses to create with a reason when no scenario is listed (#1113)", () => {
    const r = adventureCreateFields(defaultAdventureSetup(), []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/no Adventure scenario/);
  });
});
