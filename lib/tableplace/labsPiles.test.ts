import { describe, expect, it } from "@jest/globals";
import lucy from "@/lib/labs/fixtures/set-by-slug.lucy-piper.json";
import spy from "@/lib/labs/fixtures/set-by-slug.spy-vs-spy.json";
import lucySave from "@/lib/labs/fixtures/tts-save.lucy-piper.json";
import { buildLabsImport, parseLabsTtsSave } from "@/lib/labs";
import type { LabsSetRow } from "@/lib/labs";
import { deckToPlayerPack } from "./deckToPack";
import { fakeFaces } from "./fixtures/decks";

const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const SPY_ID = "char_8cda56e0-e3d2-4362-aa8e-18380ed39f7d";

const lucyDeck = () =>
  buildLabsImport(
    {
      row: (lucy as unknown as LabsSetRow[])[0],
      ttsModels: parseLabsTtsSave(lucySave),
    },
    LUCY_ID,
  ).deck;
const spyDeck = () =>
  buildLabsImport({ row: (spy as unknown as LabsSetRow[])[0] }, SPY_ID).deck;

// the real Labs resolver answer on /table: nothing
const noFaces = () => null;
const piles = (r: ReturnType<typeof deckToPlayerPack>) =>
  Object.fromEntries(
    r.pack!.decks!.map((d) => [d.slot, d.cards.map((c) => c.name)]),
  );

describe("Labs piles on the real payloads", () => {
  it("Lucy & Piper: Piper is in Extras, no Rules pile, no notes", () => {
    const r = deckToPlayerPack(lucyDeck(), { faces: noFaces });
    expect(r.skipped).toEqual([]);
    expect(r.notes).toEqual([]);
    const p = piles(r);
    expect(p.hero).toEqual(["Lucy"]);
    expect(p.extras).toEqual(["Piper"]);
    expect(p).not.toHaveProperty("rules");
    expect(p).not.toHaveProperty("sidekick");
    expect(p).toHaveProperty("discard", []);
  });

  it("Lucy's pieces hold no token that duplicates a pile card", () => {
    const deck = lucyDeck();
    const r = deckToPlayerPack(deck, { faces: noFaces });
    const cardFaces = new Set(
      deck.deck_data.cards
        .filter((c) => c.isCharacterCard)
        .map((c) => c.cardImage!.url),
    );
    expect(cardFaces.size).toBeGreaterThan(0);
    for (const t of r.pieces.filter((p) => p.role === "token")) {
      expect(cardFaces.has(t.piece.imageUrl ?? "")).toBe(false);
    }
    // the sandbox keeps them
    expect(deck.savedTokens?.length).toBeGreaterThan(
      r.pieces.filter((p) => p.role === "token").length,
    );
  });

  it("Spy vs Spy: White Spy is in Extras", () => {
    const r = deckToPlayerPack(spyDeck(), { faces: noFaces });
    expect(r.notes).toEqual([]);
    expect(piles(r).extras).toEqual(["White Spy"]);
  });

  it("a deck with real rule cards still gets its Rules pile", () => {
    const deck = lucyDeck();
    deck.deck_data.cards.push({
      ...deck.deck_data.cards.find((c) => c.isCharacterCard)!,
      title: "Special Rule",
      cardImage: { url: "https://example.com/rule.png" },
    } as never);
    const r = deckToPlayerPack(deck, { faces: fakeFaces });
    const p = piles(r);
    expect(p.rules).toEqual(["Special Rule"]);
    expect(p.extras).toEqual(["Piper"]);
  });
});
