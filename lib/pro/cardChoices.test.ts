import { describe, expect, test } from "@jest/globals";
import { cardChoiceGroups } from "./cardChoices";
import type { Action } from "./protocol";

const a = (type: string, extra: object = {}) => ({ type, player: "p1", ...extra }) as unknown as Action;

describe("cardChoiceGroups", () => {
  test("ignores actions that do not name a card to choose", () => {
    expect(cardChoiceGroups([a("MANEUVER"), a("END_MANEUVER"), a("SCHEME", { card: "c1" })])).toEqual([]);
  });

  test("groups card choices by kind, one entry per card, in the order offered", () => {
    const boostA = a("BOOST_MOVE", { card: "c1" });
    const boostB = a("BOOST_MOVE", { card: "c2" });

    expect(cardChoiceGroups([a("END_MANEUVER"), boostA, boostB])).toEqual([
      { type: "BOOST_MOVE", title: "Boost your move", cards: [
        { card: "c1", actions: [boostA] },
        { card: "c2", actions: [boostB] },
      ] },
    ]);
  });

  test("keeps both variants of one card together (face-down and face-up commit)", () => {
    const down = a("COMMIT_ATTACK_CARD", { card: "c7" });
    const up = a("COMMIT_ATTACK_CARD", { card: "c7", faceUp: true });

    expect(cardChoiceGroups([down, up])[0].cards).toEqual([{ card: "c7", actions: [down, up] }]);
  });

  test("keeps the plain and the item-attach commit of one defense card together, in the order offered (#841)", () => {
    // The picker renders one confirm button per action, so BOTH must survive the
    // grouping — and it's describeAction's job to make them read differently.
    const plain = a("COMMIT_DEFENSE_CARD", { card: "c3" });
    const withItem = a("COMMIT_DEFENSE_CARD", { card: "c3", attachItem: true });
    const other = a("COMMIT_DEFENSE_CARD", { card: "c4" });

    expect(cardChoiceGroups([plain, withItem, other])).toEqual([
      { type: "COMMIT_DEFENSE_CARD", title: "Choose your defense card", cards: [
        { card: "c3", actions: [plain, withItem] },
        { card: "c4", actions: [other] },
      ] },
    ]);
  });
});
