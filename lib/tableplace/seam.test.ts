import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckToPlayerPack } from "./deckToPack";
import { fullFakeFaces } from "./fixtures/decks";

const DIR = path.join(process.cwd(), "public/evergreen-decks");
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json");

const load = (f: string) =>
  JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as DeckImportType;

describe("converter x face resolver seam", () => {
  it("finds the evergreen decks", () =>
    expect(files.length).toBeGreaterThan(0));

  // A resolver that answers every face is all a runtime solution has to be.
  it.each(files)(
    "%s converts with a resolver that answers every face",
    (file) => {
      const r = deckToPlayerPack(load(file), { faces: fullFakeFaces });
      expect(r.skipped).toEqual([]);
      expect(r.pack).not.toBeNull();
    },
  );

  it("refuses a deck whose resolver leaves a card unanswered", () => {
    const deck = load("hollow-oak.json");
    const target = deck.deck_data.cards.find((c) => !c.isCharacterCard)!;
    const faces = Object.assign(
      (c: typeof target) => (c === target ? null : fullFakeFaces(c)),
      { ...fullFakeFaces },
    );
    const r = deckToPlayerPack(deck, { faces });
    expect(r.pack).toBeNull();
    expect(r.skipped).toContain(`${target.title}: no finished face`);
  });
});
