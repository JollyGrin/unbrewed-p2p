import { describe, expect, it, jest } from "@jest/globals";
import { makeDeck, newPool } from "@/components/DeckPool/PoolFns";
import setBySlug from "./fixtures/set-by-slug.dumbass-brigade.json";
import galleryCharacter from "./fixtures/gallery-character.marouine.json";
import spyVsSpy from "./fixtures/set-by-slug.spy-vs-spy.json";
import {
  LabsImportError,
  LabsLoadedSet,
  LabsSetRow,
  actionCardsOf,
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
    expect(deck.deck_data.cards.filter((c) => !c.isCharacterCard)).toHaveLength(14);
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
    // the template's art is still the author's upload (used only as fallback)
    expect(byTitle("Flinch").imageUrl).toBe(
      ROW.document.set.cards.find((c) => c.title === "Flinch")!.artwork!.source,
    );
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

  it("draws every card as its own finished Labs render", () => {
    const previews = ROW.card_previews!;
    const ids = actionCardsOf(ROW.document.set, MAROUINE).map((c) => c.id);
    const faces = deck.deck_data.cards.filter((c) => !c.isCharacterCard);
    expect(faces.map((c) => c.cardImage?.url)).toEqual(
      ids.map((id) => previews[`card:${id}:front`]),
    );
    expect(new Set(faces.map((c) => c.cardImage?.url)).size).toBe(faces.length);
    // the card from #994's bug report
    expect(byTitle("Point Blank").cardImage).toEqual({
      url: previews["card:card_fdb8832c-a56e-4b08-8e6b-a23bba913976:front"],
    });
  });

  it("uses the finished hero card and deck back", () => {
    const heroCard = deck.deck_data.cards.filter((c) => c.isCharacterCard);
    expect(heroCard).toEqual([
      expect.objectContaining({
        title: "Marouine",
        quantity: 1,
        cardImage: { url: ROW.card_previews![`character-card:${MAROUINE}:front`] },
      }),
    ]);
    const back = ROW.card_previews![`deck-back:${MAROUINE}:front`];
    expect(deck.deck_data.appearance.cardbackUrl).toBe(back);
    expect(deck.deck_data.cards.every((c) => c.cardBackUrl === back)).toBe(true);
    // on the table from turn one, like a Club import
    expect(deck.savedTokens).toEqual([
      expect.objectContaining({ imageUrl: heroCard[0].cardImage!.url }),
    ]);
  });

  // Pinned before #994: the full-art faces must not change what deck stats,
  // search and the deck list read.
  it("keeps the structured card data", () => {
    expect(
      deck.deck_data.cards
        .filter((c) => !c.isCharacterCard)
        .map(({ cardImage, cardBackUrl, ...fields }) => fields),
    ).toMatchSnapshot();
  });
});

