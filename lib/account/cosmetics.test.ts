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
  HeroCosmetics,
  cardTier,
  displayedCardTier,
  displayedCards,
  displayedTokenTier,
  emptyHeroCosmetics,
  fetchCosmetics,
  nextTierCost,
  normalizeCosmetics,
  postSpend,
  putCardRims,
  putTokenRim,
  rimProgress,
  rimTierName,
  topCardTier,
  wireLoadoutFor,
} from "./cosmetics";
import { encodeCosmetics } from "@/lib/pro/cosmeticsWire";

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

  it("treats a missing `cardRims` field as ON — an API older than the pref (#627)", () => {
    // Backward compat with teeth: a player who bought rims before the pref
    // existed must keep wearing them, so only an explicit `false` hides them.
    expect(normalizeCosmetics(okBody([heroBody()])).heroes[0].cardRims).toEqual({
      enabled: true,
      selectedTier: null,
    });
    expect(
      normalizeCosmetics(okBody([heroBody({ cardRims: {} })])).heroes[0].cardRims,
    ).toEqual({ enabled: true, selectedTier: null });
    expect(
      normalizeCosmetics(okBody([heroBody({ cardRims: { enabled: false } })])).heroes[0]
        .cardRims,
    ).toEqual({ enabled: false, selectedTier: null });
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

  /**
   * The three-state tier field (#705). Which of them is sent decides whether a
   * plain on/off flip quietly re-picks a player's tier, so it is pinned here
   * rather than left to the caller to remember.
   */
  it("omits the tier when nothing was picked, and sends it when something was", async () => {
    mockFetch().mockResolvedValue(reply(200, {}));
    const bodyOf = (call: number) => JSON.parse(mockFetch().mock.calls[call][1].body);

    await putTokenRim("thetis", true);
    // ABSENT, not null: the server leaves the stored choice alone.
    expect(bodyOf(0)).toEqual({ heroId: "thetis", enabled: true });
    expect("selectedTier" in bodyOf(0)).toBe(false);

    await putTokenRim("thetis", true, 2);
    expect(bodyOf(1)).toEqual({ heroId: "thetis", enabled: true, selectedTier: 2 });

    // Explicit null is the "latest" reset — a different thing from omitting.
    await putTokenRim("thetis", true, null);
    expect(bodyOf(2)).toEqual({ heroId: "thetis", enabled: true, selectedTier: null });

    // A pick made while the rim is OFF is still stored.
    await putCardRims("thetis", false, 1);
    expect(bodyOf(3)).toEqual({ heroId: "thetis", enabled: false, selectedTier: 1 });
  });
});

