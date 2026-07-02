import { describe, expect, it } from "@jest/globals";
import { buildImageDeck, parseTtsDeck } from "./parse-tts";
import { makeDeck, newPool } from "@/components/DeckPool/PoolFns";

const SHEET = {
  FaceURL: "http://cloud-3.steamusercontent.com/ugc/123/FACE/",
  BackURL: "http://cloud-3.steamusercontent.com/ugc/123/BACK/",
  NumWidth: 5,
  NumHeight: 3,
};

const ttsSavedObject = {
  SaveName: "",
  ObjectStates: [
    {
      Name: "DeckCustom",
      Nickname: "Boba Fett",
      CustomDeck: { "1": SHEET },
      DeckIDs: [100, 100, 101, 102],
      ContainedObjects: [
        { Name: "Card", Nickname: "Durasteel Armor", CardID: 100 },
        { Name: "Card", Nickname: "Durasteel Armor", CardID: 100 },
        { Name: "Card", Nickname: "Bounty: It's Just Business", CardID: 101 },
        { Name: "Card", Nickname: "", CardID: 102 },
      ],
    },
  ],
};

describe("parseTtsDeck", () => {
  it("parses a saved object into sprite-sheet cards with quantities", () => {
    const result = parseTtsDeck(ttsSavedObject);

    expect(result.name).toBe("Boba Fett");
    expect(result.cards).toHaveLength(3);

    const armor = result.cards.find((c) => c.title === "Durasteel Armor");
    expect(armor?.quantity).toBe(2);
    expect(armor?.image).toEqual({
      url: "https://cloud-3.steamusercontent.com/ugc/123/FACE/",
      cols: 5,
      rows: 3,
      index: 0,
    });

    const bounty = result.cards.find((c) => c.title.startsWith("Bounty"));
    expect(bounty?.image.index).toBe(1);

    // untitled card gets a fallback name
    expect(result.cards.some((c) => c.title.startsWith("Card "))).toBe(true);
    // card back captured + https upgraded
    expect(result.cardbackUrl).toBe(
      "https://cloud-3.steamusercontent.com/ugc/123/BACK/",
    );
  });

  it("accepts a bare deck object without ObjectStates", () => {
    const result = parseTtsDeck(ttsSavedObject.ObjectStates[0]);
    expect(result.cards).toHaveLength(3);
  });

  it("uses DeckIDs when ContainedObjects are missing", () => {
    const result = parseTtsDeck({
      Name: "DeckCustom",
      CustomDeck: { "2": SHEET },
      DeckIDs: [203, 203, 204],
    });
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].quantity).toBe(2);
    expect(result.cards[0].image.index).toBe(3);
  });

  it("warns on local file urls and non-deck json", () => {
    const local = parseTtsDeck({
      Name: "DeckCustom",
      CustomDeck: { "1": { ...SHEET, FaceURL: "file:///C:/sheet.png" } },
      DeckIDs: [100],
    });
    expect(local.warnings.some((w) => w.includes("local file"))).toBe(true);

    const invalid = parseTtsDeck({ hello: "world" });
    expect(invalid.cards).toHaveLength(0);
    expect(invalid.warnings.length).toBeGreaterThan(0);
  });
});

describe("buildImageDeck", () => {
  it("wraps parsed cards in a playable DeckImportType", () => {
    const parsed = parseTtsDeck(ttsSavedObject);
    const deck = buildImageDeck({
      name: "Boba Fett",
      hp: 16,
      move: 2,
      cards: parsed.cards,
      cardbackUrl: parsed.cardbackUrl,
    });

    expect(deck.deck_data.cards).toHaveLength(3);
    expect(deck.deck_data.cards[0].cardImage?.url).toContain("https://");
    // per-card back art so face-down commits survive the pool sync
    expect(deck.deck_data.cards[0].cardBackUrl).toContain("BACK");
    expect(deck.deck_data.hero.hp).toBe(16);
    expect(deck.deck_data.appearance.cardbackUrl).toContain("BACK");
    // quantity survives so makeDeck expands correctly
    const total = deck.deck_data.cards.reduce((n, c) => n + c.quantity, 0);
    expect(total).toBe(4);
  });

  it("keeps standalone hero cards out of the shuffled draw deck", () => {
    const parsed = parseTtsDeck({
      ObjectStates: [
        ttsSavedObject.ObjectStates[0],
        // hero card sitting loose on the TTS table
        {
          Name: "CardCustom",
          Nickname: "Boba Fett (Hero)",
          CardID: 104,
          CustomDeck: { "1": SHEET },
        },
      ],
    });

    const hero = parsed.cards.find((c) => c.title === "Boba Fett (Hero)");
    expect(hero?.isCharacterCard).toBe(true);

    const deck = buildImageDeck({ name: "Boba", cards: parsed.cards });
    const pool = makeDeck(newPool(deck));
    // 4 playable cards expanded; hero card excluded from the pile
    expect(pool.deck).toHaveLength(4);
    expect(pool.deck?.some((c) => c.title === "Boba Fett (Hero)")).toBe(false);
    // but it stays visible in the deck's card list
    expect(deck.deck_data.cards.some((c) => c.isCharacterCard)).toBe(true);
  });
});
