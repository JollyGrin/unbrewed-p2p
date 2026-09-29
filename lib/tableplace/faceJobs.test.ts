import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import hollowOak from "@/public/evergreen-decks/hollow-oak.json";
import gerry from "@/public/evergreen-decks/5jGPM.json";
import { faceFingerprint, faceJobs, slug } from "./faceJobs";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const oak = hollowOak as unknown as DeckImportType;
const gerryDeck = gerry as unknown as DeckImportType;

describe("faceJobs", () => {
  it("lists every action card, the hero and the fielded sidekick", () => {
    const keys = faceJobs(oak).map((j) => j.key);
    expect(keys).toHaveLength(oak.deck_data.cards.length + 2);
    expect(keys).toContain("card-foxfire");
    expect(keys).toContain("hero");
    expect(keys).toContain("sidekick");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds rule cards and extra characters (#500)", () => {
    const keys = faceJobs(gerryDeck).map((j) => j.key);
    expect(keys).toEqual(expect.arrayContaining(["rule-1", "extra-1-hero"]));
  });

  it("keeps keys unique when two cards share a title", () => {
    const deck = clone(oak);
    deck.deck_data.cards.push({ ...deck.deck_data.cards[0] });
    const keys = faceJobs(deck).map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(`card-${slug(deck.deck_data.cards[0].title)}-2`);
  });

  it("skips a stub sidekick", () => {
    const deck = clone(oak);
    deck.deck_data.sidekick = {
      name: "Sidekick",
      quantity: 0,
      hp: null,
      isRanged: false,
      quote: "",
    };
    expect(faceJobs(deck).map((j) => j.key)).not.toContain("sidekick");
  });
});

describe("faceFingerprint", () => {
  it("is stable, and changes when a drawn field changes", () => {
    const card = clone(oak.deck_data.cards[0]);
    const before = faceFingerprint("card", card);
    expect(faceFingerprint("card", clone(card))).toBe(before);
    card.basicText += " (edited)";
    expect(faceFingerprint("card", card)).not.toBe(before);
  });
});
