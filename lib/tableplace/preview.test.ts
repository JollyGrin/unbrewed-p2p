import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import hollowOak from "@/public/evergreen-decks/hollow-oak.json";
import { composeTable } from "./composeTable";
import {
  elliotDeck,
  fullFakeFaces,
  labsDeck,
  ruleCardsDeck,
} from "./fixtures/decks";
import {
  deckMetaLine,
  NO_TABLE_IMAGES,
  plainSkipped,
  previewDeck,
  previewOf,
  refusedChip,
  seatLines,
} from "./preview";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const oak = () => clone(hollowOak) as unknown as DeckImportType;

const MAP = {
  imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
  width: 1145,
  height: 857,
};

describe("previewDeck", () => {
  it("counts every rule card and extra character as a reference card", () => {
    const extras = previewDeck(ruleCardsDeck(0), fullFakeFaces).referenceCards;
    expect(extras).toBeGreaterThan(0);
    expect(previewDeck(ruleCardsDeck(1), fullFakeFaces).referenceCards).toBe(
      extras + 1,
    );
    expect(previewDeck(ruleCardsDeck(3), fullFakeFaces).referenceCards).toBe(
      extras + 3,
    );
    // past what the card row holds, and with no resolver at all
    expect(previewDeck(ruleCardsDeck(6)).referenceCards).toBe(extras + 6);
  });

  it("gives a deck with no table images one plain line, not a card list", () => {
    const p = previewDeck(oak());
    expect(p.refused).toBe(
      "This deck's cards don't have table images yet. Bring it in as a Tabletop Simulator export.",
    );
    expect(p.refused).toBe(NO_TABLE_IMAGES);
    expect(p.skipped).toEqual([]);
    // still shows what it would put down
    expect(p.cards).toBeGreaterThan(0);
    expect(p.dials).toEqual([
      { name: "The Hollow Oak", value: 16 },
      { name: "The Ember Fox", value: 6 },
    ]);
  });

  it("takes a deck once a resolver answers its faces", () => {
    const deck = oak();
    const p = previewDeck(deck, fullFakeFaces);
    expect(p.refused).toBeNull();
    expect(p.skipped).toEqual([]);
    expect(p.hero).toEqual({
      name: deck.deck_data.hero.name,
      hp: deck.deck_data.hero.hp,
    });
    expect(p.cards).toBe(
      deck.deck_data.cards
        .filter((c) => !c.isCharacterCard)
        .reduce((n, c) => n + c.quantity, 0),
    );
  });

  it("takes a Labs deck on its own card renders, with no resolver at all", () => {
    const p = previewDeck(labsDeck());
    expect(p.refused).toBeNull();
    expect(p.cards).toBeGreaterThan(0);
    expect(p.hero?.name).toBeTruthy();
  });

  it("composes a resolved deck vs a Labs deck", () => {
    const a = oak();
    const b = labsDeck();
    const { body, skipped } = composeTable({
      seats: [a, b],
      faces: [fullFakeFaces, () => null],
      map: MAP,
    });
    expect(skipped.filter((s) => /no finished face/.test(s))).toEqual([]);
    expect(body?.packs).toHaveLength(3);
    expect(body).not.toHaveProperty("lobby");
  });
});

describe("plainSkipped", () => {
  it("names the seat and the card", () => {
    expect(plainSkipped("Seat 1: Branch Out: no finished face")).toBe(
      "Their deck: “Branch Out” has no finished card image",
    );
    expect(
      plainSkipped(
        'Seat 0: token "Fire Shield" left off (table.place places at most 100 things)',
      ),
    ).toBe(
      "Your deck: “Fire Shield” stays off the table (table.place places at most 100 things)",
    );
  });
});

describe("missing faces (issue #1118)", () => {
  /** A Labs deck with the finished image taken off its first `n` action cards. */
  const missing = (n: number) => {
    const deck = labsDeck();
    deck.deck_data.cards
      .filter((c) => !c.isCharacterCard)
      .slice(0, n)
      .forEach((c) => delete c.cardImage);
    return previewDeck(deck);
  };

  it("counts nothing missing on a deck that can go on the table", () => {
    const p = previewDeck(labsDeck());
    expect(p.missingFaces).toBe(0);
    expect(p.finishedFaces).toBeGreaterThan(0);
  });

  it("counts each card without a finished image once, however many copies", () => {
    const deck = labsDeck();
    const card = deck.deck_data.cards.find(
      (c) => !c.isCharacterCard && c.quantity > 1,
    )!;
    delete card.cardImage;
    const p = previewDeck(deck);
    expect(p.missingFaces).toBe(1);
    expect(p.refused).toBe(NO_TABLE_IMAGES);
    expect(refusedChip(p)).toBe("1 card has no image");
  });

  it("says how many cards are missing when only some are", () => {
    expect(refusedChip(missing(1))).toBe("1 card has no image");
    const two = missing(2);
    expect(two.missingFaces).toBe(2);
    expect(two.finishedFaces).toBeGreaterThan(0);
    expect(refusedChip(two)).toBe("2 cards have no image");
  });

  it("says a deck has no table images when no card has one", () => {
    const p = previewDeck(oak());
    expect(p.finishedFaces).toBe(0);
    // every card, plus the hero and sidekick cards
    expect(p.missingFaces).toBeGreaterThan(
      oak().deck_data.cards.filter((c) => !c.isCharacterCard).length,
    );
    expect(refusedChip(p)).toBe("No table images");
  });

  it("counts nothing missing once a resolver answers the faces", () => {
    expect(previewDeck(oak(), fullFakeFaces).missingFaces).toBe(0);
  });
});

describe("deck lines", () => {
  it("gives a tile its hero HP and sidekick, and a seat its counts", () => {
    const p = previewDeck(elliotDeck());
    expect(deckMetaLine(p)).toBe("12 HP · THE AUDIENCE");
    expect(seatLines(p)).toEqual([
      "12 HP · 5 × THE AUDIENCE 1 HP",
      "30 cards · 6 HP dials",
    ]);
  });

  it("leaves the sidekick out when there is none, and counts one dial as one", () => {
    const p = previewDeck(labsDeck());
    expect(deckMetaLine(p)).toBe("16 HP");
    expect(seatLines(p)).toEqual(["16 HP", "30 cards · 1 HP dial"]);
  });

  it("names a lone sidekick without a count", () => {
    expect(seatLines(previewDeck(oak()))[0]).toBe("16 HP · The Ember Fox 6 HP");
  });
});

describe("previewOf", () => {
  it("converts a deck once and hands the same preview back", () => {
    const deck = labsDeck();
    const first = previewOf(deck);
    expect(previewOf(deck)).toBe(first);
    expect(first).toEqual(previewDeck(deck));
    expect(previewOf(labsDeck())).not.toBe(first);
  });
});
