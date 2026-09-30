import {
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
    expect(defaultAdventureSetup()).toEqual({ humans: 1, villainId: null, minionIds: [null] });
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
