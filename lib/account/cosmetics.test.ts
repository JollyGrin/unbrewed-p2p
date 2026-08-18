/**
 * The cosmetics fetch layer (#614). These pin the three things that could cost
 * a player something real:
 *
 *  - a 503 must NOT read as a wipe: its body carries the stored ledger, and the
 *    telemetry-derived numbers come back as `null` ("we don't know"), never 0;
 *  - a refused spend must say WHY, in the server's own numbers, because a 422
 *    is honestly reachable from a stale page rather than being a bug;
 *  - a 200 whose body we can't parse still means the points are gone, so it
 *    must never invite a second (double-charging) click.
 */
import {
  FALLBACK_CONSTANTS,
  cardTier,
  emptyHeroCosmetics,
  fetchCosmetics,
  nextTierCost,
  normalizeCosmetics,
  postSpend,
  putTokenRim,
  rimProgress,
  rimTierName,
} from "./cosmetics";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const heroBody = (over: Record<string, unknown> = {}) => ({
  heroId: "thetis",
  earned: 900,
  spent: 200,
  adjusted: 0,
  available: 700,
  cards: [{ key: "undertow", tier: 2 }],
  tokenRim: { unlockedTier: 2, enabled: true },
  ...over,
});

const okBody = (heroes: unknown[] = [heroBody()]) => ({
  heroes,
  constants: { cardTierCosts: [50, 150, 400, 1000], tokenRimThresholds: [250, 750, 2000, 5000] },
});

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch;
});
afterEach(() => jest.resetAllMocks());

const mockFetch = () => global.fetch as jest.Mock;

describe("normalizeCosmetics", () => {
  it("reads a hero block, keeping the API's order", () => {
    const payload = normalizeCosmetics(
      okBody([heroBody(), heroBody({ heroId: "thrall", earned: 10 })]),
    );
    expect(payload.heroes.map((h) => h.heroId)).toEqual(["thetis", "thrall"]);
    expect(payload.heroes[0]).toMatchObject({
      earned: 900,
      available: 700,
      spent: 200,
      cards: [{ key: "undertow", tier: 2 }],
      tokenRim: { unlockedTier: 2, enabled: true },
    });
  });

  it("keeps `null` distinct from 0 on the degraded body", () => {
    const hero = normalizeCosmetics(
      okBody([heroBody({ earned: null, available: null, tokenRim: { unlockedTier: null, enabled: true } })]),
    ).heroes[0];
    expect(hero.earned).toBeNull();
    expect(hero.available).toBeNull();
    expect(hero.tokenRim.unlockedTier).toBeNull();
    // The stored half survives the outage untouched.
    expect(hero.spent).toBe(200);
    expect(hero.cards).toEqual([{ key: "undertow", tier: 2 }]);
    expect(hero.tokenRim.enabled).toBe(true);
  });

  it("drops junk rows and duplicate ids rather than rendering them twice", () => {
    const payload = normalizeCosmetics(
      okBody([heroBody(), heroBody({ earned: 1 }), { earned: 5 }, null]),
    );
    expect(payload.heroes).toHaveLength(1);
    expect(payload.heroes[0].earned).toBe(900);
  });

  it("drops an unbought (tier 0) or keyless card row", () => {
    const hero = normalizeCosmetics(
      okBody([heroBody({ cards: [{ key: "feint", tier: 0 }, { tier: 2 }, { key: "feint", tier: 1 }] })]),
    ).heroes[0];
    expect(hero.cards).toEqual([{ key: "feint", tier: 1 }]);
  });

  it("falls back to the known economy when the API publishes none", () => {
    expect(normalizeCosmetics({ heroes: [] }).constants).toEqual(FALLBACK_CONSTANTS);
    expect(normalizeCosmetics({ constants: { cardTierCosts: [] } }).constants).toEqual(
      FALLBACK_CONSTANTS,
    );
  });
});

describe("fetchCosmetics", () => {
  it("returns the payload on 200", async () => {
    mockFetch().mockResolvedValue(reply(200, okBody()));
    const result = await fetchCosmetics();
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.heroes[0].earned).toBe(900);
  });

  it("keeps the ledger a 503 carries", async () => {
    mockFetch().mockResolvedValue(
      reply(503, okBody([heroBody({ earned: null, available: null })])),
    );
    const result = await fetchCosmetics();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unavailable");
    expect(result.degraded?.heroes[0].cards).toEqual([{ key: "undertow", tier: 2 }]);
    expect(result.degraded?.heroes[0].earned).toBeNull();
  });

  it("maps 401 and 429, and a network failure, without a body", async () => {
    mockFetch().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("no body");
      },
    } as unknown as Response);
    expect(await fetchCosmetics()).toEqual({
      ok: false,
      reason: "unauthorized",
      degraded: null,
    });

    mockFetch().mockResolvedValue(reply(429, {}));
    expect((await fetchCosmetics()) as { reason: string }).toMatchObject({
      reason: "rate_limited",
    });

    mockFetch().mockRejectedValue(new Error("offline"));
    expect(await fetchCosmetics()).toEqual({
      ok: false,
      reason: "unavailable",
      degraded: null,
    });
  });
});

