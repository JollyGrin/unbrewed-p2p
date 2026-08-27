/**
 * The public profile transport (#590).
 *
 * The normalizer is where a hostile or simply older API meets the UI, so these
 * pin the boundary rather than the happy path: a payload naming nobody is a
 * miss, the progression fields survive whichever of the two places they arrive
 * in, and every failure is a typed reason instead of a throw.
 */
import {
  fetchPublicGames,
  fetchPublicProfile,
  normalizePublicProfile,
  profileHref,
} from "./publicProfile";
import { API_URL } from "./apiUrl";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const PAYLOAD = {
  user: { username: "Emyrk", avatarUrl: "https://cdn/x.png" },
  level: 5,
  xp: 1800,
  xpForNext: 2100,
  selectedBadge: "first-win",
  badges: [
    {
      id: "first-win",
      name: "First Blood",
      blurb: "Won your first game.",
      unlocked: true,
      unlockedWhy: "Win a game (1/1)",
    },
  ],
  stats: { totalGames: 12, wins: 7, losses: 4, draws: 1 },
};

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizePublicProfile", () => {
  it("reads the whole payload, badge selection included", () => {
    const profile = normalizePublicProfile(PAYLOAD)!;

    expect(profile.username).toBe("Emyrk");
    expect(profile.avatarUrl).toBe("https://cdn/x.png");
    // `selectedBadge` on the wire, `selected` in the badge-case shape the
    // components already speak.
    expect(profile.badges.selected).toEqual(["first-win"]);
    expect(profile.badges.badges).toHaveLength(1);
    expect(profile.stats.totalGames).toBe(12);
    expect(profile.stats.level).toBe(5);
  });

  it("takes the progression from the stats block when the top level omits it", () => {
    const profile = normalizePublicProfile({
      ...PAYLOAD,
      level: undefined,
      xp: undefined,
      xpForNext: undefined,
      stats: { ...PAYLOAD.stats, level: 3, xp: 700, xpForNext: 800 },
    })!;

    expect(profile.stats.level).toBe(3);
    expect(profile.stats.xp).toBe(700);
  });

  it("keeps level absent — not zero — when neither place has it", () => {
    const profile = normalizePublicProfile({ ...PAYLOAD, level: undefined, xp: undefined, xpForNext: undefined })!;
    // null is what hides the level bar; a 0 would claim the player is level 0.
    expect(profile.stats.level).toBeNull();
  });

  it("is a miss when the payload names nobody", () => {
    expect(normalizePublicProfile({ user: {} })).toBeNull();
    expect(normalizePublicProfile(null)).toBeNull();
    expect(normalizePublicProfile("nonsense")).toBeNull();
  });

  it("survives a selection naming a badge the catalog didn't send", () => {
    const profile = normalizePublicProfile({ ...PAYLOAD, selectedBadge: "ghost" })!;
    expect(profile.badges.selected).toEqual([]);
  });

  it("prefers the ordered `selectedBadges` array when the API sends it", () => {
    // #718: the plural field is the new shape; `selectedBadge` rides along as
    // slot 1 for a release, and must lose to it.
    const profile = normalizePublicProfile({
      ...PAYLOAD,
      badges: [
        ...PAYLOAD.badges,
        { id: "veteran", name: "Veteran", blurb: "", unlocked: true, unlockedWhy: "" },
      ],
      selectedBadge: "first-win",
      selectedBadges: ["veteran", "first-win"],
    })!;
    expect(profile.badges.selected).toEqual(["veteran", "first-win"]);
  });
});

describe("fetchPublicProfile", () => {
  it("asks the public route with no credentials", async () => {
    fetchMock.mockResolvedValue(reply(200, PAYLOAD));

    const result = await fetchPublicProfile("Emyrk");

    expect(result).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/players?u=Emyrk`,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  it("escapes a username that isn't URL-safe", async () => {
    fetchMock.mockResolvedValue(reply(404, {}));

    await fetchPublicProfile("a b&c");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/players?u=a%20b%26c`);
  });

  it.each([
    [404, "not_found"],
    [429, "rate_limited"],
    [503, "unavailable"],
    [500, "unavailable"],
  ])("turns %s into %s", async (status, reason) => {
    fetchMock.mockResolvedValue(reply(status, {}));
    expect(await fetchPublicProfile("Emyrk")).toEqual({ ok: false, reason });
  });

  it("treats a 200 that names nobody as a miss", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: {} }));
    expect(await fetchPublicProfile("Emyrk")).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("never throws on a dead API", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchPublicProfile("Emyrk")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("fetchPublicGames", () => {
  it("sends the username, the page size and the cursor", async () => {
    fetchMock.mockResolvedValue(reply(200, { games: [], nextBefore: null }));

    await fetchPublicGames("Emyrk", { limit: 20, before: "cursor-1" });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe("/players/games");
    expect(url.searchParams.get("u")).toBe("Emyrk");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("before")).toBe("cursor-1");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit" });
  });

  it("omits the cursor on the first page", async () => {
    fetchMock.mockResolvedValue(reply(200, { games: [], nextBefore: null }));

    await fetchPublicGames("Emyrk", { before: null });

    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.has("before")).toBe(
      false,
    );
  });

  it("folds every failure into a quiet reason", async () => {
    fetchMock.mockResolvedValue(reply(503, {}));
    expect(await fetchPublicGames("Emyrk")).toEqual({
      ok: false,
      reason: "unavailable",
    });

    fetchMock.mockRejectedValue(new TypeError("nope"));
    expect(await fetchPublicGames("Emyrk")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("profileHref", () => {
  it("is a query param, because the site is statically exported", () => {
    expect(profileHref("JollyGrin")).toBe("/stats?u=JollyGrin");
    expect(profileHref("a b")).toBe("/stats?u=a%20b");
  });
});
