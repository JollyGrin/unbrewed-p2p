import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import {
  HERO_CARD_TOKEN_WIDTH,
  applyHeroCardFlag,
  heroCardToken,
  seedHeroCardTokens,
} from "./heroCardTokens";
import { cardTokenHeight } from "./position.type";

const card = (over: Partial<DeckImportCardType> = {}): DeckImportCardType =>
  ({
    title: "Hero",
    quantity: 1,
    imageUrl: "https://x/sheet.png",
    ...over,
  }) as DeckImportCardType;

const sheetCard = (index: number, title = `Card ${index}`) =>
  card({
    title,
    isCharacterCard: true,
    cardImage: { url: "https://x/sheet.png", cols: 10, rows: 7, index },
  });

describe("heroCardToken", () => {
  it("sizes the token at the 63:88 card ratio, not a square disc", () => {
    const token = heroCardToken(sheetCard(3))!;

    expect(token.size).toBe(HERO_CARD_TOKEN_WIDTH);
    expect(token.h).toBe(cardTokenHeight(HERO_CARD_TOKEN_WIDTH));
    expect(token.h).toBeGreaterThan(token.size!);
  });

  it("carries the sprite-sheet crop so the token is one card, not the sheet", () => {
    expect(heroCardToken(sheetCard(42))).toMatchObject({
      imageUrl: "https://x/sheet.png",
      sheet: { cols: 10, rows: 7, index: 42 },
    });
  });

  it("is a plain image token — never a card token", () => {
    const token = heroCardToken(sheetCard(1))!;

    expect(token).not.toHaveProperty("card");
    expect(token).not.toHaveProperty("faceDown");
  });

  it("uses a whole-image url with no crop when the deck is not a sheet", () => {
    const token = heroCardToken(
      card({ cardImage: { url: "https://x/hero.png" } }),
    )!;

    expect(token.imageUrl).toBe("https://x/hero.png");
    expect(token.sheet).toBeUndefined();
  });

  it("skips a card with no art at all", () => {
    expect(heroCardToken(card({ imageUrl: undefined }))).toBeNull();
  });
});

describe("applyHeroCardFlag", () => {
  it("seeds the token when the card is flagged on", () => {
    const next = applyHeroCardFlag([], sheetCard(5), true);

    expect(next).toHaveLength(1);
    expect(next[0].sheet?.index).toBe(5);
  });

  it("removes the seeded token when the card is unflagged", () => {
    const seeded = applyHeroCardFlag([], sheetCard(5), true);

    expect(applyHeroCardFlag(seeded, sheetCard(5), false)).toEqual([]);
  });

  it("never duplicates on a repeat flag-on", () => {
    let saved = applyHeroCardFlag([], sheetCard(5), true);
    saved = applyHeroCardFlag(saved, sheetCard(5), true);
    saved = applyHeroCardFlag(saved, sheetCard(5), true);

    expect(saved).toHaveLength(1);
  });

  it("tells sheet cells apart — same url, different card", () => {
    let saved = applyHeroCardFlag([], sheetCard(5), true);
    saved = applyHeroCardFlag(saved, sheetCard(6), true);

    expect(saved.map((t) => t.sheet?.index)).toEqual([5, 6]);

    saved = applyHeroCardFlag(saved, sheetCard(5), false);
    expect(saved.map((t) => t.sheet?.index)).toEqual([6]);
  });

  it("leaves a hand-added token alone", () => {
    const mine = { imageUrl: "https://x/marker.png", size: 72 };
    const saved = applyHeroCardFlag([mine], sheetCard(5), true);

    expect(saved[0]).toBe(mine);
    expect(saved).toHaveLength(2);
  });
});

describe("seedHeroCardTokens", () => {
  it("seeds one token per flagged card, in deck order", () => {
    const seeded = seedHeroCardTokens([
      sheetCard(1, "hero"),
      card({ title: "Feint", cardImage: { url: "https://x/sheet.png", cols: 10, rows: 7, index: 2 } }),
      sheetCard(3, "rules"),
    ]);

    expect(seeded.map((t) => t.sheet?.index)).toEqual([1, 3]);
  });

  it("spawns nothing for a deck with no flagged cards", () => {
    expect(seedHeroCardTokens([card()])).toEqual([]);
  });

  it("collapses duplicate references to the same card face", () => {
    expect(seedHeroCardTokens([sheetCard(1), sheetCard(1)])).toHaveLength(1);
  });
});
