import { heroIdsForArt } from "./useProCardArt";

// unbrewed-p2p #210: the hero-art prefetch derives its hero list from a STATE
// view. It must survive an empty players[] (protocol downgrade / rolling-deploy
// mismatch / malformed view) by falling back to the legacy self/opponent seats,
// and it must produce a list that CHANGES once players[] repopulates so the
// query-keyed prefetch re-fires.
describe("heroIdsForArt", () => {
  it("derives unique hero ids from a populated players[]", () => {
    const view = {
      players: [{ heroId: "thrall" }, { heroId: "king-kong" }, { heroId: "thrall" }],
      self: { heroId: "thrall" },
      opponent: { heroId: "king-kong" },
    };
    expect(heroIdsForArt(view).sort()).toEqual(["king-kong", "thrall"]);
  });

  it("falls back to self/opponent heroIds when players[] is empty", () => {
    const view = {
      players: [],
      self: { heroId: "baba-yaga" },
      opponent: { heroId: "buster-keaton" },
    };
    expect(heroIdsForArt(view).sort()).toEqual(["baba-yaga", "buster-keaton"]);
  });

  it("falls back to self alone when players[] and opponent are both absent", () => {
    const view = { players: [], self: { heroId: "r2-d2" }, opponent: null };
    expect(heroIdsForArt(view)).toEqual(["r2-d2"]);
  });

  it("returns [] without throwing when everything is empty", () => {
    expect(heroIdsForArt({ players: [], self: null, opponent: null })).toEqual([]);
    // self/opponent may also be omitted entirely.
    expect(heroIdsForArt({ players: [] })).toEqual([]);
  });

  it("re-fires: an empty-then-populated STATE yields a different, non-empty list", () => {
    const empty = heroIdsForArt({
      players: [],
      self: { heroId: "thrall" },
      opponent: null,
    });
    const populated = heroIdsForArt({
      players: [{ heroId: "thrall" }, { heroId: "king-kong" }],
      self: { heroId: "thrall" },
      opponent: { heroId: "king-kong" },
    });
    // useProCardArt keys its query on the sorted list, so a changed list re-fetches.
    expect(empty.slice().sort().join(",")).not.toBe(populated.slice().sort().join(","));
    expect(populated.length).toBe(2);
  });

  it("drops falsy hero ids from players[] and legacy seats", () => {
    expect(
      heroIdsForArt({
        players: [{ heroId: "" }, { heroId: undefined }, { heroId: "thrall" }],
      }).sort()
    ).toEqual(["thrall"]);
    expect(
      heroIdsForArt({ players: [], self: { heroId: "" }, opponent: { heroId: "thrall" } })
    ).toEqual(["thrall"]);
  });
});
