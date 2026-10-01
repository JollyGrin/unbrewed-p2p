import type { ScenarioListing } from "./protocol";
import {
  adventureCreateFields,
  rosterOptions,
  scenarioFor,
  setScenario,
  adventureSeats,
  clampHumans,
  defaultAdventureSetup,
  enemyHpAt,
  enemySizeMove,
  waitingRoster,
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

describe("enemy stats at the selected hero count (#1153)", () => {
  const hp = { hp: [14, 16, 18, 20] };
  it("indexes HP by hero count for 1–4 heroes", () => {
    expect([1, 2, 3, 4].map((n) => enemyHpAt(hp, n))).toEqual([14, 16, 18, 20]);
  });
  it("clamps to the last entry; a flat hp is one entry", () => {
    expect(enemyHpAt({ hp: [10] }, 4)).toBe(10);
    expect(enemyHpAt({ hp: [10, 12] }, 4)).toBe(12);
    expect(enemyHpAt({ hp: [] }, 2)).toBeNull();
  });
  it("formats size and MOVE", () => {
    expect(enemySizeMove({ size: "LARGE", move: 2 })).toBe("LARGE · MOVE 2");
  });
});

describe("waiting-room roster from ROOM_STATUS.scenario (#1153)", () => {
  it("resolves ids against the listing and leaves null slots Random", () => {
    const rows = waitingRoster({ id: "isla-nublar", label: "Isla Nublar", villain: "t-rex", minions: ["raptor", null] }, [ISLA]);
    expect(rows.map((r) => [r.role, r.name])).toEqual([
      ["VILLAIN", "t-rex"],
      ["MINION", "raptor"],
      ["MINION", "Random"],
    ]);
    expect(rows[0]!.enemy?.id).toBe("t-rex");
    expect(rows[2]!.enemy).toBeNull();
  });
  it("keeps an id the client doesn't know", () => {
    const rows = waitingRoster({ id: "x", label: "X", villain: "mystery", minions: [] }, []);
    expect(rows).toEqual([{ role: "VILLAIN", id: "mystery", name: "mystery", enemy: null }]);
  });
});
