import { describe, expect, it } from "@jest/globals";
import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { deckToPlayerPack } from "./deckToPack";
import {
  balancedFaces,
  FACES_DIR,
  FACES_ORIGIN,
  faceJobs,
  FaceIndex,
} from "./faces";

const DIR = path.join(process.cwd(), "public/evergreen-decks");
const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "manifest.json");

const load = (f: string) =>
  JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as DeckImportType;

const perfectIndex = (deck: DeckImportType): FaceIndex => ({
  version: 1,
  decks: {
    [deck.id]: Object.fromEntries(
      faceJobs(deck).map((j) => [
        j.key,
        { path: `${deck.id}/${j.key}.webp`, hash: j.hash },
      ]),
    ),
  },
});

const packFaces = (
  pack: NonNullable<ReturnType<typeof deckToPlayerPack>["pack"]>,
) => (pack.decks ?? []).flatMap((d) => d.cards.map((c) => c.face));

describe("converter x face lookup seam", () => {
  it("finds the evergreen decks", () =>
    expect(files.length).toBeGreaterThan(0));

  it.each(files)("%s converts with a perfect index", (file) => {
    const deck = load(file);
    const index = perfectIndex(deck);
    const r = deckToPlayerPack(deck, { faces: balancedFaces(index, deck) });
    expect(r.skipped).toEqual([]);
    expect(r.pack).not.toBeNull();
    const urls = new Set(
      Object.values(index.decks[deck.id]).map(
        (e) => `${FACES_ORIGIN}/${FACES_DIR}/${e.path}`,
      ),
    );
    for (const face of packFaces(r.pack!)) {
      // a card that carries its own finished image never goes through the index
      const own = JSON.stringify(deck).includes(
        JSON.stringify(face).slice(1, -1),
      );
      expect(urls.has(face) || own).toBe(true);
    }
  });

  it("refuses a deck whose card text was edited", () => {
    const deck = load("hollow-oak.json");
    const index = perfectIndex(deck);
    const edited = JSON.parse(JSON.stringify(deck)) as DeckImportType;
    const target = edited.deck_data.cards.find((c) => !c.isCharacterCard)!;
    target.basicText = `${target.basicText} (edited)`;
    const r = deckToPlayerPack(edited, { faces: balancedFaces(index, edited) });
    expect(r.pack).toBeNull();
    expect(r.skipped).toContain(`${target.title}: no finished face`);
  });

  it("refuses an edited hero ability", () => {
    const deck = load("hollow-oak.json");
    const index = perfectIndex(deck);
    const edited = JSON.parse(JSON.stringify(deck)) as DeckImportType;
    edited.deck_data.hero.specialAbility += " edited";
    const r = deckToPlayerPack(edited, { faces: balancedFaces(index, edited) });
    expect(r.pack).toBeNull();
  });
});
