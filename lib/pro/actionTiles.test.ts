import { describe, expect, test } from "@jest/globals";
import { abilityActionsOf, actionTilesFor, tileKindOf } from "./actionTiles";
import type { Action } from "./protocol";

const a = (type: string, extra: object = {}) => ({ type, player: "p1", ...extra }) as unknown as Action;

describe("tileKindOf", () => {
  test("sorts the three core turn actions into their tiles and leaves the rest alone", () => {
    expect(tileKindOf(a("MANEUVER"))).toBe("maneuver");
    expect(tileKindOf(a("SCHEME", { card: "c1" }))).toBe("scheme");
    expect(tileKindOf(a("DECLARE_ATTACK", { attacker: "f1", target: "f2" }))).toBe("attack");
    expect(tileKindOf(a("USE_SCHEME_ITEM", { space: "s1" }))).toBeNull();
    expect(tileKindOf(a("END_MANEUVER"))).toBeNull();
  });
});

describe("actionTilesFor", () => {
  test("offers no tiles when none of the core turn actions is legal", () => {
    expect(actionTilesFor([a("END_MANEUVER"), a("BOOST_MOVE", { card: "c1" })])).toEqual([]);
  });

  test("always lists all three tiles once any core action is legal, in turn order", () => {
    const tiles = actionTilesFor([a("DECLARE_ATTACK", { attacker: "f1", target: "f2" }), a("MANEUVER")]);

    expect(tiles.map((t) => [t.kind, t.actions.length])).toEqual([
      ["maneuver", 1],
      ["scheme", 0],
      ["attack", 1],
    ]);
  });

  test("groups several legal choices of one kind onto the same tile", () => {
    const schemes = [a("SCHEME", { card: "c1" }), a("SCHEME", { card: "c2" })];

    expect(actionTilesFor([a("MANEUVER"), ...schemes])[1].actions).toEqual(schemes);
  });
});

// Protocol v41 (engine #1080, p2p #1693): a free activated hero ability.
describe("USE_ABILITY — a bonus button, never an action tile", () => {
  const reward2 = a("USE_ABILITY", { ability: "reward-2", label: "Reward 2", card: "pomni/reward-2" });
  const reward3 = a("USE_ABILITY", { ability: "reward-3", label: "Reward 3", card: "pomni/reward-3" });

  test("is not one of the three tiles", () => {
    expect(tileKindOf(reward2)).toBeNull();
  });

  test("leaves the three tiles exactly as they were", () => {
    const tiles = actionTilesFor([a("MANEUVER"), a("SCHEME", { card: "c1" }), reward2, reward3]);

    expect(tiles.map((t) => [t.kind, t.actions.length])).toEqual([
      ["maneuver", 1],
      ["scheme", 1],
      ["attack", 0],
    ]);
    expect(tiles.flatMap((t) => t.actions)).not.toContain(reward2);
  });

  test("does not conjure tiles on its own", () => {
    expect(actionTilesFor([reward2])).toEqual([]);
  });

  test("abilityActionsOf picks the offered abilities, same objects, server order", () => {
    const picked = abilityActionsOf([a("MANEUVER"), reward3, a("SCHEME", { card: "c1" }), reward2]);

    expect(picked).toHaveLength(2);
    expect(picked[0]).toBe(reward3);
    expect(picked[1]).toBe(reward2);
    expect(abilityActionsOf([a("MANEUVER")])).toEqual([]);
  });
});