describe("putCardRims", () => {
  it("sends the pref to its own endpoint and reports the outcome", async () => {
    mockFetch().mockResolvedValue(reply(200, {}));
    expect(await putCardRims("thetis", false)).toEqual({ ok: true });
    const [url, init] = mockFetch().mock.calls[0];
    expect(url).toContain("/me/cosmetics/card-rims");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ heroId: "thetis", enabled: false });

    mockFetch().mockResolvedValue(reply(503, {}));
    expect(await putCardRims("thetis", true)).toEqual({ ok: false, reason: "unavailable" });
    mockFetch().mockResolvedValue(reply(401, {}));
    expect(await putCardRims("thetis", true)).toEqual({ ok: false, reason: "unauthorized" });
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

/**
 * The tier PICKER (#705): a player who unlocked gold may keep wearing the
 * silver they liked. Everything below is about that choice never becoming a
 * claim — it may only ever take a rim DOWN, and the switch still wins.
 */
describe("the selected tier", () => {
  const hero = (over: Record<string, unknown> = {}): HeroCosmetics =>
    normalizeCosmetics(okBody([heroBody(over)])).heroes[0];

  it("round-trips a stored choice, and reads an absent one as latest", () => {
    const picked = hero({
      tokenRim: { unlockedTier: 4, enabled: true, selectedTier: 2 },
      cardRims: { enabled: true, selectedTier: 1 },
    });
    expect(picked.tokenRim.selectedTier).toBe(2);
    expect(picked.cardRims.selectedTier).toBe(1);

    // An API that predates the field — which is prod on the day this merges.
    const legacy = hero();
    expect(legacy.tokenRim.selectedTier).toBeNull();
    expect(legacy.cardRims.selectedTier).toBeNull();

    // Junk, an explicit null and a 0 all mean "latest" rather than "tier 0":
    // there is no tier 0 to wear, and the ladder is 1-based everywhere else.
    for (const value of [null, 0, -3, "2", NaN, {}]) {
      expect(
        hero({ tokenRim: { unlockedTier: 4, enabled: true, selectedTier: value } })
          .tokenRim.selectedTier,
      ).toBeNull();
    }
  });

  it("clamps a selection ABOVE what was unlocked back down to the unlock", () => {
    // The one case that would hand somebody a rim they never earned: a stale
    // page, or a row written before a clawback.
    expect(
      displayedTokenTier(
        hero({ tokenRim: { unlockedTier: 2, enabled: true, selectedTier: 4 } }),
      ),
    ).toBe(2);
  });

  it("wears the selection when it is below the unlock, and latest when there is none", () => {
    expect(
      displayedTokenTier(
        hero({ tokenRim: { unlockedTier: 3, enabled: true, selectedTier: 1 } }),
      ),
    ).toBe(1);
    // null = latest = exactly what shipped before this existed.
    expect(
      displayedTokenTier(hero({ tokenRim: { unlockedTier: 3, enabled: true } })),
    ).toBe(3);
  });

  it("lets the switch win: enabled=false wears nothing, whatever was picked", () => {
    expect(
      displayedTokenTier(
        hero({ tokenRim: { unlockedTier: 4, enabled: false, selectedTier: 2 } }),
      ),
    ).toBe(0);
    const off = hero({ cardRims: { enabled: false, selectedTier: 2 } });
    expect(displayedCardTier(off, 2)).toBe(0);
    expect(displayedCards(off)).toEqual([]);
  });

  it("wears nothing on a rim telemetry could not confirm, selection or not", () => {
    // `unlockedTier: null` is "we don't know". A stored choice is not evidence.
    expect(
      displayedTokenTier(
        hero({ tokenRim: { unlockedTier: null, enabled: true, selectedTier: 3 } }),
      ),
    ).toBe(0);
  });

  it("caps card rims per card without ever promoting one", () => {
    const capped = hero({
      cards: [
        { key: "undertow", tier: 4 },
        { key: "riptide", tier: 1 },
      ],
      cardRims: { enabled: true, selectedTier: 2 },
    });
    // The tier-4 card drops to silver; the bronze card stays bronze — a
    // ceiling, never a promotion.
    expect(displayedCards(capped)).toEqual([
      { key: "undertow", tier: 2 },
      { key: "riptide", tier: 1 },
    ]);
    // And what was BOUGHT is untouched, so /collection keeps showing tier 4.
    expect(cardTier(capped, "undertow")).toBe(4);
    expect(topCardTier(capped)).toBe(4);
  });

  it("publishes the SELECTED tier to the other seat — the whole point (#705)", () => {
    // No wire, protocol or opponent-render change: the number the encoder has
    // always carried is "the tier to paint", so picking silver publishes
    // silver and the opponent paints silver.
    const picked = [
      hero({
        cards: [{ key: "undertow", tier: 4 }],
        tokenRim: { unlockedTier: 4, enabled: true, selectedTier: 2 },
        cardRims: { enabled: true, selectedTier: 2 },
      }),
    ];
    expect(wireLoadoutFor(picked, "thetis")).toEqual({
      tokenRimTier: 2,
      cards: [{ key: "undertow", tier: 2 }],
    });
    // The encoder hashes card keys, so the blob is compared against the blob
    // a player who had only ever OWNED silver would send: byte-identical, by
    // construction — which is why the other seat needs no change at all.
    expect(encodeCosmetics(wireLoadoutFor(picked, "thetis"))).toBe(
      encodeCosmetics({ tokenRimTier: 2, cards: [{ key: "undertow", tier: 2 }] }),
    );
  });
});

/**
 * `wireLoadoutFor` (#615) — the second consumer of this module. What is pinned
 * here is what a player PUBLISHES to the other seat, so every case is about
 * claiming neither more nor less than they actually own.
 */
describe("wireLoadoutFor — the equip wire's projection", () => {
  const heroes = normalizeCosmetics(
    okBody([
      heroBody(),
      heroBody({ heroId: "thrall", cards: [], tokenRim: { unlockedTier: 3, enabled: true } }),
    ]),
  ).heroes;

  it("projects a hero's cards and enabled rim into the encoder's shape", () => {
    expect(wireLoadoutFor(heroes, "thetis")).toEqual({
      tokenRimTier: 2,
      cards: [{ key: "undertow", tier: 2 }],
    });
  });

  it("publishes a rim with no cards, and cards with no rim", () => {
    expect(wireLoadoutFor(heroes, "thrall")).toEqual({ tokenRimTier: 3, cards: [] });
    const rimless = normalizeCosmetics(
      okBody([heroBody({ tokenRim: { unlockedTier: 4, enabled: false } })]),
    ).heroes;
    expect(wireLoadoutFor(rimless, "thetis")).toEqual({
      tokenRimTier: 0,
      cards: [{ key: "undertow", tier: 2 }],
    });
  });

  it("does not publish a rim the player switched OFF", () => {
    // `enabled` is the /collection opt-out. Honouring it here is what makes
    // that switch mean something to the opponent.
    const off = normalizeCosmetics(
      okBody([heroBody({ cards: [], tokenRim: { unlockedTier: 4, enabled: false } })]),
    ).heroes;
    expect(wireLoadoutFor(off, "thetis")).toBeNull();
  });

  it("does not publish a rim telemetry could not confirm", () => {
    // On the degraded 503 body `unlockedTier` is null — "we don't know" — and
    // claiming a tier off that would show a rim nobody had earned. The card
    // rows are the API's OWN storage, so they still publish.
    const degraded = normalizeCosmetics(
      okBody([heroBody({ tokenRim: { unlockedTier: null, enabled: true } })]),
    ).heroes;
    expect(wireLoadoutFor(degraded, "thetis")).toEqual({
      tokenRimTier: 0,
      cards: [{ key: "undertow", tier: 2 }],
    });
    const nothingElse = normalizeCosmetics(
      okBody([heroBody({ cards: [], tokenRim: { unlockedTier: null, enabled: true } })]),
    ).heroes;
    expect(wireLoadoutFor(nothingElse, "thetis")).toBeNull();
  });

  it("publishes ZERO card entries when card rims are switched off (#627)", () => {
    // A MIXED loadout: two upgraded cards and an unlocked, worn token rim. The
    // card switch drops every card entry and leaves the token rim alone —
    // "play without cosmetics" must not cost the rim you earned.
    const mixed = normalizeCosmetics(
      okBody([
        heroBody({
          cards: [
            { key: "undertow", tier: 2 },
            { key: "riptide", tier: 4 },
          ],
          tokenRim: { unlockedTier: 2, enabled: true },
          cardRims: { enabled: false },
        }),
      ]),
    ).heroes;
    expect(wireLoadoutFor(mixed, "thetis")).toEqual({ tokenRimTier: 2, cards: [] });
    // Still a valid, token-only blob — the very shape a rim-with-no-cards
    // player already publishes.
    expect(encodeCosmetics(wireLoadoutFor(mixed, "thetis"))).toBe("c1;t2");
  });

  it("publishes nothing at all when BOTH switches are off, cards owned or not", () => {
    const off = normalizeCosmetics(
      okBody([
        heroBody({
          tokenRim: { unlockedTier: 4, enabled: false },
          cardRims: { enabled: false },
        }),
      ]),
    ).heroes;
    expect(wireLoadoutFor(off, "thetis")).toBeNull();
    expect(encodeCosmetics(wireLoadoutFor(off, "thetis"))).toBeUndefined();
  });

  it("keeps the two switches independent — the token rim is unaffected", () => {
    const cardsOnly = normalizeCosmetics(
      okBody([
        heroBody({
          tokenRim: { unlockedTier: 3, enabled: false },
          cardRims: { enabled: true },
        }),
      ]),
    ).heroes;
    expect(wireLoadoutFor(cardsOnly, "thetis")).toEqual({
      tokenRimTier: 0,
      cards: [{ key: "undertow", tier: 2 }],
    });
  });

  it("publishes every owned card when the field is absent — an older API (#627)", () => {
    const legacy = normalizeCosmetics(okBody([heroBody()])).heroes;
    expect(wireLoadoutFor(legacy, "thetis")).toEqual({
      tokenRimTier: 2,
      cards: [{ key: "undertow", tier: 2 }],
    });
  });

  it("falls a spice remix back to its base hero, like the debug registry does", () => {
    expect(wireLoadoutFor(heroes, "thetis-spice")).toEqual(wireLoadoutFor(heroes, "thetis"));
  });

  it("answers null for an unknown hero, no hero, and no payload", () => {
    expect(wireLoadoutFor(heroes, "king-kong")).toBeNull();
    expect(wireLoadoutFor(heroes, "king-kong-spice")).toBeNull();
    expect(wireLoadoutFor(heroes, null)).toBeNull();
    expect(wireLoadoutFor(heroes, "")).toBeNull();
    expect(wireLoadoutFor(null, "thetis")).toBeNull();
    expect(wireLoadoutFor([], "thetis")).toBeNull();
  });

  it("matches a hero id whatever case or padding it arrives in", () => {
    expect(wireLoadoutFor(heroes, "  THETIS ")).toEqual(wireLoadoutFor(heroes, "thetis"));
  });
});
