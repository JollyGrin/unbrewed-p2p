/**
 * The effect-initiated attack (issue #671 ↔ engine #463, protocol v32).
 *
 * Two claims worth pinning: a LINKED printed card is told apart from an ordinary
 * combat card and from a SYNTHETIC sub-attack purely by its instance id, and the
 * tag names the card when the catalog can (it can, because the engine registers
 * `HeroDef.linkedCards` into `GameContext.cards`, which is what the wire catalog
 * is built from).
 */
import { CardMeta } from "./protocol";
import { effectAttackTagFor, isLinkedCombatCard, LINKED_CARD_SUFFIX } from "./effectAttack";

const CATALOG: Record<string, CardMeta> = {
  "boba-fett/seismic-charge": { title: "Seismic Charge", type: "attack", value: 6, boost: 0 },
  "boba-fett/disintegration": { title: "Disintegration", type: "attack", value: 4, boost: 4 },
};

const SEISMIC = `boba-fett/seismic-charge${LINKED_CARD_SUFFIX}`;

describe("isLinkedCombatCard", () => {
  it("recognizes the instance the engine mints for an attackWith card", () => {
    expect(isLinkedCombatCard(SEISMIC)).toBe(true);
  });

  it("leaves an ordinary drawn card alone", () => {
    expect(isLinkedCombatCard("boba-fett/disintegration#3")).toBe(false);
  });

  it("leaves a SYNTHETIC sub-attack alone — that one has no CardDef at all", () => {
    // It gets the bespoke SubAttackFace tile instead; the two must never collide.
    expect(isLinkedCombatCard("sub-attack:f2")).toBe(false);
  });
});

describe("effectAttackTagFor", () => {
  it("tags a linked attack and names the card in the tooltip", () => {
    const tag = effectAttackTagFor(CATALOG, SEISMIC);
    expect(tag?.text).toBe("EFFECT ATTACK");
    expect(tag?.title).toContain("Seismic Charge");
    expect(tag?.title).toContain("No action was spent");
  });

  it("still tags when the catalog cannot name the card", () => {
    // A client that does not know the def should still explain the combat rather
    // than let it read as a declared attack that never happened.
    expect(effectAttackTagFor({}, SEISMIC)?.text).toBe("EFFECT ATTACK");
    expect(effectAttackTagFor(undefined, SEISMIC)?.title).toContain("A card effect");
  });

  it("does NOT tag an ordinary combat, a sub-attack, or an empty slot", () => {
    expect(effectAttackTagFor(CATALOG, "boba-fett/disintegration#3")).toBeNull();
    expect(effectAttackTagFor(CATALOG, "sub-attack:f2")).toBeNull();
    expect(effectAttackTagFor(CATALOG, null)).toBeNull();
    expect(effectAttackTagFor(CATALOG, undefined)).toBeNull();
  });
});
