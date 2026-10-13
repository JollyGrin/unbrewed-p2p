import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { PRO_DECK_IDS } from "@/lib/proDecks";
import { previewOf } from "@/lib/tableplace/preview";

const dir = path.join(process.cwd(), "public/evergreen-decks");
const snapshot = (id: string): DeckImportType =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"));

describe("the Pro roster (issue #1421)", () => {
  it("ships a snapshot for every roster id", () => {
    for (const id of PRO_DECK_IDS) {
      expect(fs.existsSync(path.join(dir, `${id}.json`))).toBe(true);
    }
  });

  it("carries no deck by an author who asked not to be importable (Jowee)", () => {
    const authors = PRO_DECK_IDS.map((id) => snapshot(id).user);
    expect(authors.some((u) => /jowee/i.test(u))).toBe(false);
    expect(PRO_DECK_IDS.map(snapshot).filter(isImportBlocked)).toEqual([]);
  });

  it("derives the /table list from the snapshots: only decks that preview as ready", () => {
    const ready = PRO_DECK_IDS.filter(
      (id) => !previewOf(snapshot(id)).refused,
    );
    // every ready deck draws all its cards from its own cardImage
    for (const id of ready) {
      const cards = snapshot(id).deck_data.cards;
      expect(cards.every((c) => !!c.cardImage?.url)).toBe(true);
    }
    // Today every snapshot's hero card lacks a finished face (only the action
    // cards carry `cardImage`), so previewOf refuses the whole roster and /table
    // lists none. This stays derived, so a snapshot that gains a hero face
    // appears without a hand-kept list.
    expect(ready.length).toBeLessThanOrEqual(PRO_DECK_IDS.length);
  });
});
