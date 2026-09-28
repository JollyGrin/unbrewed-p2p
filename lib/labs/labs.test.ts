import { describe, expect, it, jest } from "@jest/globals";
import { makeDeck, newPool } from "@/components/DeckPool/PoolFns";
import setBySlug from "./fixtures/set-by-slug.dumbass-brigade.json";
import galleryCharacter from "./fixtures/gallery-character.marouine.json";
import {
  LabsImportError,
  LabsLoadedSet,
  LabsSetRow,
  buildLabsImport,
  detectLabsUnsupported,
  fetchLabsImport,
  fetchLabsSet,
  isLabsDeckId,
  labsDeckId,
  labsText,
  listLabsHeroes,
  parseLabsInput,
} from ".";

// Real `rpc/set_by_slug` response for "The Dumbass Brigade", fetched
// 2026-09-28 — the Marouine example from #905.
const ROW = (setBySlug as unknown as LabsSetRow[])[0];
const SLUG = "66521662a3f5ff4e7a23b429";
const MAROUINE = "char_ce316d14-8bc8-413d-9086-ad37b502d0fe";
const AESA = "char_180c7344-001d-43da-841f-83f45b06ccc0";

// jsdom lacks structuredClone
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const loaded = (row: LabsSetRow = ROW): LabsLoadedSet => ({
  row,
  author: "TheNullProfessor",
  characterId: MAROUINE,
});

describe("parseLabsInput", () => {
  it("reads a character link", () => {
    expect(
      parseLabsInput(`https://www.unmatchedlabs.com/shared/${SLUG}?character=${MAROUINE}`),
    ).toEqual({ kind: "character", characterId: MAROUINE, slug: SLUG });
  });

  it("reads a share link, with or without the hash route", () => {
    expect(parseLabsInput(`https://www.unmatchedlabs.com/shared/${SLUG}`)).toEqual({
      kind: "set",
      slug: SLUG,
    });
    expect(parseLabsInput(`  unmatchedlabs.com/#/shared/${SLUG}/ `)).toEqual({
      kind: "set",
      slug: SLUG,
    });
  });

  it("reads a bare character id, our deck id, and the deep-link form", () => {
    for (const raw of [MAROUINE, `labs-${MAROUINE}`, `labs:${MAROUINE}`, MAROUINE.toUpperCase().replace("CHAR_", "char_")]) {
      expect(parseLabsInput(raw)).toEqual({ kind: "character", characterId: MAROUINE, slug: undefined });
    }
  });

  it("reads a bare share slug", () => {
    expect(parseLabsInput(SLUG)).toEqual({ kind: "set", slug: SLUG });
  });

  it("rejects garbage", () => {
    for (const raw of ["", "   ", "hello", "char_nope", "labs-pk1x", "not a link at all", "https://example.com/"]) {
      expect(parseLabsInput(raw)).toBeNull();
    }
  });
});

describe("labsDeckId", () => {
  it("is stable per character and can't be an unmatched.cards id", () => {
    expect(labsDeckId(MAROUINE)).toBe(`labs-${MAROUINE}`);
    expect(labsDeckId(MAROUINE)).toBe(labsDeckId(MAROUINE));
    expect(isLabsDeckId(labsDeckId(MAROUINE))).toBe(true);
    expect(isLabsDeckId("pk1x")).toBe(false);
    expect(isLabsDeckId("img-abc123")).toBe(false);
  });
});

