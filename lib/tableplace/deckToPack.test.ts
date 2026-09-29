import { describe, expect, it } from "@jest/globals";
import { deckToPlayerPack, mapToTablePack, tokenPiece } from ".";
import { FIXTURES, fakeFaces, labsDeck, tokenDeck } from "./fixtures/decks";

const convert = (name: keyof typeof FIXTURES, seat: 0 | 1 = 0) => {
  const { deck, faces } = FIXTURES[name];
  return deckToPlayerPack(deck, { faces, seat });
};
const slot = (r: ReturnType<typeof convert>, s: string) =>
  r.pack!.decks!.find((d) => d.slot === s);

describe("every fixture", () => {
  it.each(Object.keys(FIXTURES))("%s: unique codes, no coordinates", (name) => {
    const r = convert(name);
    expect(r.skipped).toEqual([]);
    for (const d of r.pack!.decks!) {
      const codes = d.cards.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
    expect(r.pack!.pieces).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('"position"');
    expect(r.pack!.tbpp).toBe(1);
    expect(r.pack!.scope).toBe("player");
  });

  it("gives each seat a distinct pack id", () => {
    expect(convert("hollow-oak", 0).pack!.id).not.toBe(
      convert("hollow-oak", 1).pack!.id,
    );
  });
});

describe("balanced deck (hollow-oak)", () => {
  const r = convert("hollow-oak");
  it("expands quantity into uniquely-coded cards", () => {
    const deck = slot(r, "deck")!;
    expect(deck.cards.map((c) => c.code).slice(0, 3)).toEqual([
      "old-growth",
      "old-growth-2",
      "old-growth-3",
    ]);
    expect(deck.back).toMatch(/cardback\.webp$/);
  });
  it("emits an empty discard, a hero, a sidekick", () => {
    expect(slot(r, "discard")!.cards).toEqual([]);
    expect(slot(r, "hero")!.cards).toHaveLength(1);
    expect(slot(r, "sidekick")!.cards).toHaveLength(1);
  });
  it("adds an HP counter and a figure per fighter", () => {
    expect(
      r.pieces.map((p) => [p.role, p.piece.kind, p.piece.name, p.value]),
    ).toEqual([
      ["hp", "counter", "The Hollow Oak HP", expect.any(Number)],
      ["fighter", "token", "The Hollow Oak", undefined],
      ["hp", "counter", "The Ember Fox HP", 6],
      ["fighter", "token", "The Ember Fox", undefined],
    ]);
  });
  it("gives a figure its absolute token art", () => {
    const hero = r.pieces.find((p) => p.role === "fighter")!;
    expect(hero.piece.imageUrl).toMatch(
      /^https:\/\/unbrewed\.xyz\/evergreen-decks\/art\//,
    );
  });
  it("refuses the whole deck when a face is missing", () => {
    const { deck } = FIXTURES["hollow-oak"];
    const bad = deckToPlayerPack(deck, {
      faces: (c) => (c.title === "Foxfire" ? null : fakeFaces(c)),
    });
    expect(bad.pack).toBeNull();
    expect(bad.pieces).toEqual([]);
    expect(bad.skipped).toEqual(["Foxfire: no finished face"]);
  });
});

describe("Labs deck", () => {
  it("passes full-art renders through without asking the resolver", () => {
    const r = deckToPlayerPack(labsDeck(), {
      faces: () => {
        throw new Error("resolver must not be called");
      },
    });
    expect(r.skipped).toEqual([]);
    const hero = slot(r, "hero")!.cards[0];
    expect(hero.face).toMatch(/^https:\/\//);
    expect(slot(r, "deck")!.cards.length).toBeGreaterThan(10);
  });
});

describe("Labs deck with a sidekick but no sidekick card", () => {
  const r = convert("labs-elliot");
  it("converts, noting the missing card instead of refusing", () => {
    expect(r.skipped).toEqual([]);
    expect(r.pack).not.toBeNull();
    expect(slot(r, "sidekick")).toBeUndefined();
    expect(r.notes).toEqual([
      expect.stringMatching(/THE AUDIENCE has no separate card/),
    ]);
  });
  it("keeps the sidekick HP counters and figures", () => {
    const hp = r.pieces.filter((p) => p.role === "hp");
    const figs = r.pieces.filter(
      (p) => p.role === "fighter" && p.fighter === "sidekick",
    );
    expect(hp.filter((p) => /THE AUDIENCE/.test(p.piece.name))).toHaveLength(5);
    expect(figs).toHaveLength(5);
  });
  it("still refuses when the hero face is missing", () => {
    const { deck } = FIXTURES["hollow-oak"];
    const bad = deckToPlayerPack(deck, {
      faces: (c) => (c.isCharacterCard ? null : fakeFaces(c)),
    });
    expect(bad.pack).toBeNull();
    expect(bad.skipped.length).toBeGreaterThan(0);
  });
});

describe("sidekick with quantity > 1 and extra characters", () => {
  const r = convert("larry-extra-characters");
  it("gives one HP counter per fielded sidekick", () => {
    const names = r.pieces.map((p) => p.piece.name);
    expect(names.filter((n) => /^Larry \d HP$/.test(n))).toHaveLength(4);
  });
  it("puts extra characters in their own extras pile", () => {
    const titles = slot(r, "extras")!.cards.map((c) => c.name.toLowerCase());
    expect(titles).toContain("larry");
  });
  it("omits slots that are empty", () => {
    const { deck, faces } = FIXTURES["hollow-oak"];
    const solo = JSON.parse(JSON.stringify(deck));
    solo.deck_data.sidekick.quantity = 0;
    const s = deckToPlayerPack(solo, { faces });
    expect(slot(s, "sidekick")).toBeUndefined();
    expect(slot(s, "rules")).toBeUndefined();
  });
});

describe("relative art", () => {
  it("makes every face, back and image absolute", () => {
    const { deck, faces } = FIXTURES["larry-extra-characters"];
    const rel = JSON.parse(JSON.stringify(deck));
    rel.deck_data.appearance.cardbackUrl =
      "/evergreen-decks/art/5jGPM/cardback.webp";
    rel.savedTokens = [{ imageUrl: "/tokens/a.png", size: 72 }];
    const r = deckToPlayerPack(rel, {
      faces: (c) => `/faces/${encodeURIComponent(c.title)}.webp`,
    });
    const refs = [
      ...r.pack!.decks!.flatMap((d) => [d.back, ...d.cards.map((c) => c.face)]),
      ...r.pieces.map((p) => p.piece.imageUrl),
    ].filter((u): u is string => !!u);
    expect(refs.length).toBeGreaterThan(10);
    for (const u of refs) expect(u).toMatch(/^(https:\/\/|sheet:)/);
    expect(r.pack!.decks![0].back).toBe(
      "https://unbrewed.xyz/evergreen-decks/art/5jGPM/cardback.webp",
    );
    void faces;
  });
});

describe("saved tokens", () => {
  const r = deckToPlayerPack(tokenDeck(), { faces: fakeFaces });
  const pieces = r.pieces.map((p) => p.piece);
  it("turns a sheet crop into a sheet: ref", () => {
    const t = pieces.find((p) => p.imageUrl?.startsWith("sheet:"))!;
    expect(JSON.parse(t.imageUrl!.slice(6))).toEqual({
      url: "https://the-unmatched.club/sheets/tokens.png",
      cols: 4,
      rows: 2,
      index: 5,
    });
  });
  it("keeps plain image urls and turns detached badges into counters", () => {
    expect(
      pieces.some(
        (p) => p.imageUrl === "https://unbrewed.xyz/tokens/flame.png",
      ),
    ).toBe(true);
    const badge = r.pieces.find((p) => p.role === "token-counter");
    expect(badge?.value).toBe(3);
    // the hero-linked badge duplicates the fighter counter, so it adds none
    expect(pieces.filter((p) => p.name === "Skull Crack counter")).toHaveLength(
      0,
    );
  });
  it("writes states with imageUrl mirroring states[0] for multi-face tokens", () => {
    expect(tokenPiece("Brazier", ["a", "b"])).toEqual({
      kind: "token",
      name: "Brazier",
      imageUrl: "a",
      states: [{ face: "a" }, { face: "b" }],
    });
  });
});

describe("mapToTablePack", () => {
  it("fits a wide map to the felt width", () => {
    const p = mapToTablePack({
      imageUrl: "https://x/m.webp",
      width: 2000,
      height: 500,
    });
    expect(p.scope).toBe("table");
    expect(p.decks).toEqual([]);
    expect(p.overlays).toEqual([
      { imageUrl: "https://x/m.webp", ratio: 4, scale: 6.5 },
    ]);
  });
  it("caps a squarer map at 16 high, clear of the front rows", () => {
    expect(
      mapToTablePack({ imageUrl: "u", width: 500, height: 1000 }).overlays![0]
        .scale,
    ).toBe(16);
  });
});
