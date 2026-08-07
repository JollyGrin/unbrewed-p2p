/**
 * Share-link data loading (#566). A share payload is the one thing in the bag
 * that arrives from a stranger, so these tests care about two things: the
 * preview reads correctly for a real deck/map, and nothing that isn't
 * recognisably one gets anywhere near the visitor's localStorage.
 */
import { API_URL } from "@/lib/account/apiUrl";
import {
  bagKindForRoute,
  isSafeImageUrl,
  loadSharedItem,
  parseSharePath,
  parseSharedDeck,
  parseSharedMap,
} from "./sharedItem";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const DECK_DATA = {
  id: "deck-1",
  name: "Bruce Lee",
  deck_data: {
    name: "Bruce Lee",
    hero: { name: "Bruce Lee", hp: 16, move: 2, isRanged: false },
    sidekick: { name: "Sidekick", quantity: 0 },
    appearance: {
      cardbackUrl: "https://example.com/back.png",
      highlightColour: "#123456",
    },
    cards: [
      { title: "Fist", quantity: 3 },
      { title: "Kick", quantity: 2 },
      { title: "Bruce Lee", quantity: 1, isCharacterCard: true },
    ],
  },
};

const MAP_DATA = {
  imgUrl: "https://example.com/map.webp",
  meta: { title: "Sarah's Attic", author: "Gerry" },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("parseSharePath", () => {
  it("recognises every share route the 404 rescue serves", () => {
    expect(parseSharePath("/share/deck/abc")).toEqual({
      kind: "deck",
      id: "abc",
    });
    expect(parseSharePath("/share/map/abc?utm=x#frag")).toEqual({
      kind: "map",
      id: "abc",
    });
    // #567's replay links go through the same parser
    expect(parseSharePath("/share/replay/abc")).toEqual({
      kind: "replay",
      id: "abc",
    });
  });

  it("decodes a percent-escaped id, and survives an undecodable one", () => {
    expect(parseSharePath("/share/deck/a%20b")?.id).toBe("a b");
    expect(parseSharePath("/share/deck/100%")?.id).toBe("100%");
  });

  it("ignores everything else that lands on the 404 page", () => {
    [
      "/",
      "/bag",
      "/share",
      "/share/deck",
      "/share/deck/",
      "/share/decks/abc",
      "/share/deck/abc/extra",
      "/online/lobby/user",
      "/offline/deck-id",
    ].forEach((path) => expect(parseSharePath(path)).toBeNull());
  });

  it("maps the client route onto the API's plural segment", () => {
    expect(bagKindForRoute("deck")).toBe("decks");
    expect(bagKindForRoute("map")).toBe("maps");
  });
});

describe("parseSharedDeck", () => {
  it("reads hero, sidekick and the shuffled card count", () => {
    const preview = parseSharedDeck({
      id: "cloud-id",
      name: "Bruce Lee",
      data: DECK_DATA,
    });

    expect(preview).toMatchObject({
      kind: "deck",
      id: "cloud-id",
      name: "Bruce Lee",
      heroName: "Bruce Lee",
      // the `quantity: 0` stub is not a sidekick
      sidekickName: undefined,
      // 3 + 2, excluding the isCharacterCard hero card
      cardCount: 5,
      cardbackUrl: "https://example.com/back.png",
      highlightColour: "#123456",
    });
  });

  it("keeps a real sidekick", () => {
    const preview = parseSharedDeck({
      id: "c",
      name: "n",
      data: {
        ...DECK_DATA,
        deck_data: {
          ...DECK_DATA.deck_data,
          sidekick: { name: "Yellow Jacket", quantity: 3 },
        },
      },
    });
    expect(preview?.sidekickName).toBe("Yellow Jacket");
  });

  it("rejects anything that isn't a deck", () => {
    const cases: unknown[] = [
      null,
      "a string",
      [],
      { id: "no-deck-data" },
      { deck_data: { cards: [] } }, // no id
      { id: "x", deck_data: { hero: {} } }, // no cards array
      { id: "x", deck_data: { cards: "nope" } },
    ];
    cases.forEach((data) =>
      expect(parseSharedDeck({ id: "c", name: "n", data })).toBeNull(),
    );
  });

  it("drops a cardback url that isn't a plain http(s) image", () => {
    const preview = parseSharedDeck({
      id: "c",
      name: "n",
      data: {
        ...DECK_DATA,
        deck_data: {
          ...DECK_DATA.deck_data,
          appearance: { cardbackUrl: "javascript:alert(1)" },
        },
      },
    });
    expect(preview?.cardbackUrl).toBeUndefined();
  });

  it("falls back through the names a payload might carry", () => {
    const preview = parseSharedDeck({
      id: "c",
      name: "   ",
      data: { ...DECK_DATA, name: undefined },
    });
    expect(preview?.name).toBe("Bruce Lee"); // deck_data.name
  });
});

describe("parseSharedMap", () => {
  it("reads the title, author and image", () => {
    expect(parseSharedMap({ id: "c", name: "Sarah's Attic", data: MAP_DATA })).toMatchObject(
      {
        kind: "map",
        name: "Sarah's Attic",
        author: "Gerry",
        imgUrl: "https://example.com/map.webp",
      },
    );
  });

  it("accepts a repo-relative snapshot url", () => {
    const preview = parseSharedMap({
      id: "c",
      name: "n",
      data: { imgUrl: "/maps/legacy-attic.webp" },
    });
    expect(preview?.imgUrl).toBe("/maps/legacy-attic.webp");
  });

  it("refuses a map whose image url isn't safe to render or store", () => {
    [
      undefined,
      "",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "//evil.example/map.png",
      42,
    ].forEach((imgUrl) =>
      expect(parseSharedMap({ id: "c", name: "n", data: { imgUrl } })).toBeNull(),
    );
  });

  it("agrees with isSafeImageUrl", () => {
    expect(isSafeImageUrl("https://a/b.png")).toBe(true);
    expect(isSafeImageUrl("http://a/b.png")).toBe(true);
    expect(isSafeImageUrl("/maps/x.webp")).toBe(true);
    expect(isSafeImageUrl("ftp://a/b.png")).toBe(false);
  });
});

describe("loadSharedItem", () => {
  it("fetches the public endpoint and previews a deck", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "cloud-id", name: "Bruce Lee", data: DECK_DATA }),
    );

    const load = await loadSharedItem("deck", "cloud-id");

    expect(load.status).toBe("ready");
    expect(load.preview?.kind).toBe("deck");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/share/decks/cloud-id`);
  });

  it("previews a map", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "c", name: "Attic", data: MAP_DATA }));
    const load = await loadSharedItem("map", "c");
    expect(load.status).toBe("ready");
    expect(load.preview?.kind).toBe("map");
  });

  it("reports a dead link as not-found", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));
    await expect(loadSharedItem("deck", "gone")).resolves.toEqual({
      status: "not-found",
      preview: null,
    });
  });

  it("reports an unreachable API as offline, so the copy can differ", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(loadSharedItem("deck", "x")).resolves.toEqual({
      status: "offline",
      preview: null,
    });
  });

  it("treats a payload of the wrong kind as not-found, never a partial import", async () => {
    // A map id pasted into a /share/deck/ link: the API happily returns the
    // row, but it is not a deck and must not reach the bag.
    fetchMock.mockResolvedValue(reply(200, { id: "c", name: "Attic", data: MAP_DATA }));
    await expect(loadSharedItem("deck", "c")).resolves.toEqual({
      status: "not-found",
      preview: null,
    });
  });

  it("never fetches for an empty id", async () => {
    await expect(loadSharedItem("deck", "")).resolves.toEqual({
      status: "not-found",
      preview: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
