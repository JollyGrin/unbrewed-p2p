import axios from "axios";
import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { loadProDeck, PRO_DECK_IDS } from "@/lib/proDecks";

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

  it("lists each remixed hero once: the -spice deck, not the original (#1437)", () => {
    for (const id of ["hollow-oak", "piper", "thetis", "taranis"]) {
      expect(PRO_DECK_IDS).not.toContain(id);
      expect(PRO_DECK_IDS).toContain(`${id}-spice`);
    }
  });

  it("still loads a hidden original by id", async () => {
    const get = jest
      .spyOn(axios, "get")
      .mockResolvedValue({ data: snapshot("piper") });
    try {
      const deck = await loadProDeck("piper");
      expect(deck?.name).toBe(snapshot("piper").name);
    } finally {
      get.mockRestore();
    }
  });
});
