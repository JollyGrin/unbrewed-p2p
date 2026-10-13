import fs from "fs";
import path from "path";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import { isImportBlocked } from "@/lib/decks/blockedAuthors";
import { PRO_DECK_IDS } from "@/lib/proDecks";
import { artDirOf, probeProFaces } from "@/lib/proFaces";
import { previewDeck, previewOf } from "@/lib/tableplace/preview";

// The static host, as the repo's public/ folder.
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    head: async (url: string) => {
      const file = path.join(process.cwd(), "public", url);
      if (fs.existsSync(file)) return { status: 200 };
      throw new Error("404");
    },
  },
}));

const snapshot = (id: string): DeckImportType =>
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), "public/evergreen-decks", `${id}.json`),
      "utf8",
    ),
  );

/** What /table lists with an empty bag: the page's own rule, over the roster. */
const tableList = async () => {
  const listed: DeckImportType[] = [];
  for (const id of PRO_DECK_IDS) {
    const deck = snapshot(id);
    const faces = await probeProFaces(deck);
    const preview = faces ? previewDeck(deck, faces) : previewOf(deck);
    if (!preview.refused) listed.push(deck);
  }
  return listed;
};

describe("Pro hero/sidekick faces for /table (issue #1421)", () => {
  it("lists Cecil Palmer and Jason Voorhees, and not a template deck like Clone Troopers", async () => {
    const names = (await tableList()).map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(["Cecil Palmer", "Jason Voorhees"]),
    );
    expect(names).not.toContain("Clone Troopers");
    expect(names).not.toContain("Cairne Bloodhoof"); // no hero face on disk
  });

  it("only lists decks whose action cards all carry a card image, and no Jowee", async () => {
    const listed = await tableList();
    expect(listed.length).toBeGreaterThan(0);
    for (const deck of listed) {
      expect(artDirOf(deck)).not.toBeNull();
      expect(isImportBlocked(deck)).toBe(false);
    }
  });

  it("never probes a template-rendered deck (imageUrl only)", async () => {
    const clones = snapshot("DJQB");
    expect(artDirOf(clones)).toBeNull();
    expect(await probeProFaces(clones)).toBeNull();
  });

  it("answers the hero and the sidekick from the art folder", async () => {
    const faces = await probeProFaces(snapshot("37z5"));
    expect(faces?.hero?.()).toBe("/evergreen-decks/art/37z5/hero-card.webp");
    expect(faces?.sidekick?.()).toBe(
      "/evergreen-decks/art/37z5/sidekick-khoshekh.webp",
    );
  });
});
