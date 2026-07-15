import { cardAffordances, describeAction, soleAction } from "./actionDock";
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

describe("actionDock — v17 battlefield items", () => {
  it("labels USE_SCHEME_ITEM with the item's label from the space", () => {
    const use: Action = { type: "USE_SCHEME_ITEM", player: "p1", space: "s4" };
    expect(
      describeAction(catalog, use, { nameOf, itemLabelForSpace: (sp) => (sp === "s4" ? "Fire Bomb" : undefined) })
    ).toBe("Use Fire Bomb");
    // No resolver → a graceful generic fallback (never a bare "undefined").
    expect(describeAction(catalog, use, { nameOf })).toBe("Use item");
  });

  it("surfaces plain + attach commit variants as two labeled affordances", () => {
    const card = "king-taranis/fireball#1";
    const legalActions: Action[] = [
      { type: "COMMIT_ATTACK_CARD", player: "p1", card },
      { type: "COMMIT_ATTACK_CARD", player: "p1", card, attachItem: true },
    ];
    const affordances = cardAffordances(legalActions, card, { label: "Sword", value: 2 });
    expect(affordances.map((a) => a.label)).toEqual(["Attack with", "Attack with + Sword (+2)"]);
    // The attach variant forwards attachItem:true verbatim to the server.
    expect(affordances[1].action).toMatchObject({ type: "COMMIT_ATTACK_CARD", attachItem: true });
  });

  it("labels a defense attach variant too", () => {
    const card = "king-taranis/fireball#1";
    const affordances = cardAffordances(
      [{ type: "COMMIT_DEFENSE_CARD", player: "p2", card, attachItem: true }],
      card,
      { label: "Shield", value: 1 }
    );
    expect(affordances[0].label).toBe("Defend with + Shield (+1)");
  });

  it("without an attach-item context the attach variant keeps the plain verb", () => {
    const card = "king-taranis/fireball#1";
    const affordances = cardAffordances(
      [{ type: "COMMIT_ATTACK_CARD", player: "p1", card, attachItem: true }],
      card
    );
    expect(affordances[0].label).toBe("Attack with");
  });
});


describe("actionDock — soleAction (spacebar eligibility, issue #353)", () => {
  it("returns the sole action when only Maneuver is legal", () => {
    const maneuver: Action = { type: "MANEUVER", player: "p1" };
    expect(soleAction([maneuver], null)).toBe(maneuver);
  });

  it("returns DECLINE_DEFENSE even when FORFEIT is also legal", () => {
    // Defending with no defendable cards: DECLINE_DEFENSE is the only real option,
    // FORFEIT rides alongside but never counts toward the option total.
    const decline: Action = { type: "DECLINE_DEFENSE", player: "p1" };
    const forfeit: Action = { type: "FORFEIT", player: "p1" };
    expect(soleAction([decline, forfeit], null)).toBe(decline);
    expect(soleAction([forfeit, decline], null)).toBe(decline);
  });

  it("returns the sole action when only End maneuver is legal", () => {
    const end: Action = { type: "END_MANEUVER", player: "p1" };
    expect(soleAction([end], null)).toBe(end);
  });

  it("returns null with two or more dock options", () => {
    const legalActions: Action[] = [
      { type: "MANEUVER", player: "p1" },
      { type: "END_MANEUVER", player: "p1" },
    ];
    expect(soleAction(legalActions, null)).toBeNull();
  });

  it("returns null while a prompt is open even if one action is legal", () => {
    const maneuver: Action = { type: "MANEUVER", player: "p1" };
    expect(soleAction([maneuver], { kind: "something" })).toBeNull();
  });

  it("returns null when a board affordance sits alongside the dock action", () => {
    // MOVE_FIGHTER renders as a clickable space, not a dock button, so a state with
    // both a move and a maneuver is genuinely multi-option — spacebar stays inert.
    const legalActions: Action[] = [
      { type: "MOVE_FIGHTER", player: "p1", fighter: "king-kong/kong", path: ["s1", "s2"] },
      { type: "MANEUVER", player: "p1" },
    ];
    expect(soleAction(legalActions, null)).toBeNull();
  });

  it("returns null when the lone non-forfeit action is itself a board/prompt action", () => {
    // A single MOVE_FIGHTER is not a dock action — nothing for the sidebar button.
    const move: Action = { type: "MOVE_FIGHTER", player: "p1", fighter: "king-kong/kong", path: ["s1", "s2"] };
    expect(soleAction([move], null)).toBeNull();
    expect(soleAction([move, { type: "FORFEIT", player: "p1" }], null)).toBeNull();
  });

  it("returns null for an empty action list (spectating / not your turn)", () => {
    expect(soleAction([], null)).toBeNull();
    expect(soleAction([{ type: "FORFEIT", player: "p1" }], null)).toBeNull();
  });
});

describe("actionDock — Malfurion shapeshift", () => {
  it("labels maneuver and Omen shapeshift actions distinctly and forwards them unchanged", () => {
    const maneuverShift: Action = { type: "SHAPESHIFT", player: "p1", form: "Bear", via: "MANEUVER" };
    const omenShift: Action = { type: "SHAPESHIFT", player: "p1", form: "Moonkin", via: "OMEN" };

    expect(describeAction(catalog, maneuverShift, { nameOf })).toBe("Shapeshift to Bear");
    expect(describeAction(catalog, omenShift, { nameOf })).toBe("Omen: Shapeshift to Moonkin");
    expect(maneuverShift).toEqual({ type: "SHAPESHIFT", player: "p1", form: "Bear", via: "MANEUVER" });
    expect(omenShift).toEqual({ type: "SHAPESHIFT", player: "p1", form: "Moonkin", via: "OMEN" });
  });
});
