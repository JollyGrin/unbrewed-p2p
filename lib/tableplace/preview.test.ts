import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import hollowOak from "@/public/evergreen-decks/hollow-oak.json";
import { composeTable } from "./composeTable";
import { fullFakeFaces, labsDeck } from "./fixtures/decks";
import { NO_TABLE_IMAGES, plainSkipped, previewDeck } from "./preview";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const oak = () => clone(hollowOak) as unknown as DeckImportType;

const MAP = {
  imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
  width: 1145,
  height: 857,
};

describe("previewDeck", () => {
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
