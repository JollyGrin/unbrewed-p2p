/**
 * `GET /me/badges` + `PUT /me/badge` transport (#577).
 *
 * The two things worth pinning hardest are the ones a player would actually
 * feel: a 503 must not cost a wearer the badge they already chose (the pick is
 * the API's own storage, not telemetry's), and a 422 must be a message rather
 * than an exception — the server owns the unlock check, so it disagreeing with
 * a page left open all afternoon is normal, not a bug.
 */
import {
  badgeById,
  fetchBadgeCase,
  normalizeBadgeCase,
  putSelectedBadge,
} from "./badges";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const CATALOG = {
  badges: [
    {
      id: "first-win",
      name: "First Blood",
      blurb: "Won your first game.",
      unlocked: true,
      unlockedWhy: "Win a game (1/1)",
    },
    {
      id: "veteran",
      name: "Veteran",
      blurb: "A hundred games deep.",
      unlocked: false,
      unlockedWhy: "Play 100 games (12/100)",
    },
  ],
  selected: "first-win",
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizeBadgeCase", () => {
  it("keeps the API's catalog order and its evaluated flags", () => {
    const kase = normalizeBadgeCase(CATALOG);
    expect(kase.badges.map((badge) => badge.id)).toEqual([
      "first-win",
      "veteran",
    ]);
    expect(kase.badges[0].unlocked).toBe(true);
    expect(kase.badges[1].unlockedWhy).toBe("Play 100 games (12/100)");
    expect(kase.selected).toBe("first-win");
  });

  it("keeps an id it has never heard of — the catalog is the server's", () => {
    // Forward compat: a badge added API-side must still reach the grid, where
    // it renders with the fallback glyph and the API's own name.
    const kase = normalizeBadgeCase({
      badges: [
        { id: "moon-walker", name: "Moon Walker", blurb: "?", unlocked: true, unlockedWhy: "" },
      ],
      selected: "moon-walker",
    });
    expect(kase.badges).toHaveLength(1);
    expect(kase.selected).toBe("moon-walker");
  });

  it("drops rows with no id and de-duplicates the rest", () => {
    const kase = normalizeBadgeCase({
      badges: [
        { name: "nameless" },
        { id: "regular", name: "Regular" },
        { id: "regular", name: "Regular again" },
      ],
    });
    expect(kase.badges).toHaveLength(1);
    // A row missing its text still renders — falling back to the id beats a hole.
    expect(kase.badges[0]).toMatchObject({ id: "regular", blurb: "", unlocked: false });
  });

  it("reads a selection the catalog can't back as wearing nothing", () => {
    // Unrenderable and unclearable as a tile; still stored server-side.
    expect(normalizeBadgeCase({ badges: [], selected: "ghost" }).selected).toBeNull();
  });

  it("degrades a garbled body to an empty case rather than throwing", () => {
    expect(normalizeBadgeCase(null)).toEqual({ badges: [], selected: null });
    expect(normalizeBadgeCase({ badges: "nope" })).toEqual({
      badges: [],
      selected: null,
    });
  });
});

describe("fetchBadgeCase", () => {
  it("returns the case on a 200", async () => {
    fetchMock.mockResolvedValue(reply(200, CATALOG));
    const result = await fetchBadgeCase();
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.selected).toBe("first-win");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("keeps the worn badge through a 503", async () => {
    // The API reports `selected` on its own 503 precisely so a wearer doesn't
    // lose their chip while telemetry is down.
    fetchMock.mockResolvedValue(
      reply(503, { error: "upstream_unavailable", selected: "streak-5" }),
    );
    const result = await fetchBadgeCase();
    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      selected: "streak-5",
    });
  });

  it("maps each failure to its reason without throwing", async () => {
    for (const [status, reason] of [
      [401, "unauthorized"],
      [429, "rate_limited"],
      [500, "unavailable"],
    ] as const) {
      fetchMock.mockResolvedValue(reply(status, {}));
      await expect(fetchBadgeCase()).resolves.toEqual({
        ok: false,
        reason,
        selected: null,
      });
    }
  });

  it("treats an unreachable API as unavailable, never as an error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchBadgeCase()).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      selected: null,
    });
  });

  it("survives a failure body that isn't JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError("not json");
      },
    } as unknown as Response);
    await expect(fetchBadgeCase()).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      selected: null,
    });
  });
});

describe("putSelectedBadge", () => {
  it("sends the pick and trusts the server's echo", async () => {
    fetchMock.mockResolvedValue(reply(200, { selected: "first-win" }));
    await expect(putSelectedBadge("first-win")).resolves.toEqual({
      ok: true,
      selected: "first-win",
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ id: "first-win" });
  });

  it("clears with an explicit null, not an omitted key", async () => {
    // Clearing is the one write the API honours with telemetry down, and it
    // only recognises `{"id":null}`.
    fetchMock.mockResolvedValue(reply(200, { selected: null }));
    await expect(putSelectedBadge(null)).resolves.toEqual({
      ok: true,
      selected: null,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: null });
  });

  it("reads a 422 as locked rather than as a failure to explain", async () => {
    fetchMock.mockResolvedValue(reply(422, { error: "not_unlocked" }));
    await expect(putSelectedBadge("veteran")).resolves.toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("maps the rest of the failures without throwing", async () => {
    for (const [status, reason] of [
      [401, "unauthorized"],
      [429, "rate_limited"],
      // Setting a badge needs telemetry to check the unlock, so it fails closed.
      [503, "unavailable"],
      [400, "unavailable"],
    ] as const) {
      fetchMock.mockResolvedValue(reply(status, {}));
      await expect(putSelectedBadge("veteran")).resolves.toEqual({
        ok: false,
        reason,
      });
    }
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(putSelectedBadge("veteran")).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("counts a 200 with no readable body as the write it asked for", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("no body");
      },
    } as unknown as Response);
    await expect(putSelectedBadge("first-win")).resolves.toEqual({
      ok: true,
      selected: "first-win",
    });
  });
});

describe("badgeById", () => {
  it("finds a row, and answers nothing for no selection", () => {
    const { badges } = normalizeBadgeCase(CATALOG);
    expect(badgeById(badges, "veteran")?.name).toBe("Veteran");
    expect(badgeById(badges, null)).toBeUndefined();
    expect(badgeById(badges, "nope")).toBeUndefined();
  });
});
