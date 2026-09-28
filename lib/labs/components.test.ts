import { describe, expect, it, jest } from "@jest/globals";
import lucy from "./fixtures/set-by-slug.lucy-piper.json";
import pink from "./fixtures/set-by-slug.pink-panther.json";
import spyVsSpy from "./fixtures/set-by-slug.spy-vs-spy.json";
import lucySave from "./fixtures/tts-save.lucy-piper.json";
import pinkSave from "./fixtures/tts-save.pink-panther.json";
import { refreshedDeck } from "@/lib/deckLink";
import { TOKEN_LABEL_MAX, spawnSavedTokens } from "@/components/Positions/position.type";
import type { PositionBlob, SavedToken } from "@/components/Positions/position.type";
import {
  LABS_TTS_ASSETS,
  LabsFigure,
  LabsSetRow,
  LabsTtsModel,
  buildLabsImport,
  fetchLabsImport,
  labsImportedText,
  labsSkippedText,
  matchLabsFigures,
  parseLabsTtsSave,
} from ".";
import { labsComponentTokens } from "./components";

// Real `rpc/set_by_slug` rows and their real hosted Tabletop Simulator saves,
// fetched 2026-09-28 (#1001).
const LUCY = (lucy as unknown as LabsSetRow[])[0];
const PINK = (pink as unknown as LabsSetRow[])[0];
const LUCY_ID = "char_2dd4ea0c-a02c-4297-aeb1-5b761489e1c3";
const PINK_ID = "char_dc1ed800-ebe2-4eeb-9487-97e15a7ac956";
const LUCY_SAVE_PATH =
  "3acb4605-5d8f-4492-ac70-18e348fa8e19/set_d9326fea-f3d8-4d20-9976-7b1b657c384d/save/lucy-piper-b2b8f6d9.json";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const json = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: async () => body } as Response);

/** The Labs endpoints for Lucy & Piper; `save` decides the hosted-save lookup. */
const lucyFetch = (save: "ok" | "none" | "down" | "broken" = "ok") => {
  const calls: string[] = [];
  const impl = jest.fn(async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("gallery_characters")) return json([{ slug: LUCY.slug }]);
    if (u.includes("rpc/set_by_slug")) return json([LUCY]);
    if (u.includes("profiles")) return json([{ display_name: "Tombadil Bombadil" }]);
    if (u.includes("rpc/published_tts_save")) {
      if (save === "down") throw new TypeError("Failed to fetch");
      if (save === "none") return json([]);
      return json([{ save_path: LUCY_SAVE_PATH, revision: 10 }]);
    }
    if (u.startsWith(LABS_TTS_ASSETS)) {
      return save === "broken" ? json(null, false) : json(clone(lucySave));
    }
    throw new Error(`unexpected ${u}`);
  }) as unknown as typeof fetch;
  return { impl, calls };
};

const components = (tokens: SavedToken[] = []) =>
  tokens.filter((t) => !t.h); // hero-card tokens are the card-height ones

describe("parseLabsTtsSave", () => {
  it("reads every Custom_Model of a real save, in order", () => {
    expect(parseLabsTtsSave(lucySave).map((m) => [m.nickname, m.isDial, !!m.imageUrl])).toEqual([
      ["Lucy", true, true],
      ["Piper", true, true],
      ["frisbee token", false, true],
      ["ball token", false, true],
      ["wubba token", false, true],
      ["Lucy", false, false],
      ["Piper", false, false],
    ]);
  });

  it("reads anything else as no components", () => {
    for (const junk of [null, 3, "save", {}, { ObjectStates: "x" }, { ObjectStates: [null, 1] }]) {
      expect(parseLabsTtsSave(junk)).toEqual([]);
    }
  });
});

