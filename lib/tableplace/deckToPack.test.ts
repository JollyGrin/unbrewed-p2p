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
  it.each(Object.keys(FIXTURES))("%s: unique codes, placed pieces", (name) => {
    const r = convert(name);
    expect(r.skipped).toEqual([]);
    for (const d of r.pack!.decks!) {
      const codes = d.cards.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
    const placedPieces = r.placements.filter((p) => p.kind === "piece");
    expect(placedPieces).toHaveLength(r.pack!.pieces?.length ?? 0);
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
  it("adds an HP counter per fighter", () => {
    expect(r.pack!.pieces!.map((p) => [p.kind, p.name, p.maxValue])).toEqual([
      ["counter", "The Hollow Oak HP", expect.any(Number)],
      ["counter", "The Ember Fox HP", 6],
    ]);
  });
  it("places hero and sidekick for duel-2p, but not for unmatched-2p", () => {
    expect(
      r.placements.filter((p) => p.kind === "deck").map((p: any) => p.slot),
    ).toEqual(["hero", "sidekick"]);
    const { deck, faces } = FIXTURES["hollow-oak"];
    const u = deckToPlayerPack(deck, { faces, layout: "unmatched-2p" });
    expect(u.placements.every((p) => p.kind === "piece")).toBe(true);
  });
  it("mirrors seat 1 across the table", () => {
    const p = convert("hollow-oak", 1).placements[0] as any;
    expect(p.rotation).toBe(180);
    expect(p.position[2]).toBeLessThan(0);
  });
  it("refuses the whole deck when a face is missing", () => {
    const { deck } = FIXTURES["hollow-oak"];
    const bad = deckToPlayerPack(deck, {
      faces: (c) => (c.title === "Foxfire" ? null : fakeFaces(c)),
    });
    expect(bad.pack).toBeNull();
    expect(bad.placements).toEqual([]);
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

describe("sidekick with quantity > 1 and extra characters", () => {
  const r = convert("larry-extra-characters");
  it("gives one HP counter per fielded sidekick", () => {
    const names = r.pack!.pieces!.map((p) => p.name);
    expect(names.filter((n) => /^Larry \d HP$/.test(n))).toHaveLength(4);
  });
  it("puts extra characters in the rules slot", () => {
    const titles = slot(r, "rules")!.cards.map((c) => c.name.toLowerCase());
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

describe("saved tokens", () => {
  const r = deckToPlayerPack(tokenDeck(), { faces: fakeFaces });
  const pieces = r.pack!.pieces!;
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
    const badge = r.placements.find((p) => p.kind === "piece" && p.value === 3);
    expect(badge).toBeDefined();
    // the hero-linked badge duplicates the fighter counter, so it adds none
    expect(pieces.filter((p) => p.name === "Skull Crack counter")).toHaveLength(
      0,
    );
  });
  it("keeps every piece on the felt", () => {
    for (const p of r.placements.filter((p) => p.kind === "piece") as any[]) {
      expect(Math.abs(p.position[0])).toBeLessThanOrEqual(30);
      expect(Math.abs(p.position[1])).toBeLessThanOrEqual(15);
    }
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
      { imageUrl: "https://x/m.webp", ratio: 4, scale: 15 },
    ]);
  });
  it("fits a tall map to the felt height", () => {
    expect(
      mapToTablePack({ imageUrl: "u", width: 500, height: 1000 }).overlays![0]
        .scale,
    ).toBe(30);
  });
});
