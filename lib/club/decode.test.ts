/**
 * #1538: a the-unmatched.club deck page body (SvelteKit devalue data) as a
 * bag deck, on the recorded Ellen Ripley export (club id 2304).
 */
import ripley from "@/lib/labs/fixtures/club-export.ellen-ripley.json";
import {
  ClubImportError,
  absoluteClubUrl,
  clubProxyUrl,
  decodeClubExport,
  fetchClubDeck,
  parseClubLink,
} from "./decode";

describe("decodeClubExport", () => {
  const { deck, author, warnings } = decodeClubExport(ripley, "2304");

  it("names the deck, the hero and the author, and points back at the club", () => {
    expect(deck.id).toBe("club-2304");
    expect(deck.name).toBe("Ellen Ripley");
    expect(author).toBe("MrBrownieDL");
    expect(deck.user).toBe("MrBrownieDL");
    expect(deck.sourceUrl).toBe("https://www.the-unmatched.club/c/heroes/x.2304");
    expect(deck.tags).toContain("the-unmatched.club");
  });

  it("hero stats: hp, move (a string on the club), ranged, special ability text", () => {
    expect(deck.deck_data.hero).toMatchObject({ name: "Ellen Ripley", hp: 14, move: 2, isRanged: true });
    expect(deck.deck_data.hero.specialAbility).toMatch(/^SURROGATE MOTHER:/);
    expect(deck.deck_data.hero.specialAbility).toMatch(/gain 1 action/);
  });

  it("sidekick: name, count, start health, melee", () => {
    expect(deck.deck_data.sidekick).toMatchObject({ name: "Newt", quantity: 1, hp: 7, isRanged: false });
  });

  it("card count is the sum of the club's counts, plus the hero card as a reference token", () => {
    const draw = deck.deck_data.cards.filter((c) => !c.isCharacterCard);
    expect(draw.reduce((n, c) => n + c.quantity, 0)).toBe(30);
    expect(draw).toHaveLength(12);
    const heroCard = deck.deck_data.cards.find((c) => c.isCharacterCard);
    expect(heroCard?.cardImage?.url).toMatch(/img\.unmatched\.club\/.*character-e3/);
    expect(deck.savedTokens?.length).toBeGreaterThan(0);
  });

  it("card titles come from the description heading; type, value and boost from the club fields", () => {
    const loader = deck.deck_data.cards.find((c) => c.title === "P-5000 POWER LOADER");
    expect(loader).toMatchObject({
      type: "attack",
      value: 3,
      boost: 3,
      quantity: 2,
      characterName: "Ellen Ripley",
      duringText: "If Ripley is adjacent to the opposing fighter, this card's value is 6 instead.",
    });
    const defence = deck.deck_data.cards.find((c) => c.type === "defence");
    expect(defence?.characterName).toBe("Any");
  });

  it("card images are the club's rendered previews, absolute; the cardback is the hero's", () => {
    const draw = deck.deck_data.cards.filter((c) => !c.isCharacterCard);
    for (const card of draw) {
      expect(card.cardImage?.url).toMatch(/^https:\/\/img\.unmatched\.club\/.*action-\d+/);
      expect(card.cardBackUrl).toBe("https://i.imgur.com/l467DIt.png");
    }
    expect(deck.deck_data.appearance.cardbackUrl).toBe("https://i.imgur.com/l467DIt.png");
    expect(warnings).toEqual([]);
  });

  it("club-relative art becomes absolute", () => {
    expect(absoluteClubUrl("/drive/files/abc/raw")).toBe("https://www.the-unmatched.club/drive/files/abc/raw");
    expect(absoluteClubUrl("https://i.imgur.com/x.png")).toBe("https://i.imgur.com/x.png");
    expect(absoluteClubUrl("")).toBeUndefined();
  });

  it("a card without a rendered preview falls back to its replacement art", () => {
    const body = JSON.parse(JSON.stringify(ripley)) as typeof ripley;
    const data = body.nodes[0].data as unknown[];
    const root = data[0] as { cardPreviewUrls: number };
    const previews = data[root.cardPreviewUrls] as { action: number };
    data[previews.action] = {};
    const { deck: fallback } = decodeClubExport(body, "2304");
    const loader = fallback.deck_data.cards.find((c) => c.title === "P-5000 POWER LOADER");
    expect(loader?.cardImage?.url).toBe("https://i.imgur.com/Br4tH9S.png");
    const relative = fallback.deck_data.cards.find((c) => c.cardImage?.url.includes("/drive/files/"));
    expect(relative?.cardImage?.url).toMatch(/^https:\/\/www\.the-unmatched\.club\/drive\/files\//);
  });

  /** Edit one slot of the flattened body and decode it. */
  const mutated = (edit: (data: unknown[], root: Record<string, number>) => void) => {
    const body = JSON.parse(JSON.stringify(ripley)) as typeof ripley;
    const data = body.nodes[0].data as unknown[];
    edit(data, data[0] as Record<string, number>);
    return body;
  };
  const hero = (data: unknown[], root: Record<string, number>) => data[root.hero] as Record<string, number>;

  it("count: 0 is a card taken out of the deck, not one copy (review)", () => {
    const body = mutated((data, root) => {
      const cards = data[root.cards] as number[];
      const first = data[cards[0]] as Record<string, number>;
      // give the first card its own `count` slot holding 0
      data.push(0);
      data[cards[0]] = { ...first, count: data.length - 1 };
    });
    const { deck: trimmed } = decodeClubExport(body, "2304");
    const draw = trimmed.deck_data.cards.filter((c) => !c.isCharacterCard);
    expect(draw).toHaveLength(11);
    expect(draw.reduce((n, c) => n + c.quantity, 0)).toBe(28);
  });

  it("malformed bodies are parse errors, never TypeErrors (review)", () => {
    const cases: Array<[string, (data: unknown[], root: Record<string, number>) => void]> = [
      ["cards as an object", (data, root) => { data[root.cards] = { a: 1 }; }],
      ["cards as a string", (data, root) => { data[root.cards] = "lots"; }],
      ["a -1 entry in cards", (data, root) => { (data[root.cards] as number[]).push(-1); }],
      ["an out-of-range entry in cards", (data, root) => { (data[root.cards] as number[]).push(99999); }],
      ["a numeric title", (data, root) => { hero(data, root).title = root.hero; data[root.hero] = { ...hero(data, root), title: 999 }; }],
      ["non-array tiptap content", (data, root) => {
        const cards = data[root.cards] as number[];
        const first = data[cards[0]] as Record<string, number>;
        data[first.description] = { type: "doc", content: 12 };
      }],
      ["characters as a string", (data, root) => { data[root.hero] = { ...hero(data, root), characters: 3 }; }],
    ];
    for (const [label, edit] of cases) {
      const body = mutated(edit);
      let threw: unknown;
      let decoded: ReturnType<typeof decodeClubExport> | undefined;
      try {
        decoded = decodeClubExport(body, "2304");
      } catch (err) {
        threw = err;
      }
      // either a clean decode or a ClubImportError — never a TypeError
      if (threw) {
        expect([label, (threw as Error).name]).toEqual([label, "ClubImportError"]);
        expect((threw as ClubImportError).status).toBe("parse_error");
      } else {
        expect([label, decoded?.deck.name]).toEqual([label, expect.any(String)]);
      }
    }
    // the ones that must refuse outright
    expect(() => decodeClubExport(mutated((d, r) => { d[r.cards] = { a: 1 }; }))).toThrow(ClubImportError);
    expect(() => decodeClubExport(mutated((d, r) => { d[r.cards] = "lots"; }))).toThrow(ClubImportError);
  });

  it("shared references rehydrate once each, so a body full of them stays fast (review)", () => {
    // one object referenced from 20 nested levels, each level referencing it 20 times
    const data: unknown[] = [{ hero: 1, cards: 2 }, { title: 3, characters: 4, cardsBack: 5 }, [], "Shared", [], ""];
    let prev = 3;
    for (let i = 0; i < 20; i++) {
      data.push(Array.from({ length: 20 }, () => prev));
      prev = data.length - 1;
    }
    (data[1] as Record<string, number>).characters = prev;
    const start = Date.now();
    expect(() => decodeClubExport({ nodes: [{ data }] })).toThrow(ClubImportError); // no cards
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("a body without a deck node is a parse error, never a crash", () => {
    expect(() => decodeClubExport({ type: "data", nodes: [] })).toThrow(ClubImportError);
    expect(() => decodeClubExport(null)).toThrow(ClubImportError);
    expect(() => decodeClubExport("nope")).toThrow(ClubImportError);
  });
});

describe("parseClubLink", () => {
  it("reads the id off a hero page link with any slug, with or without www or /export/", () => {
    expect(parseClubLink("https://www.the-unmatched.club/c/heroes/ellen-ripley.2304")).toBe("2304");
    expect(parseClubLink("https://the-unmatched.club/c/heroes/x.2304/export/__data.json")).toBe("2304");
    expect(parseClubLink("the-unmatched.club/c/heroes/2304")).toBe("2304");
    expect(parseClubLink("https://the-unmatched.club/decks/42")).toBeUndefined();
    expect(parseClubLink("https://unmatched.cards/decks/DOPE")).toBeUndefined();
  });
});

describe("fetchClubDeck", () => {
  const json = (body: unknown, status = 200) =>
    Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

  it("goes through the API proxy and decodes the body", async () => {
    global.fetch = jest.fn(async () => json(ripley)) as unknown as typeof fetch;
    const { deck } = await fetchClubDeck("2304");
    expect(global.fetch).toHaveBeenCalledWith(clubProxyUrl("2304"));
    expect(clubProxyUrl("2304")).toMatch(/\/club\/heroes\/2304$/);
    expect(deck.name).toBe("Ellen Ripley");
  });

  it("carries the proxy's status, a network failure and a non-JSON body as the reason", async () => {
    global.fetch = jest.fn(async () => json({ error: "not_found" }, 404)) as unknown as typeof fetch;
    await expect(fetchClubDeck("1")).rejects.toMatchObject({ status: 404 });
    // the API's own router 404 (the proxy route not deployed yet) is not "no such deck"
    global.fetch = jest.fn(async () =>
      json({ ok: false, code: "NOT_FOUND", message: "Not found" }, 404),
    ) as unknown as typeof fetch;
    await expect(fetchClubDeck("1")).rejects.toMatchObject({ status: "unavailable" });
    global.fetch = jest.fn(async () => json({}, 502)) as unknown as typeof fetch;
    await expect(fetchClubDeck("1")).rejects.toMatchObject({ status: 502 });
    global.fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(fetchClubDeck("1")).rejects.toMatchObject({ status: "network" });
    // not JSON at any status (HTML from an edge, a wrong API_URL): unavailable, not "no deck"
    for (const status of [200, 404, 502]) {
      global.fetch = jest.fn(async () =>
        Promise.resolve({ ok: status < 400, status, json: async () => { throw new SyntaxError("x"); } } as unknown as Response),
      ) as unknown as typeof fetch;
      await expect(fetchClubDeck("1")).rejects.toMatchObject({ status: "unavailable" });
    }
  });

  it("a body the decoder can't read is a parse_error, whatever it threw (review)", async () => {
    const body = JSON.parse(JSON.stringify(ripley)) as typeof ripley;
    const data = body.nodes[0].data as unknown[];
    (data[(data[0] as { cards: number }).cards] as number[]).push(-1);
    global.fetch = jest.fn(async () => json(body)) as unknown as typeof fetch;
    const { deck } = await fetchClubDeck("2304");
    expect(deck.name).toBe("Ellen Ripley"); // a -1 card entry is simply skipped
    data[(data[0] as { cards: number }).cards] = { nope: 1 };
    await expect(fetchClubDeck("2304")).rejects.toMatchObject({ status: "parse_error" });
  });
});