describe("Lucy & Piper, imported with its hosted save", () => {
  it("fetches the save with one lookup and one download", async () => {
    const { impl, calls } = lucyFetch();
    await fetchLabsImport(`labs:${LUCY_ID}`, impl);
    expect(calls.filter((u) => u.includes("published_tts_save"))).toHaveLength(1);
    expect(calls.filter((u) => u.startsWith(LABS_TTS_ASSETS))).toEqual([
      `${LABS_TTS_ASSETS}/${LUCY_SAVE_PATH}`,
    ]);
    // Never a model file.
    expect(calls.some((u) => /\.(obj|bin)$/i.test(u))).toBe(false);
  });

  it("brings three game pieces and two dials, and no 3D figure", async () => {
    const { deck } = await fetchLabsImport(`labs:${LUCY_ID}`, lucyFetch().impl);
    const tokens = components(deck.savedTokens);
    const pieces = tokens.filter((t) => !t.counter);
    expect(pieces).toHaveLength(3);
    for (const piece of pieces) {
      expect(piece.sheet).toEqual({ cols: 2, rows: 1, index: 0 });
      // #1003 display fields: round, flippable to the back cell.
      expect(piece).toMatchObject({ clip: "circle", altIndex: 1 });
      expect(piece.imageUrl).toMatch(/^https:\/\/kyqcvbnxfmpnbwtikzxp\.supabase\.co\/storage\/v1\/object\/public\/tts-assets\/.+\.png$/);
    }
    expect(pieces.map((p) => p.imageUrl!.split("/").pop())).toEqual([
      expect.stringMatching(/^frisbee-token-/),
      expect.stringMatching(/^ball-token-/),
      expect.stringMatching(/^wubba-token-/),
    ]);

    expect(pieces.map((p) => p.label)).toEqual(["frisbee token", "ball token", "wubba token"]);

    const [lucyDial, piperDial] = tokens.filter((t) => t.counter);
    expect(lucyDial).toMatchObject({ clip: "circle", label: "Lucy" });
    expect(piperDial).toMatchObject({ clip: "circle", label: "Piper" });
    // A dial's second cell is the same face: nothing to flip to.
    expect(lucyDial.altIndex).toBeUndefined();
    expect(lucyDial).toMatchObject({ counter: { link: "hero" }, sheet: { cols: 1, rows: 2, index: 0 } });
    expect(lucyDial.imageUrl).toMatch(/\/lucy-[0-9a-f]+\.png$/);
    // Hero health is never clamped (#1004): the hero's dial carries no limits.
    expect(lucyDial.counter).toEqual({ link: "hero" });
    // Piper's dial follows Piper's health, within her printed dial (#1004).
    expect(piperDial).toMatchObject({ sheet: { cols: 1, rows: 2, index: 0 } });
    expect(piperDial.counter).toEqual({ link: "extra", extra: 0, min: 0, max: 10 });
    expect(deck.deck_data.extraCharacters![0].hero).toMatchObject({ name: "Piper", hp: 10 });
    expect(piperDial.imageUrl).toMatch(/\/piper-[0-9a-f]+\.png$/);

    // The hero card and Piper's character card (#999) still come first.
    expect(deck.savedTokens!.slice(0, 2).every((t) => t.h! > 0)).toBe(true);
    expect(deck.savedTokens).toHaveLength(2 + 5);
  });

  it("moves them to the Imported line, leaving the 3D figures and the map", async () => {
    const { deck, skipped } = await fetchLabsImport(`labs:${LUCY_ID}`, lucyFetch().impl);
    expect(labsImportedText(deck)).toBe(
      "Lucy, 30 cards, hero card, 1 extra character card, deck back, 2 health dials, 3 game pieces",
    );
    expect(labsSkippedText(skipped)).toBe("2 figures, 1 map");
  });
});

describe("when the hosted save can't be read", () => {
  it.each(["none", "down", "broken"] as const)(
    "imports the deck anyway (%s), listing the components as not imported",
    async (save) => {
      const { deck, skipped } = await fetchLabsImport(`labs:${LUCY_ID}`, lucyFetch(save).impl);
      expect(deck.deck_data.cards.length).toBeGreaterThan(0);
      expect(deck.labsComponents).toBeUndefined();
      expect(components(deck.savedTokens)).toEqual([]);
      expect(labsSkippedText(skipped)).toBe(
        "2 health dials, 3 game pieces, 2 figures, 1 map",
      );
      expect(labsImportedText(deck)).toBe("Lucy, 30 cards, hero card, 1 extra character card, deck back");
    },
  );

  it("doesn't look for a save when the set has no components or map", async () => {
    const bare = clone(LUCY);
    bare.document.set.figures = [];
    bare.document.set.map = null; // a set with a map looks the save up for it (#1002)
    const calls: string[] = [];
    const impl = jest.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      if (String(url).includes("rpc/set_by_slug")) return json([bare]);
      return json([{ slug: bare.slug, display_name: "x" }]);
    }) as unknown as typeof fetch;
    await fetchLabsImport(`labs:${LUCY_ID}`, impl);
    expect(calls.some((u) => u.includes("published_tts_save"))).toBe(false);
  });
});

