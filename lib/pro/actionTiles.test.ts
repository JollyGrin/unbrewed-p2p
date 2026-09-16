import { describe, expect, test } from "@jest/globals";
import { actionTilesFor, tileKindOf } from "./actionTiles";
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
