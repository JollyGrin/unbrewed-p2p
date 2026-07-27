import { cardAffordances, describeAction, dockRows, soleAction } from "./actionDock";
import { Action, CardMeta } from "./protocol";

// A minimal catalog so cardLabel prints a real "title (value/boost)" string.
const catalog: Record<string, CardMeta> = {
  "king-taranis/fireball": { title: "Fireball", type: "attack", value: 3, boost: 2 },
  // A boostless scheme — the fallback path for the "Boost +X" label.
  "king-taranis/war-drums": { title: "War Drums", type: "scheme", value: null, boost: null },
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

  it("sidebar describeAction reads 'Boost +X with <Title>' for the p3 seat", () => {
    // Player-agnostic: the label depends only on the discarded card, never the
    // seat, so a multiplayer boost reads identically to a duel boost.
    expect(describeAction(catalog, p3Boost, { nameOf })).toBe("Boost +2 with Fireball");
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

describe("actionDock — boost labels (issue #514)", () => {
  const boostOf = (card: string): Action => ({ type: "BOOST_MOVE", player: "p1", card });

  it("leads with the boost value and names the card plainly", () => {
    // What a maneuvering player actually needs: how far does this card carry me.
    expect(describeAction(catalog, boostOf("king-taranis/fireball#1"), { nameOf })).toBe(
      "Boost +2 with Fireball"
    );
  });

  it("falls back to the discard wording when the card has no printed boost", () => {
    // Never "Boost +null": a boostless card keeps the original sentence.
    expect(describeAction(catalog, boostOf("king-taranis/war-drums#1"), { nameOf })).toBe(
      "Boost move (discard War Drums (scheme))"
    );
  });

  it("falls back for a card missing from the catalog entirely", () => {
    expect(describeAction(catalog, boostOf("king-taranis/unknown#1"), { nameOf })).toBe(
      "Boost move (discard unknown)"
    );
  });
});

describe("actionDock — dockRows ordering, dividers, hotkeys (issue #514)", () => {
  const maneuver: Action = { type: "MANEUVER", player: "p1" };
  const endManeuver: Action = { type: "END_MANEUVER", player: "p1" };
  const boostA: Action = { type: "BOOST_MOVE", player: "p1", card: "king-taranis/fireball#1" };
  const boostB: Action = { type: "BOOST_MOVE", player: "p1", card: "king-taranis/fireball#2" };
  const attackA: Action = {
    type: "DECLARE_ATTACK",
    player: "p1",
    attacker: "king-taranis/king",
    target: "king-kong/kong",
  };
  const attackB: Action = {
    type: "DECLARE_ATTACK",
    player: "p1",
    attacker: "king-taranis/raptor-1",
    target: "king-kong/kong",
  };
  const scheme: Action = { type: "SCHEME", player: "p1", card: "king-taranis/war-drums#1" };
  const useItem: Action = { type: "USE_SCHEME_ITEM", player: "p1", space: "s4" };

  it("puts End maneuver above the boost rows, with one divider between them", () => {
    // The maneuver sub-state: the server offers END_MANEUVER alongside every
    // boostable hand card, and the way OUT should never be buried in the list.
    const rows = dockRows([boostA, endManeuver, boostB]);
    expect(rows.map((r) => r.action)).toEqual([endManeuver, boostA, boostB]);
    expect(rows.map((r) => r.dividerBefore)).toEqual([false, true, false]);
  });

  it("puts attacks above schemes on the choose-action state, maneuver on top", () => {
    const rows = dockRows([scheme, attackA, maneuver, useItem, attackB]);
    expect(rows.map((r) => r.action)).toEqual([maneuver, attackA, attackB, scheme, useItem]);
    // One divider per group boundary: maneuver | attacks | schemes.
    expect(rows.map((r) => r.dividerBefore)).toEqual([false, true, false, true, false]);
  });

  it("numbers rows 1..N in RENDERED order, so the chip fires its own row", () => {
    const rows = dockRows([scheme, attackA, maneuver]);
    expect(rows.map((r) => [r.hotkey, r.action.type])).toEqual([
      [1, "MANEUVER"],
      [2, "DECLARE_ATTACK"],
      [3, "SCHEME"],
    ]);
  });

  it("leaves a lone row unnumbered — that case is the spacebar's (#353)", () => {
    expect(dockRows([maneuver])).toEqual([{ action: maneuver, hotkey: null, dividerBefore: false }]);
    expect(dockRows([])).toEqual([]);
  });

  it("stops handing out chips after the 9th row", () => {
    const many = Array.from({ length: 11 }, (_, i): Action => ({
      type: "SCHEME",
      player: "p1",
      card: `king-taranis/war-drums#${i}`,
    }));
    const rows = dockRows(many);
    expect(rows.map((r) => r.hotkey)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null, null]);
  });

  it("keeps the server's order within a group and forwards actions unchanged", () => {
    // Stable within a band: same-name sidekick attacks stay in the order the
    // server enumerated them, which is what the #161 badge numbers follow.
    const rows = dockRows([attackB, attackA]);
    expect(rows.map((r) => r.action)).toEqual([attackB, attackA]);
    expect(rows[0].action).toBe(attackB); // same object reference — sendAction echoes it verbatim
  });

  it("drops nothing: an unrecognized dock action still renders, last", () => {
    const discard: Action = { type: "DISCARD_TO_LIMIT", player: "p1", card: "king-taranis/fireball#1" };
    const rows = dockRows([discard, maneuver]);
    expect(rows.map((r) => r.action)).toEqual([maneuver, discard]);
    expect(rows.map((r) => r.dividerBefore)).toEqual([false, true]);
  });
});

describe("actionDock — Malfurion shapeshift", () => {
  it("labels maneuver and Omen shapeshift actions distinctly and forwards them unchanged", () => {
    const nightElfShift: Action = { type: "SHAPESHIFT", player: "p1", form: "Human", via: "MANEUVER" };
    const maneuverShift: Action = { type: "SHAPESHIFT", player: "p1", form: "Bear", via: "MANEUVER" };
    const omenShift: Action = { type: "SHAPESHIFT", player: "p1", form: "Moonkin", via: "OMEN" };

    expect(describeAction(catalog, nightElfShift, { nameOf })).toBe("Shapeshift to Night Elf");
    expect(describeAction(catalog, maneuverShift, { nameOf })).toBe("Shapeshift to Bear");
    expect(describeAction(catalog, omenShift, { nameOf })).toBe("Omen: Shapeshift to Moonkin");
    expect(nightElfShift).toEqual({ type: "SHAPESHIFT", player: "p1", form: "Human", via: "MANEUVER" });
    expect(maneuverShift).toEqual({ type: "SHAPESHIFT", player: "p1", form: "Bear", via: "MANEUVER" });
    expect(omenShift).toEqual({ type: "SHAPESHIFT", player: "p1", form: "Moonkin", via: "OMEN" });
  });
});