describe("Pink Panther, imported with its hosted save", () => {
  const { deck, skipped } = buildLabsImport(
    { row: PINK, ttsModels: parseLabsTtsSave(pinkSave) },
    PINK_ID,
  );
  const tokens = components(deck.savedTokens);

  it("links the hero dial to the hero and the 6-dial to the sidekick", () => {
    const dials = tokens.filter((t) => t.counter);
    expect(dials.map((d) => d.counter)).toEqual([{ link: "hero" }, { link: "sidekick" }]);
    expect(dials[0].imageUrl).toMatch(/\/pink-panther-s-health-dial-[0-9a-f]+\.png$/);
    expect(dials[1].imageUrl).toMatch(/\/untitled-health-dial-[0-9a-f]+\.png$/);
    for (const d of dials) {
      expect(d.clip).toBe("circle");
      expect(d.label).toBeUndefined();
    }
  });

  it("brings the picture-only figure and the sidekick token", () => {
    const rest = tokens.filter((t) => !t.counter);
    expect(rest.map((t) => t.imageUrl!.split("/").pop())).toEqual([
      expect.stringMatching(/^untitled-figure-/),
      expect.stringMatching(/^sidekick-token-/),
    ]);
    // One-sided: a 512x640 face with the token's edge strip under it.
    for (const t of rest) {
      expect(t.sheet).toEqual({ cols: 1, rows: 1.25, index: 0 });
      expect(t.clip).toBe("circle");
      expect(t.altIndex).toBeUndefined();
    }
    // Blank names get no label.
    expect(rest.map((t) => t.label)).toEqual([undefined, "Sidekick token"]);
  });

  it("leaves nothing behind", () => {
    expect(skipped).toEqual([]);
    expect(labsImportedText(deck)).toMatch(/, 2 health dials, 1 character token, 1 figure$/);
  });
});

