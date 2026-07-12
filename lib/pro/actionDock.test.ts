import { cardAffordances, describeAction } from "./actionDock";
import { Action, CardMeta } from "./protocol";

// A minimal catalog so cardLabel prints a real "title (value/boost)" string.
const catalog: Record<string, CardMeta> = {
  "king-taranis/fireball": { title: "Fireball", type: "attack", value: 3, boost: 2 },
};

const nameOf = (id: string) => id; // DECLARE_ATTACK-only; unused by BOOST_MOVE.

describe("actionDock — BOOST_MOVE renders and emits generically", () => {
  // Acceptance criterion #2: a 3-seat game where the server offers a BOOST_MOVE
  // to the p3 viewer. The dock special-cases no seat, so the p3 action renders
  // its boost affordance and is forwarded VERBATIM — sendAction echoes p3 back.
  const p3Boost: Action = { type: "BOOST_MOVE", player: "p3", card: "king-taranis/fireball#1" };

  it("hand affordance labels the p3 boost and forwards the action unchanged", () => {
    // Mimics a 3-seat viewer's legalActions (p3 on the clock during its maneuver).
    const legalActions: Action[] = [
      { type: "MANEUVER", player: "p3" },
      p3Boost,
      { type: "END_MANEUVER", player: "p3" },
    ];

    const affordances = cardAffordances(legalActions, "king-taranis/fireball#1");

    expect(affordances).toHaveLength(1);
    expect(affordances[0].label).toBe("Boost move");
    // The exact object the dock hands to sendAction: same type/card AND seat p3.
    expect(affordances[0].action).toEqual({
      type: "BOOST_MOVE",
      player: "p3",
      card: "king-taranis/fireball#1",
    });
  });

  it("sidebar describeAction reads 'Boost move (discard …)' for the p3 seat", () => {
    // Player-agnostic: the label depends only on the discarded card, never the
    // seat, so a multiplayer boost reads identically to a duel boost.
    expect(describeAction(catalog, p3Boost, { nameOf })).toBe("Boost move (discard Fireball (3/2))");
  });

  it("offers no affordance for a card no server action carries", () => {
    expect(cardAffordances([p3Boost], "king-taranis/other#1")).toEqual([]);
  });
});
