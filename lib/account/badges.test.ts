/**
 * `GET /me/badges` + `PUT /me/badges` transport (#577, widened to three in
 * #718).
 *
 * The things worth pinning hardest are the ones a player would actually feel: a
 * 503 must not cost a wearer the badges they already chose (the pick is the
 * API's own storage, not telemetry's), a 422 must be a message rather than an
 * exception — the server owns the unlock check, so it disagreeing with a page
 * left open all afternoon is normal, not a bug — and the ORDER of the list must
 * survive every hop, because it is the player's choice about which badge sits in
 * front on the HUD.
 *
 * The other half of #718 is reading BOTH shapes for a release: this client can
 * be deployed against an API that still answers with a bare `selected` string.
 */
import {
  badgeById,
  fetchBadgeCase,
  normalizeBadgeCase,
  putWornBadges,
  wornBadges,
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
  selected: ["first-win"],
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
    expect(kase.selected).toEqual(["first-win"]);
  });

  it("keeps the worn list in the order the API sent it", () => {
    // Never re-sorted, here or anywhere: slot 1 is the disc in front on the HUD
    // and the order is the player's own statement about their badges.
    const kase = normalizeBadgeCase({
      badges: CATALOG.badges,
      selected: ["veteran", "first-win"],
    });
    expect(kase.selected).toEqual(["veteran", "first-win"]);
  });

  it("reads the pre-#718 bare string as a one-badge list", () => {
    const kase = normalizeBadgeCase({ badges: CATALOG.badges, selected: "veteran" });
    expect(kase.selected).toEqual(["veteran"]);
  });

  it("caps a stored list at three and drops duplicates", () => {
    // A list longer than the shelf can only have come from a client that wasn't
    // this one; three is what we are prepared to render.
    const ids = ["a", "b", "c", "d"];
    const kase = normalizeBadgeCase({
      badges: [...ids, "b"].map((id) => ({ id, unlocked: true })),
      selected: ["a", "b", "b", "c", "d"],
    });
    expect(kase.selected).toEqual(["a", "b", "c"]);
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
    expect(kase.selected).toEqual(["moon-walker"]);
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

  it("drops a selected id the catalog can't back, keeping the rest", () => {
    // Unrenderable and unclearable as a tile; still stored server-side, and the
    // badges either side of it are perfectly wearable.
    expect(
      normalizeBadgeCase({
        badges: CATALOG.badges,
        selected: ["first-win", "ghost", "veteran"],
      }).selected,
    ).toEqual(["first-win", "veteran"]);
    expect(
      normalizeBadgeCase({ badges: [], selected: "ghost" }).selected,
    ).toEqual([]);
  });

  it("degrades a garbled body to an empty case rather than throwing", () => {
    expect(normalizeBadgeCase(null)).toEqual({ badges: [], selected: [] });
    expect(normalizeBadgeCase({ badges: "nope" })).toEqual({
      badges: [],
      selected: [],
    });
    expect(normalizeBadgeCase({ badges: [], selected: [1, null] }).selected).toEqual(
      [],
    );
  });
});

describe("fetchBadgeCase", () => {
  it("returns the case on a 200", async () => {
    fetchMock.mockResolvedValue(reply(200, CATALOG));
    const result = await fetchBadgeCase();
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.selected).toEqual(["first-win"]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("keeps the worn badges through a 503", async () => {
    // The API reports `selected` on its own 503 precisely so a wearer doesn't
    // lose their shelf while telemetry is down.
    fetchMock.mockResolvedValue(
      reply(503, {
        error: "upstream_unavailable",
        selected: ["streak-5", "veteran"],
      }),
    );
    const result = await fetchBadgeCase();
    expect(result).toEqual({
      ok: false,
      reason: "unavailable",
      selected: ["streak-5", "veteran"],
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
        selected: [],
      });
    }
  });

  it("treats an unreachable API as unavailable, never as an error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fetchBadgeCase()).resolves.toEqual({
      ok: false,
      reason: "unavailable",
      selected: [],
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
      selected: [],
    });
  });
});

describe("putWornBadges", () => {
  it("sends the whole ordered list and trusts the server's echo", async () => {
    const ids = ["first-win", "veteran"];
    fetchMock.mockResolvedValue(reply(200, { selected: ids }));
    await expect(putWornBadges(ids)).resolves.toEqual({
      ok: true,
      selected: ids,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/me\/badges$/);
    expect(init).toMatchObject({ method: "PUT", credentials: "include" });
    expect(JSON.parse(init.body)).toEqual({ ids });
  });

  it("clears with an explicit empty list, not an omitted key", async () => {
    // Clearing is the one write the API honours with telemetry down, and it
    // only recognises `{"ids":[]}`.
    fetchMock.mockResolvedValue(reply(200, { selected: [] }));
    await expect(putWornBadges([])).resolves.toEqual({
      ok: true,
      selected: [],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ ids: [] });
  });

  it("takes the server's answer over its own when the two differ", async () => {
    // Only happens if something moved under us — and the server's answer is the
    // one that is actually stored.
    fetchMock.mockResolvedValue(reply(200, { selected: ["veteran"] }));
    await expect(
      putWornBadges(["first-win", "veteran"]),
    ).resolves.toEqual({ ok: true, selected: ["veteran"] });
  });

  it("reads a 422 as locked rather than as a failure to explain", async () => {
    fetchMock.mockResolvedValue(reply(422, { error: "not_unlocked" }));
    await expect(putWornBadges(["veteran"])).resolves.toEqual({
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
      await expect(putWornBadges(["veteran"])).resolves.toEqual({
        ok: false,
        reason,
      });
    }
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(putWornBadges(["veteran"])).resolves.toEqual({
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
    await expect(putWornBadges(["first-win"])).resolves.toEqual({
      ok: true,
      selected: ["first-win"],
    });
  });
});

describe("wornBadges", () => {
  it("resolves the worn ids to catalog rows, in worn order", () => {
    const { badges } = normalizeBadgeCase(CATALOG);
    expect(
      wornBadges(badges, ["veteran", "first-win"]).map((badge) => badge.name),
    ).toEqual(["Veteran", "First Blood"]);
  });

  it("skips an id with no row rather than leaving a hole", () => {
    const { badges } = normalizeBadgeCase(CATALOG);
    expect(wornBadges(badges, ["ghost", "veteran"]).map((b) => b.id)).toEqual([
      "veteran",
    ]);
    expect(wornBadges(badges, [])).toEqual([]);
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