describe("display fields", () => {
  it("keeps every token's imageUrl and caps a long label", () => {
    const LONG = "a very long name for a ball token, far past the cap";
    const row = clone(LUCY);
    row.document.set.figures!.find((f) => f.name === "ball token")!.name = LONG;
    const save = clone(lucySave) as any;
    save.ObjectStates.find((o: any) => o.Nickname === "ball token").Nickname = LONG;
    const { deck } = buildLabsImport({ row, ttsModels: parseLabsTtsSave(save) }, LUCY_ID);
    for (const t of deck.savedTokens!) expect(t.imageUrl).toMatch(/^https:\/\//);
    const long = deck.savedTokens!.find((t) => t.label?.startsWith("a very long"))!;
    expect(long.label!.length).toBeLessThanOrEqual(TOKEN_LABEL_MAX);
  });
});

describe("matchLabsFigures", () => {
  const fig = (id: string, kind: string, name = ""): LabsFigure => ({ id, kind, name });
  const model = (nickname: string, isDial = false): LabsTtsModel => ({
    nickname,
    isDial,
    imageUrl: `https://x/${nickname}.png`,
  });

  it("pairs blank names with the save's invented ones, in order", () => {
    const set = PINK.document.set;
    const matched = matchLabsFigures(set.figures!, parseLabsTtsSave(pinkSave));
    expect(set.figures!.map((f) => matched.get(f.id)?.nickname)).toEqual([
      "Pink Panther's health dial",
      "Untitled health dial",
      "Untitled figure",
      "Sidekick token",
    ]);
  });

  it("pairs duplicate names in order, and a dial never with a figure", () => {
    const matched = matchLabsFigures(
      [fig("a", "dial", "Lucy"), fig("b", "figure", "Lucy"), fig("c", "piece", "Ball"), fig("d", "piece", "Ball")],
      [model("Lucy", true), model("Lucy"), model("Ball"), model("Ball")],
    );
    expect(matched.get("a")?.isDial).toBe(true);
    expect(matched.get("b")?.isDial).toBe(false);
    expect([matched.get("c"), matched.get("d")].every(Boolean)).toBe(true);
    expect(matched.get("c")).not.toBe(matched.get("d"));
  });

  it("skips a blank stub the save left out without shifting the rest", () => {
    const matched = matchLabsFigures(
      [fig("p", "piece"), fig("d", "dial"), fig("f", "figure"), fig("t", "token", "Coin")],
      [model("Untitled game piece"), model("Untitled health dial", true), model("Coin")],
    );
    expect(matched.get("p")?.nickname).toBe("Untitled game piece");
    expect(matched.get("d")?.nickname).toBe("Untitled health dial");
    expect(matched.get("f")).toBeUndefined();
    expect(matched.get("t")?.nickname).toBe("Coin");
  });
});

describe("refresh of a deck the player has edited", () => {
  const imported = () => buildLabsImport(
    { row: LUCY, ttsModels: parseLabsTtsSave(lucySave) },
    LUCY_ID,
  ).deck;
  /** The author republished: new revision, new hosted image urls. */
  const republished = () => {
    const row = clone(LUCY);
    row.revision = 11;
    const save = clone(lucySave) as any;
    for (const o of save.ObjectStates) {
      if (o.CustomMesh?.DiffuseURL) o.CustomMesh.DiffuseURL = o.CustomMesh.DiffuseURL.replace(/\.png$/, "-v11.png");
    }
    return { row, ttsModels: parseLabsTtsSave(save) };
  };

  it("keeps the player's tokens, swaps the images, appends nothing twice", () => {
    const saved = imported();
    const mine: SavedToken = { icon: "GiFireShield", size: 60 };
    const [heroCard, piperCard, lucyDial, piperDial, ...pieces] = saved.savedTokens!;
    // The player resized Lucy's dial, deleted Piper's, and added an icon.
    saved.savedTokens = [heroCard, piperCard, mine, { ...lucyDial, size: 140 }, ...pieces];

    const next = refreshedDeck(saved, buildLabsImport(republished(), LUCY_ID).deck)!;
    expect(next.savedTokens).toHaveLength(saved.savedTokens.length);
    expect(next.savedTokens![2]).toEqual(mine);
    expect(next.savedTokens![3]).toMatchObject({ size: 140, counter: { link: "hero" } });
    expect(next.savedTokens![3].imageUrl).toMatch(/-v11\.png$/);
    for (const piece of next.savedTokens!.slice(4)) expect(piece.imageUrl).toMatch(/-v11\.png$/);
    // Piper's dial stays removed.
    expect(next.savedTokens!.some((t) => t.imageUrl === piperDial.imageUrl?.replace(/\.png$/, "-v11.png"))).toBe(false);
  });

  it("appends the components a deck saved before #1001 never had", () => {
    const old = buildLabsImport({ row: LUCY }, LUCY_ID).deck; // no save read
    const mine: SavedToken = { icon: "GiFireShield", size: 60 };
    old.savedTokens = [mine, ...old.savedTokens!];

    const fetched = imported(); // same revision, now with components
    const next = refreshedDeck(old, fetched)!;
    expect(next).not.toBeNull();
    expect(next.savedTokens!.slice(0, old.savedTokens.length)).toEqual(old.savedTokens);
    expect(components(next.savedTokens).filter((t) => t !== mine)).toEqual(components(fetched.savedTokens));
    expect(next.labsComponents).toEqual(fetched.labsComponents);
    // …and a second refresh changes nothing.
    expect(refreshedDeck(next, imported())).toBeNull();
  });

  it("keeps the deck's components when the refresh couldn't read the save", () => {
    const saved = imported();
    const withoutSave = buildLabsImport({ row: LUCY }, LUCY_ID).deck;
    expect(refreshedDeck(saved, withoutSave)).toBeNull();
    withoutSave.version_id = "11";
    const next = refreshedDeck(saved, withoutSave)!;
    expect(next.savedTokens).toEqual(saved.savedTokens);
    expect(next.labsComponents).toEqual(saved.labsComponents);
  });
});

describe("relay payload", () => {
  it("keeps a position blob with every imported token far under 256 KB", () => {
    const blobs = [
      buildLabsImport({ row: LUCY, ttsModels: parseLabsTtsSave(lucySave) }, LUCY_ID).deck,
      buildLabsImport({ row: PINK, ttsModels: parseLabsTtsSave(pinkSave) }, PINK_ID).deck,
    ].map((deck): PositionBlob => ({
      color: "#48284F",
      tokens: spawnSavedTokens(deck.savedTokens!, "player-one"),
    }));
    for (const blob of blobs) {
      // The relay's message wraps the blob; the blob is what grows with tokens.
      const bytes = new TextEncoder().encode(JSON.stringify(blob)).length;
      expect(bytes).toBeLessThan(4 * 1024);
    }
  });
});

// Spy vs Spy has no hosted-save fixture; its dials are matched against save
// objects named after them, as Labs writes them.
describe("second fighter's dial on the real Spy vs Spy set (#1004)", () => {
  const SPY = (spyVsSpy as unknown as LabsSetRow[])[0];
  const set = SPY.document.set;
  const blackSpy = set.characters.find((c) => c.name === "Spy vs Spy")!;
  const models: LabsTtsModel[] = (set.figures ?? [])
    .filter((f) => f.kind === "dial")
    .map((f) => ({ nickname: f.name ?? "", isDial: true, imageUrl: `https://example.test/${f.id}.png` }));

  it("links White Spy's dial to White Spy, within its printed range", () => {
    const { tokens } = labsComponentTokens(set, blackSpy, models, blackSpy.additionalCards);
    expect(tokens.map((t) => [t.label, t.counter])).toEqual([
      ["Black Spy health dial", { link: "hero" }],
      ["White Spy health dial", { link: "extra", extra: 0, min: 0, max: 20 }],
    ]);
  });

  it("without the extra characters, the dial is a free number with limits", () => {
    const { tokens } = labsComponentTokens(set, blackSpy, models);
    expect(tokens[1].counter).toEqual({ value: 20, min: 0, max: 20 });
  });
});
