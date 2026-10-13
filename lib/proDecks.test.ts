import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { PRO_DECK_IDS } from "@/lib/proDecks";

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
});
