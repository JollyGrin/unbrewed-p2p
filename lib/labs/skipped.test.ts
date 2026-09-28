import { describe, expect, it, jest } from "@jest/globals";
import dumbass from "./fixtures/set-by-slug.dumbass-brigade.json";
import lucy from "./fixtures/set-by-slug.lucy-piper.json";
import oz from "./fixtures/set-by-slug.oz-adventure.json";
import { fetchLinkedDeck } from "@/lib/deckLink";
import {
  LABS_ERROR_MESSAGES,
  LabsSetRow,
  buildLabsImport,
  detectLabsSkipped,
  fetchLabsImport,
  fetchLabsSet,
  labsImportedText,
  labsSkippedText,
} from ".";

// Real `rpc/set_by_slug` rows, fetched 2026-09-28.
const LUCY = (lucy as unknown as LabsSetRow[])[0];
const OZ = (oz as unknown as LabsSetRow[])[0];
const DUMBASS = (dumbass as unknown as LabsSetRow[])[0];
const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const ELLIOT = "char_0848bf26-989a-44f4-95c2-ce67373b146d";
const NIGHT_STAR = "char_ab6975bf-5c5a-461a-8d54-76252f2acc59";
const WITCH = "char_6edf73c1-e301-4623-9491-e069831c0316";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const json = (body: unknown) =>
  Promise.resolve({ ok: true, json: async () => body } as Response);
const labsFetch = (row: LabsSetRow, characterId: string) =>
  jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("gallery_characters")) return json([{ id: characterId, set_slug: row.slug, slug: row.slug }]);
    if (u.includes("rpc/set_by_slug")) return json([row]);
    return json([{ display_name: "Someone" }]);
  }) as unknown as typeof fetch;

describe("detectLabsSkipped", () => {
  it("counts what Lucy & Piper leave behind", () => {
    const skipped = detectLabsSkipped(LUCY.document.set, LUCY_ID);
    expect(skipped).toEqual([
      { kind: "dial", count: 2 },
      { kind: "piece", count: 3 },
      { kind: "figure", count: 2 },
      { kind: "map", count: 1 },
    ]);
    expect(labsSkippedText(skipped)).toBe("2 health dials, 3 game pieces, 2 figures, 1 map");
  });

  it("does not count another hero's pieces", () => {
    const set = DUMBASS.document.set;
    expect(detectLabsSkipped(set, ELLIOT)).toEqual([]);
    expect(detectLabsSkipped(set, NIGHT_STAR)).toEqual([{ kind: "piece", count: 3 }]);
  });

  it("ignores an empty map shell, in `map` and in `maps[]`", () => {
    expect(DUMBASS.document.set.maps).toHaveLength(1);
    expect(detectLabsSkipped(DUMBASS.document.set, ELLIOT).some((s) => s.kind === "map")).toBe(false);
    const oneEmpty = clone(LUCY.document.set);
    oneEmpty.map!.spaces = [];
    expect(detectLabsSkipped(oneEmpty, LUCY_ID).some((s) => s.kind === "map")).toBe(false);
    const inArray = clone(LUCY.document.set);
    inArray.maps = [inArray.map!];
    inArray.map = null;
    expect(detectLabsSkipped(inArray, LUCY_ID).find((s) => s.kind === "map")?.count).toBe(1);
  });

  it("counts Oz's initiative cards and threat track, not its blank figures", () => {
    const skipped = detectLabsSkipped(OZ.document.set, WITCH);
    expect(skipped).toEqual([
      { kind: "initiative", count: 8 },
      { kind: "threat", count: 1 },
    ]);
  });

  it("counts a deck kind only when it holds cards", () => {
    const set = clone(DUMBASS.document.set);
    set.decks.push({ id: "d_evt", kind: "event", ownerId: null });
    expect(detectLabsSkipped(set, ELLIOT)).toEqual([]);
    set.cards.push({ id: "c_evt", deckId: "d_evt", type: "event" });
    expect(detectLabsSkipped(set, ELLIOT)).toEqual([{ kind: "event", count: 1 }]);
  });
});

describe("what the import brings in", () => {
  it("says so in a line", () => {
    const { deck, skipped } = buildLabsImport({ row: LUCY }, LUCY_ID);
    expect(skipped).toHaveLength(4);
    expect(labsImportedText(deck)).toMatch(/^Lucy, 30 cards, hero card, deck back$/);
  });
});

describe("sets with no heroes", () => {
  it("refuses Oz Adventure from the panel path (set link)", async () => {
    await expect(fetchLabsSet(OZ.slug, labsFetch(OZ, WITCH))).rejects.toMatchObject({
      code: "no-heroes",
      message: LABS_ERROR_MESSAGES["no-heroes"],
    });
  });

  it("refuses Oz Adventure from the deep-link path, not 'choose-character'", async () => {
    await expect(fetchLabsImport(OZ.slug, labsFetch(OZ, WITCH))).rejects.toMatchObject({
      code: "no-heroes",
    });
    await expect(fetchLinkedDeck(`labs:${WITCH}`)).rejects.toBeDefined();
  });

  it("never imports a villain or minion as a hero deck", () => {
    for (const id of [WITCH, "char_ce0dbe4e-1b60-4f19-8017-545330360e21"]) {
      expect(() => buildLabsImport({ row: OZ }, id)).toThrow(LABS_ERROR_MESSAGES["no-heroes"]);
    }
  });

  it("says the same words in both places", () => {
    expect(LABS_ERROR_MESSAGES["no-heroes"]).toBe(
      "This is an Unmatched Adventures set (a villain and minions, no heroes). Unbrewed can't import Adventures sets yet.",
    );
  });
});

describe("skipped content never holds a deep link", () => {
  it("returns skipped with no unsupported features for The Night Star", async () => {
    const linked = await fetchLinkedDeck(`labs:${NIGHT_STAR}`, labsFetch(DUMBASS, NIGHT_STAR));
    expect(linked.skipped).toEqual([{ kind: "piece", count: 3 }]);
    expect(linked.unsupported).toEqual([]);
  });
});
