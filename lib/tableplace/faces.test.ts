import { describe, expect, it } from "@jest/globals";
import type { DeckImportType } from "@/components/DeckPool/deck-import.type";
import hollowOak from "@/public/evergreen-decks/hollow-oak.json";
import gerry from "@/public/evergreen-decks/5jGPM.json";
import narrator from "@/public/evergreen-decks/5jBEXsA55e.json";
import {
  balancedFaces,
  faceJobs,
  FaceIndex,
  FACES_ORIGIN,
  loadFaceIndex,
  slug,
} from "./faces";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** The index render-faces.mjs would write for these decks. */
const indexFor = (...decks: [string, DeckImportType][]): FaceIndex => {
  const index: FaceIndex = { version: 1, decks: {} };
  for (const [dir, deck] of decks) {
    const entries = Object.fromEntries(
      faceJobs(deck).map((j) => [j.key, { path: `${dir}/${j.key}.webp`, hash: j.hash }]),
    );
    index.decks[deck.id] = entries;
    if (dir !== deck.id) index.decks[dir] = entries;
  }
  return index;
};

const oak = hollowOak as unknown as DeckImportType;
const gerryDeck = gerry as unknown as DeckImportType;
const index = indexFor(
  ["hollow-oak", oak],
  ["5jGPM", gerryDeck],
  ["5jBEXsA55e", narrator as unknown as DeckImportType],
);

describe("faceJobs", () => {
  it("lists every action card, the hero and the fielded sidekick", () => {
    const keys = faceJobs(oak).map((j) => j.key);
    expect(keys).toHaveLength(oak.deck_data.cards.length + 2);
    expect(keys).toContain("card-foxfire");
    expect(keys).toContain("hero");
    expect(keys).toContain("sidekick");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("adds rule cards and extra characters (#500)", () => {
    const keys = faceJobs(gerryDeck).map((j) => j.key);
    expect(keys).toEqual(expect.arrayContaining(["rule-1", "extra-1-hero"]));
  });

  it("keeps keys unique when two cards share a title", () => {
    const deck = clone(oak);
    deck.deck_data.cards.push({ ...deck.deck_data.cards[0] });
    const keys = faceJobs(deck).map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(`card-${slug(deck.deck_data.cards[0].title)}-2`);
  });

  it("skips a stub sidekick", () => {
    const deck = clone(oak);
    deck.deck_data.sidekick = { name: "Sidekick", quantity: 0, hp: null, isRanged: false, quote: "" };
    expect(faceJobs(deck).map((j) => j.key)).not.toContain("sidekick");
  });
});

describe("balancedFaces", () => {
  it("resolves every face of a balanced deck to an unbrewed.xyz url", () => {
    const faces = balancedFaces(index, oak);
    const foxfire = oak.deck_data.cards.find((c) => c.title === "Foxfire")!;
    expect(faces(foxfire)).toBe(`${FACES_ORIGIN}/tableplace-faces/hollow-oak/card-foxfire.webp`);
    expect(faces.hero()).toBe(`${FACES_ORIGIN}/tableplace-faces/hollow-oak/hero.webp`);
    expect(faces.sidekick()).toMatch(/hollow-oak\/sidekick\.webp$/);
    for (const card of oak.deck_data.cards) expect(faces(card)).not.toBeNull();
  });

  it("resolves a copy of a card, not just the same object", () => {
    const faces = balancedFaces(index, oak);
    expect(faces(clone(oak.deck_data.cards[3]))).not.toBeNull();
  });

  it("answers rule cards and extra characters", () => {
    const faces = balancedFaces(index, gerryDeck);
    expect(faces.rule(0)).toMatch(/5jGPM\/rule-1\.webp$/);
    expect(faces.extraCharacter(0, "hero")).toMatch(/5jGPM\/extra-1-hero\.webp$/);
    expect(faces.rule(9)).toBeNull();
  });

  it("finds a snapshot whose file name differs from its id", () => {
    const deck = narrator as unknown as DeckImportType;
    expect(deck.id).not.toBe("5jBEXsA55e");
    expect(balancedFaces(index, deck).hero()).toMatch(/^https:\/\/unbrewed\.xyz\//);
  });

  it("returns null for a deck that isn't balanced", () => {
    const deck = { ...clone(oak), id: "some-user-deck" };
    const faces = balancedFaces(index, deck);
    expect(faces(deck.deck_data.cards[0])).toBeNull();
    expect(faces.hero()).toBeNull();
  });

  it("returns null for an edited card under a balanced id", () => {
    const deck = clone(oak);
    deck.deck_data.cards[0].basicText += " Then draw a card.";
    deck.deck_data.hero.hp = 99;
    const faces = balancedFaces(index, deck);
    expect(faces(deck.deck_data.cards[0])).toBeNull();
    expect(faces(deck.deck_data.cards[1])).not.toBeNull();
    expect(faces.hero()).toBeNull();
  });

  it("returns null everywhere without an index", () => {
    const faces = balancedFaces(null, oak);
    expect(faces(oak.deck_data.cards[0])).toBeNull();
    expect(faces.sidekick()).toBeNull();
  });
});

describe("loadFaceIndex", () => {
  it("returns the index, or null when it is missing or malformed", async () => {
    const ok = (body: unknown) =>
      (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
    expect(await loadFaceIndex(ok(index))).toBe(index);
    expect(await loadFaceIndex(ok({ version: 2 }))).toBeNull();
    expect(
      await loadFaceIndex((async () => ({ ok: false })) as unknown as typeof fetch),
    ).toBeNull();
    expect(
      await loadFaceIndex((async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch),
    ).toBeNull();
  });
});