describe("buildLabsImport on the real Marouine payload", () => {
  const { deck, unsupported, setName } = buildLabsImport(loaded(), MAROUINE);
  const byTitle = (title: string) => deck.deck_data.cards.find((c) => c.title === title)!;

  it("maps the hero", () => {
    expect(deck.id).toBe(`labs-${MAROUINE}`);
    expect(deck.name).toBe("Marouine");
    expect(deck.user).toBe("TheNullProfessor");
    expect(deck.sourceUrl).toBe(
      `https://www.unmatchedlabs.com/shared/${SLUG}?character=${MAROUINE}`,
    );
    expect(setName).toBe("The Dumbass Brigade");
    expect(deck.deck_data.hero).toMatchObject({
      name: "Marouine",
      hp: 16,
      move: 2,
      isRanged: true,
      quote: "I can find you, no matter what corner of the universe you hide in.",
    });
    expect(deck.deck_data.hero.specialAbility).toMatch(/^Fast Hands: You start with 4 reflex tokens\./);
    // Marouine has no sidekick: the stub, not a 3-strong phantom
    expect(deck.deck_data.sidekick.quantity).toBeNull();
  });

  it("maps a playable 30-card deck", () => {
    expect(deck.deck_data.cards).toHaveLength(14);
    const drawn = makeDeck(newPool(deck)).deck!;
    expect(drawn).toHaveLength(30);
  });

  it("maps card values, types and text", () => {
    expect(byTitle("Flinch")).toMatchObject({
      type: "attack",
      value: 0,
      boost: 2,
      quantity: 2,
      characterName: "Marouine",
      // " \n" was the author's manual wrap, not a paragraph break
      immediateText: "Cancel all effects on your opponents card.",
      afterText: "Gain 1 action.",
    });
    expect(byTitle("Flinch").imageUrl).toMatch(/^https:\/\/.*supabase\.co\//);
    expect(byTitle("High Alert")).toMatchObject({ type: "defence", value: 3 });
    expect(byTitle("Hired Gun")).toMatchObject({ type: "versatile", value: 5 });
    expect(byTitle("Darkvision")).toMatchObject({
      type: "scheme",
      value: null,
      basicText: "Regain all your reflex tokens.\nDraw a card.",
    });
  });

  it("renders faithfully, so nothing is flagged", () => {
    expect(unsupported).toEqual([]);
  });
});

describe("other heroes in the same real set", () => {
  it("lists the heroes with decks", () => {
    expect(listLabsHeroes(ROW.document.set).map((h) => h.name)).toEqual([
      "Elliot Becker",
      "The Night Star",
      "Marouine",
      "Aesa-Arannis",
    ]);
  });

  it("maps sidekick-owned cards and set rules", () => {
    const elliot = buildLabsImport(loaded(), "char_0848bf26-989a-44f4-95c2-ce67373b146d").deck;
    expect(elliot.deck_data.sidekick).toMatchObject({ name: "THE AUDIENCE", quantity: 5, hp: 1 });
    expect(elliot.deck_data.cards.find((c) => c.title === "Mosh Pit")?.characterName).toBe("THE AUDIENCE");
    expect(elliot.deck_data.cards.find((c) => c.title === "Feint")?.characterName).toBe("ANY");
    expect(elliot.deck_data.ruleCards?.[0].title).toBe("Chorus Cards");
    expect(elliot.deck_data.ruleCards?.[0].content).toMatch(/^When you play a "chorus" card/);
    expect(elliot.deck_data.ruleCards?.[0].content).not.toMatch(/<div>/);
    // bonus lines ("CHORUS: …") are kept on the card
    expect(elliot.deck_data.cards.find((c) => c.title === "Tale of the Worlds Beyond")?.afterText).toMatch(/\nCHORUS: Draw 1 card/);
  });

  it("flags the bonus-attack panel Aesa-Arannis uses", () => {
    expect(detectLabsUnsupported(ROW.document.set, AESA)).toEqual([
      { id: "bonus-attack", label: expect.any(String), cards: ["Follow Orders"] },
    ]);
    const follow = buildLabsImport(loaded(), AESA).deck.deck_data.cards.find((c) => c.title === "Follow Orders")!;
    expect(follow.afterText).toMatch(/^You may BONUS ATTACK/);
    expect(follow.afterText).toMatch(/\nBONUS ATTACK/);
  });

  it("refuses a character without an action deck", () => {
    const row = clone(ROW);
    row.document.set.decks = row.document.set.decks.filter((d) => d.ownerId !== MAROUINE);
    expect(() => buildLabsImport(loaded(row), MAROUINE)).toThrow(
      expect.objectContaining({ code: "no-deck" }),
    );
  });
});

describe("detectLabsUnsupported", () => {
  // The real payload with one Marouine card using a custom symbol, the way
  // Labs stores it: a `customSymbols` entry plus a `{{custom:<id>}}` token.
  const withCustomSymbol = (): LabsSetRow => {
    const row = clone(ROW);
    const set = row.document.set;
    set.customSymbols = [{ id: "sym_1", name: "Reflex", source: "https://example.com/r.png" }];
    const flinch = set.cards.find((c) => c.title === "Flinch")!;
    flinch.ability!.afterCombat = "Gain 1 {{custom:sym_1}}.";
    return row;
  };

  it("trips on custom symbols", () => {
    const row = withCustomSymbol();
    expect(detectLabsUnsupported(row.document.set, MAROUINE)).toEqual([
      { id: "custom-symbols", label: "Custom symbols", cards: ["Flinch"] },
    ]);
    expect(buildLabsImport(loaded(row), MAROUINE).unsupported.map((f) => f.id)).toEqual([
      "custom-symbols",
    ]);
  });

  it("does not trip on a custom symbol another hero uses", () => {
    expect(detectLabsUnsupported(withCustomSymbol().document.set, AESA).map((f) => f.id)).toEqual([
      "bonus-attack",
    ]);
  });

  it("trips on split cards and non-standard symbols", () => {
    const row = clone(ROW);
    const cards = row.document.set.cards;
    cards.find((c) => c.title === "Flinch")!.split = true;
    cards.find((c) => c.title === "Skirmish")!.symbol = "hybrid-attack";
    expect(detectLabsUnsupported(row.document.set, MAROUINE).map((f) => [f.id, f.cards])).toEqual([
      ["non-standard-symbol", ["Skirmish"]],
      ["split-card", ["Flinch"]],
    ]);
  });
});

describe("labsText", () => {
  const ctx = { subject: "Marouine", set: ROW.document.set };

  it("strips markup, decodes entities and names the subject", () => {
    expect(labsText("<b>&gt;</b> move {{name}} up to 2 spaces", ctx)).toBe("> move Marouine up to 2 spaces");
    expect(labsText("<div>One.</div><div><br></div><div>Two.</div>", ctx)).toBe("One.\n\nTwo.");
    expect(labsText("Play a {{versatile}} card", ctx)).toBe("Play a VERSATILE card");
  });
});

describe("fetchLabsSet / fetchLabsImport", () => {
  // jsdom has no `Response`; the fetcher reads only `ok` and `json()`.
  const json = (body: unknown, status = 200) =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      json: async () => body,
    } as Response);

  /** Routes the three Labs endpoints to fixtures; records every URL hit. */
  const labsFetch = (overrides: Partial<Record<"gallery" | "set" | "profile", () => Promise<Response>>> = {}) => {
    const calls: string[] = [];
    const impl = jest.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("gallery_characters")) return (overrides.gallery ?? (() => json(galleryCharacter)))();
      if (u.includes("rpc/set_by_slug")) return (overrides.set ?? (() => json(setBySlug)))();
      if (u.includes("profiles")) return (overrides.profile ?? (() => json([{ display_name: "TheNullProfessor" }])))();
      throw new Error(`unexpected ${u}`);
    }) as unknown as typeof fetch;
    return { impl, calls };
  };

  it("resolves a bare character id through the gallery to its set", async () => {
    const { impl, calls } = labsFetch();
    const result = await fetchLabsImport(MAROUINE, impl);
    expect(result.deck.id).toBe(`labs-${MAROUINE}`);
    expect(result.deck.user).toBe("TheNullProfessor");
    expect(calls.map((c) => c.split("/rest/v1/")[1].split("?")[0])).toEqual([
      "gallery_characters",
      "rpc/set_by_slug",
      "profiles",
    ]);
  });

  it("skips the gallery lookup when the link carries the slug", async () => {
    const { impl, calls } = labsFetch();
    await fetchLabsSet(`https://www.unmatchedlabs.com/shared/${SLUG}?character=${MAROUINE}`, impl);
    expect(calls.some((c) => c.includes("gallery_characters"))).toBe(false);
  });

  it("makes no request for garbage input", async () => {
    const { impl, calls } = labsFetch();
    await expect(fetchLabsSet("hello", impl)).rejects.toMatchObject({ code: "bad-input" });
    expect(calls).toEqual([]);
  });

  it("needs a hero choice for a multi-hero share link", async () => {
    const { impl } = labsFetch();
    await expect(fetchLabsImport(SLUG, impl)).rejects.toMatchObject({ code: "choose-character" });
  });

  it("reports a private or missing set", async () => {
    const { impl } = labsFetch({ set: () => json([]) });
    await expect(fetchLabsSet(SLUG, impl)).rejects.toMatchObject({ code: "not-found" });
  });

  it("reports an unknown character", async () => {
    const { impl } = labsFetch({ gallery: () => json([]) });
    await expect(fetchLabsSet(MAROUINE, impl)).rejects.toMatchObject({ code: "character-not-found" });
  });

  it("reports network failures and server errors as network", async () => {
    const down = labsFetch({ set: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(fetchLabsSet(SLUG, down.impl)).rejects.toBeInstanceOf(LabsImportError);
    await expect(fetchLabsSet(SLUG, down.impl)).rejects.toMatchObject({ code: "network" });
    const sick = labsFetch({ set: () => json({ message: "boom" }, 503) });
    await expect(fetchLabsSet(SLUG, sick.impl)).rejects.toMatchObject({ code: "network" });
  });

  it("still imports when the author lookup fails", async () => {
    const { impl } = labsFetch({ profile: () => Promise.reject(new TypeError("nope")) });
    const result = await fetchLabsImport(MAROUINE, impl);
    expect(result.deck.user).toBe("Unmatched Labs");
  });
});