describe("postSpend", () => {
  it("answers the hero's whole block on success", async () => {
    mockFetch().mockResolvedValue(reply(200, { hero: heroBody({ available: 550 }) }));
    const result = await postSpend("thetis", "undertow", 3);
    expect(result.ok).toBe(true);
    expect(result.ok && result.hero.available).toBe(550);
    const [, init] = mockFetch().mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ heroId: "thetis", cardKey: "undertow", tier: 3 });
  });

  it("explains an insufficient-points 422 with the server's numbers", async () => {
    mockFetch().mockResolvedValue(
      reply(422, { error: "insufficient_points", cost: 400, available: 120 }),
    );
    const result = await postSpend("thetis", "undertow", 3);
    expect(result).toMatchObject({ ok: false, reason: "insufficient_points" });
    expect(!result.ok && result.message).toContain("400");
    expect(!result.ok && result.message).toContain("120");
  });

  it("explains an out-of-sequence 422 by naming the real next tier", async () => {
    mockFetch().mockResolvedValue(
      reply(422, { error: "invalid_tier", currentTier: 2, nextTier: 3 }),
    );
    const result = await postSpend("thetis", "undertow", 2);
    expect(result).toMatchObject({ ok: false, reason: "invalid_tier" });
    expect(!result.ok && result.message).toContain("tier 3");
  });

  it("never invites a second click after a 200 it couldn't parse", async () => {
    mockFetch().mockResolvedValue(reply(200, { hero: null }));
    const result = await postSpend("thetis", "undertow", 1);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/reload/i);
  });

  it("fails closed when the API is unreachable", async () => {
    mockFetch().mockRejectedValue(new Error("offline"));
    expect(await postSpend("thetis", "undertow", 1)).toMatchObject({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("putTokenRim", () => {
  it("sends the pref and reports the outcome", async () => {
    mockFetch().mockResolvedValue(reply(200, {}));
    expect(await putTokenRim("thetis", false)).toEqual({ ok: true });
    const [url, init] = mockFetch().mock.calls[0];
    expect(url).toContain("/me/cosmetics/token-rim");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ heroId: "thetis", enabled: false });

    mockFetch().mockResolvedValue(reply(503, {}));
    expect(await putTokenRim("thetis", true)).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("presentation helpers", () => {
  it("names the rim ladder, clamping a tier newer than this client", () => {
    expect(rimTierName(0)).toBeNull();
    expect(rimTierName(null)).toBeNull();
    expect(rimTierName(1)).toBe("bronze");
    expect(rimTierName(4)).toBe("iridescent");
    expect(rimTierName(9)).toBe("iridescent");
  });

  it("prices the NEXT step, and nothing past the ceiling", () => {
    expect(nextTierCost(FALLBACK_CONSTANTS, 0)).toBe(50);
    expect(nextTierCost(FALLBACK_CONSTANTS, 3)).toBe(1000);
    expect(nextTierCost(FALLBACK_CONSTANTS, 4)).toBeNull();
  });

  it("reads a card's tier off a mixed deck", () => {
    const hero = normalizeCosmetics(okBody()).heroes[0];
    expect(cardTier(hero, "undertow")).toBe(2);
    expect(cardTier(hero, "feint")).toBe(0);
  });

  it("measures rim progress against EARNED points", () => {
    const thresholds = FALLBACK_CONSTANTS.tokenRimThresholds;
    expect(rimProgress(0, thresholds)).toMatchObject({ tier: 0, nextThreshold: 250, toGo: 250, percent: 0 });
    expect(rimProgress(500, thresholds)).toMatchObject({ tier: 1, nextThreshold: 750, toGo: 250 });
    expect(rimProgress(500, thresholds).percent).toBe(50);
    expect(rimProgress(9000, thresholds)).toMatchObject({ tier: 4, nextThreshold: null, toGo: null, percent: 100 });
  });

  it("answers 'unknown', not 'none', while points are unavailable", () => {
    expect(rimProgress(null, FALLBACK_CONSTANTS.tokenRimThresholds)).toMatchObject({
      tier: null,
      toGo: null,
    });
    expect(emptyHeroCosmetics("thetis", false)).toMatchObject({
      earned: null,
      available: null,
      tokenRim: { unlockedTier: null, enabled: false },
    });
    expect(emptyHeroCosmetics("thetis", true)).toMatchObject({
      earned: 0,
      available: 0,
      tokenRim: { unlockedTier: 0, enabled: false },
    });
  });
});
