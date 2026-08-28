import { itemBadgeTitle, itemEffectText, itemKindLabel } from "./itemInfo";
import { ProMapItem } from "./protocol";

// Item open information (p2p #731): every surface that names a battlefield item
// (board badge + popover, action dock, map preview) derives its text from these
// pure functions, so they are asserted directly — and through each caller.
describe("itemEffectText", () => {
  it("describes a combat item from its printed value", () => {
    expect(itemEffectText({ id: "i", kind: "combat", label: "Sword", value: 2 })).toBe(
      "+2 to a combat card played from this space"
    );
  });
  it("treats a missing combat value as +0 rather than printing 'undefined'", () => {
    expect(itemEffectText({ id: "i", kind: "combat", label: "Rubble" })).toBe(
      "+0 to a combat card played from this space"
    );
  });
  it("returns a scheme item's authored effect text", () => {
    expect(
      itemEffectText({ id: "i", kind: "scheme", label: "Wedding Cake", text: "Recover 2 health." })
    ).toBe("Recover 2 health.");
  });
  it("returns undefined for maps written before the field existed", () => {
    expect(itemEffectText({ id: "i", kind: "scheme", label: "Bomb", ops: [] as never })).toBeUndefined();
  });
  it("ignores a whitespace-only text rather than returning blank strings", () => {
    expect(itemEffectText({ id: "i", kind: "scheme", label: "Bomb", text: "   " })).toBeUndefined();
  });
});

// itemBadgeTitle is the one-line form a player reads on the badge hover, in the
// map preview list — and historically the ONLY place a scheme item's effect was
// printed (p2p #693), so its fallback behavior is pinned.
describe("itemBadgeTitle", () => {
  it("describes a combat item from its printed value", () => {
    expect(itemBadgeTitle({ id: "i", kind: "combat", label: "Sword", value: 2 })).toBe(
      "Sword — +2 to a combat card played from this space"
    );
  });
  it("appends a scheme item's effect text", () => {
    expect(
      itemBadgeTitle({ id: "i", kind: "scheme", label: "Wedding Gifts", text: "Return a card from your discard pile to your hand." })
    ).toBe("Wedding Gifts — Return a card from your discard pile to your hand.");
  });
  it("falls back to the bare label for maps written before the field existed", () => {
    expect(itemBadgeTitle({ id: "i", kind: "scheme", label: "Bomb", ops: [] as never })).toBe("Bomb");
  });
  it("ignores a whitespace-only text rather than printing a dangling dash", () => {
    expect(itemBadgeTitle({ id: "i", kind: "scheme", label: "Bomb", text: "   " })).toBe("Bomb");
  });
});

describe("itemKindLabel", () => {
  it("names both kinds in plain English", () => {
    expect(itemKindLabel("combat")).toBe("Combat item");
    expect(itemKindLabel("scheme")).toBe("Scheme item");
  });
});

// A compile-time shape check: the derivations consume the whole item, so a
// ProMapItem from a real map JSON flows through without adaptation.
it("accepts a Wedding Crashers item verbatim", () => {
  const cake: ProMapItem = {
    id: "item2",
    kind: "scheme",
    label: "Wedding Cake",
    ops: [{ op: "heal", target: "SELF", amount: 2 }],
    text: "Recover 2 health.",
  };
  expect(itemBadgeTitle(cake)).toBe("Wedding Cake — Recover 2 health.");
});
