import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { loadProDeck, PRO_DECK_IDS } from "@/lib/proDecks";
import { EVERGREEN_DECK_IDS, fetchDeckById, PRO_ONLY_DECK_IDS, ProOnlyDeckError, proOnlyMessage } from "@/lib/evergreenDecks";
import { failureReason } from "@/lib/deckAnalytics";

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

// Harry Dresden (#1718): the engine builds his 30 from the sidekick picked at setup; the
// snapshot prints all 34. No hand-dealt surface may get it.
describe("Pro-only decks stay out of every hand-dealt surface", () => {
  it("leaves Harry Dresden out of the roster the sandbox, /table and /connect pick from", () => {
    expect(PRO_ONLY_DECK_IDS.has("harry-dresden")).toBe(true);
    expect(EVERGREEN_DECK_IDS.has("harry-dresden")).toBe(true);
    expect(PRO_DECK_IDS).not.toContain("harry-dresden");
    expect(PRO_DECK_IDS.length).toBe(EVERGREEN_DECK_IDS.size - PRO_ONLY_DECK_IDS.size);
  });

  it("never loads it, by id or through the star pointer", async () => {
    await expect(loadProDeck("harry-dresden")).resolves.toBeUndefined();
  });

  it("refuses it at the one deal-path fetch, with a player-facing reason", async () => {
    await expect(fetchDeckById("harry-dresden")).rejects.toBeInstanceOf(ProOnlyDeckError);
    await expect(fetchDeckById("harry-dresden")).rejects.toThrow("can only be played in Pro");
  });

  it("says WHY to the player and to analytics, never 'network' / 'try again'", async () => {
    const err = await fetchDeckById("harry-dresden").catch((e: unknown) => e);
    expect(proOnlyMessage(err)).toBe("harry-dresden can only be played in Pro: its sidekick is chosen when the game starts");
    expect(failureReason(err)).toBe("pro_only");
    // every other failure keeps its generic toast
    expect(proOnlyMessage(new Error("boom"))).toBeNull();
  });

  it("every Pro-only deck is a real evergreen deck with a sidekick choice", () => {
    for (const id of PRO_ONLY_DECK_IDS) {
      expect(EVERGREEN_DECK_IDS.has(id)).toBe(true);
      expect(snapshot(id).deck_data.sidekickOptions?.length).toBeGreaterThan(1);
    }
  });
});