describe("without a finished render", () => {
  const POINT_BLANK = "card_fdb8832c-a56e-4b08-8e6b-a23bba913976";
  const withoutPreview = (...keys: string[]): LabsSetRow => {
    const row = clone(ROW);
    for (const key of keys) delete row.card_previews![key];
    return row;
  };

  it("falls back to the template for that card only", () => {
    const { deck } = buildLabsImport(loaded(withoutPreview(`card:${POINT_BLANK}:front`)), MAROUINE);
    const cards = deck.deck_data.cards.filter((c) => !c.isCharacterCard);
    expect(cards.find((c) => c.title === "Point Blank")!.cardImage).toBeUndefined();
    expect(cards.filter((c) => c.cardImage)).toHaveLength(cards.length - 1);
  });

  it("imports a set with no previews at all as before", () => {
    const row = clone(ROW);
    delete row.card_previews;
    const { deck } = buildLabsImport(loaded(row), MAROUINE);
    expect(deck.deck_data.cards).toHaveLength(14);
    expect(deck.deck_data.cards.some((c) => c.cardImage)).toBe(false);
    expect(deck.deck_data.appearance.cardbackUrl).toBe("");
    expect(deck.savedTokens).toBeUndefined();
  });

  it("can still trip the detector", () => {
    const row = withoutPreview(`card:${POINT_BLANK}:front`);
    row.document.set.cards.find((c) => c.id === POINT_BLANK)!.split = true;
    expect(buildLabsImport(loaded(row), MAROUINE).unsupported).toEqual([
      { id: "split-card", label: "Split cards", cards: ["Point Blank"] },
    ]);
  });

  it("does not trip on a rendered card with the same feature", () => {
    const row = clone(ROW);
    row.document.set.cards.find((c) => c.id === POINT_BLANK)!.split = true;
    expect(buildLabsImport(loaded(row), MAROUINE).unsupported).toEqual([]);
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

  it("flags the bonus-attack panel Aesa-Arannis uses when it has to be templated", () => {
    expect(detectLabsUnsupported(ROW.document.set, AESA)).toEqual([
      { id: "bonus-attack", label: expect.any(String), cards: ["Follow Orders"] },
    ]);
    const follow = buildLabsImport(loaded(), AESA).deck.deck_data.cards.find((c) => c.title === "Follow Orders")!;
    expect(follow.afterText).toMatch(/^You may BONUS ATTACK/);
    expect(follow.afterText).toMatch(/\nBONUS ATTACK/);
  });

  it("does not warn for Aesa-Arannis once Labs has rendered her cards", () => {
    const aesa = buildLabsImport(loaded(), AESA);
    expect(aesa.unsupported).toEqual([]);
    expect(aesa.deck.deck_data.cards.find((c) => c.title === "Follow Orders")!.cardImage?.url).toMatch(
      /card-preview-.*\.webp$/,
    );
    // …but it does again if that card's render goes missing
    const row = clone(ROW);
    const follow = row.document.set.cards.find((c) => c.title === "Follow Orders")!;
    delete row.card_previews![`card:${follow.id}:front`];
    expect(buildLabsImport(loaded(row), AESA).unsupported.map((f) => f.id)).toEqual(["bonus-attack"]);
  });

  it("refuses a character without an action deck", () => {
    const row = clone(ROW);
    row.document.set.decks = row.document.set.decks.filter((d) => d.ownerId !== MAROUINE);
    expect(() => buildLabsImport(loaded(row), MAROUINE)).toThrow(
      expect.objectContaining({ code: "no-deck" }),
    );
  });
});

// Real `rpc/set_by_slug` response for "Spy vs Spy" (slug
// 1dbb5c55516a5dd081b6af70), fetched 2026-09-28 — #999. Black Spy has an
// extra character card, White Spy, whose id is `hchar_…`.
describe("extra character cards, on the real Spy vs Spy payload", () => {
  const SPY_ROW = (spyVsSpy as unknown as LabsSetRow[])[0];
  const BLACK_SPY = "char_8cda56e0-e3d2-4362-aa8e-18380ed39f7d";
  const WHITE_SPY = "hchar_c623d665-3a1f-4acc-a8c7-e72ce6b7fd44";
  const spyLoaded = (row: LabsSetRow = SPY_ROW): LabsLoadedSet => ({ row, characterId: BLACK_SPY });

  it("imports with no warning", () => {
    expect(buildLabsImport(spyLoaded(), BLACK_SPY).unsupported).toEqual([]);
    expect(detectLabsUnsupported(SPY_ROW.document.set, BLACK_SPY, SPY_ROW)).toEqual([]);
  });

  it("brings White Spy in as a reference card with its hchar_ render", () => {
    const { deck } = buildLabsImport(spyLoaded(), BLACK_SPY);
    const whiteSpy = SPY_ROW.card_previews![`character-card:${WHITE_SPY}:front`];
    expect(whiteSpy).toMatch(/^https:/);
    const reference = deck.deck_data.cards.filter((c) => c.isCharacterCard);
    expect(reference.map((c) => [c.title, c.cardImage?.url])).toEqual([
      ["Black Spy", SPY_ROW.card_previews![`character-card:${BLACK_SPY}:front`]],
      ["White Spy", whiteSpy],
    ]);
    // never shuffled in, on the table from turn one
    const drawn = makeDeck(newPool(deck)).deck!;
    expect(drawn.some((c) => c.isCharacterCard)).toBe(false);
    expect(deck.savedTokens?.map((t) => t.imageUrl)).toEqual(reference.map((c) => c.cardImage!.url));
    // every deck card is Labs' render too
    const faces = deck.deck_data.cards.filter((c) => !c.isCharacterCard);
    expect(faces).toHaveLength(13);
    expect(faces.every((c) => c.cardImage?.url)).toBe(true);
  });

  it("carries White Spy's stats as an extra character", () => {
    const { deck } = buildLabsImport(spyLoaded(), BLACK_SPY);
    expect(deck.deck_data.extraCharacters).toEqual([
      {
        hero: {
          name: "White Spy",
          hp: 9,
          move: 2,
          isRanged: false,
          specialAbility:
            "White vs Black: When Black Spy takes damage from any source, White Spy recovers 1 health.",
          quote: undefined,
        },
        sidekick: expect.objectContaining({ quantity: null }),
      },
    ]);
    expect(newPool(deck).extraCharacters.map((c) => c.hero.name)).toEqual(["White Spy"]);
  });

  it("warns, naming the extra card, when its render is missing", () => {
    const row = clone(SPY_ROW);
    delete row.card_previews![`character-card:${WHITE_SPY}:front`];
    const { deck, unsupported } = buildLabsImport(spyLoaded(row), BLACK_SPY);
    expect(unsupported).toEqual([
      { id: "additional-character-cards", label: "Extra character cards", cards: ["White Spy"] },
    ]);
    // the hero card is still there; White Spy's stats still are too
    expect(deck.deck_data.cards.filter((c) => c.isCharacterCard).map((c) => c.title)).toEqual([
      "Black Spy",
    ]);
    expect(deck.deck_data.extraCharacters).toHaveLength(1);
  });

  it("does not add extra characters to a hero without them", () => {
    expect(buildLabsImport(loaded(), MAROUINE).deck.deck_data.extraCharacters).toBeUndefined();
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
    // …and no finished render, so it has to be drawn by our template
    delete row.card_previews![`card:${flinch.id}:front`];
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
      // The Brigade has game pieces (#1001); no hosted save here.
      if (u.includes("rpc/published_tts_save")) return json([]);
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
      "rpc/published_tts_save",
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
