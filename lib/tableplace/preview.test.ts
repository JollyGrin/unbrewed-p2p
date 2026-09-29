import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import hollowOak from "@/public/evergreen-decks/hollow-oak.json";
import { composeTable } from "./composeTable";
import { faceJobs, type FaceIndex } from "./faces";
import { labsDeck } from "./fixtures/decks";
import { facesFor, plainSkipped, previewDeck } from "./preview";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const oak = () => clone(hollowOak) as unknown as DeckImportType;

/** The index render-faces.mjs would publish for these decks. */
const indexFor = (...decks: DeckImportType[]): FaceIndex => ({
  version: 1,
  decks: Object.fromEntries(
    decks.map((d) => [
      d.id,
      Object.fromEntries(
        faceJobs(d).map((j) => [
          j.key,
          { path: `${d.id}/${j.key}.webp`, hash: j.hash },
        ]),
      ),
    ]),
  ),
});

const MAP = {
  imageUrl: "https://unbrewed.xyz/maps/legacy-the-mended-drum.webp",
  width: 1145,
  height: 857,
};

describe("previewDeck", () => {
  it("refuses a balanced deck kindly before its faces are published", () => {
    const p = previewDeck(oak(), null);
    expect(p.refused).toBe(
      "Card images for this deck aren't published yet. Balanced decks get theirs when this feature ships.",
    );
    expect(p.skipped).toEqual([]);
    // still shows what it would put down
    expect(p.cards).toBeGreaterThan(0);
    expect(p.dials).toEqual([{ name: "The Hollow Oak", value: 16 }]);
  });

  it("takes a balanced deck once the face index lists it", () => {
    const deck = oak();
    const p = previewDeck(deck, indexFor(deck));
    expect(p.refused).toBeNull();
    expect(p.skipped).toEqual([]);
    expect(p.hero).toEqual({
      name: deck.deck_data.hero.name,
      hp: deck.deck_data.hero.hp,
    });
    expect(p.dials[0]).toEqual({
      name: deck.deck_data.hero.name,
      value: deck.deck_data.hero.hp,
    });
    expect(p.cards).toBe(
      deck.deck_data.cards
        .filter((c) => !c.isCharacterCard)
        .reduce((n, c) => n + c.quantity, 0),
    );
  });

  it("refuses a balanced deck that was edited after its faces were rendered", () => {
    const deck = oak();
    const index = indexFor(deck);
    deck.deck_data.cards[0].basicText += " (edited)";
    const p = previewDeck(deck, index);
    expect(p.refused).toMatch(/^1 card has no finished card image/);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0]).toMatch(/^“.+” has no finished card image$/);
  });

  it("takes a Labs deck on its own card renders, with no index at all", () => {
    const p = previewDeck(labsDeck(), null);
    expect(p.refused).toBeNull();
    expect(p.cards).toBeGreaterThan(0);
    expect(p.hero?.name).toBeTruthy();
  });

  it("composes Hollow Oak vs a Labs deck once the index is published", () => {
    const a = oak();
    const b = labsDeck();
    const index = indexFor(a);
    const { body, skipped } = composeTable({
      seats: [a, b],
      faces: [facesFor(a, index), facesFor(b, index)],
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
