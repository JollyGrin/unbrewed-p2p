import { describe, expect, it } from "@jest/globals";
import { bagDeckLabel, opponentDeckLink } from "./opponent";

const CHAR = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";

describe("opponentDeckLink", () => {
  it.each([
    ["https://unmatched.cards/decks/lQz7", "lQz7"],
    ["unmatched.cards/decks/6rDz/versions/WvW4T24Nq", "6rDz"],
    ["  pk1x ", "pk1x"],
    [`labs:${CHAR}`, `labs:${CHAR}`],
    [`labs-${CHAR}`, `labs:${CHAR}`],
    [
      `https://unmatchedlabs.com/shared/some-set?character=${CHAR}`,
      `labs:${CHAR}`,
    ],
    ["", null],
    ["labs:66521662a3f5ff4e7a23b429", null],
    ["https://example.com/deck", null],
  ])("%s → %s", (raw, id) => expect(opponentDeckLink(raw)).toBe(id));
});

describe("bagDeckLabel", () => {
  const mk = (name: string, hero?: string) =>
    ({ name, deck_data: { hero: hero ? { name: hero } : undefined } }) as never;
  it("adds the hero only when the name doesn't say it", () => {
    expect(bagDeckLabel(mk("Alice Deck", "Alice"))).toBe("Alice Deck");
    expect(bagDeckLabel(mk("Budget Brawler", "Alice"))).toBe(
      "Budget Brawler (Alice)",
    );
    expect(bagDeckLabel(mk("Plain"))).toBe("Plain");
  });
});
