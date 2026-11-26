/**
 * Client A/B experiments (#1611): runs against the real analytics wrapper with
 * posthog-js mocked, so consent, availability and `track`'s return value are the
 * real ones.
 */
const capture = jest.fn();
let distinctId = "anon-1";
jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    capture: (...a: unknown[]) => capture(...a),
    identify: (id: string) => {
      distinctId = id;
    },
    setPersonProperties: jest.fn(),
    opt_out_capturing: jest.fn(),
    opt_in_capturing: jest.fn(),
    has_opted_out_capturing: () => false,
    get_distinct_id: () => distinctId,
    get_property: () => undefined,
    register: jest.fn(),
    reset: () => {
      distinctId = "anon-2";
    },
  },
}));

type Analytics = typeof import("./analytics");
type Experiments = typeof import("./experiments");
type Account = typeof import("./account/useAccount");
type Recent = typeof import("./pro/recentRooms");

const STORAGE_KEY = "unbrewed-exp";
const ORIGINAL_ENV = process.env.NODE_ENV;
const flush = () => new Promise((r) => setTimeout(r, 0));

let a: Analytics;
let x: Experiments;
let account: Account;
let recent: Recent;

/** Fresh modules (a page load). `consent` "seen" also boots the mocked PostHog. */
const load = async ({
  key = "phc_test" as string | null,
  consent = "seen",
}: { key?: string | null; consent?: "seen" | "declined" | null } = {}) => {
  jest.resetModules();
  // React's dev build (act support) before NODE_ENV flips to production for the analytics wrapper.
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_ENV;
  require("react");
  require("react-dom/client");
  require("react-dom/test-utils");
  if (key) process.env.NEXT_PUBLIC_POSTHOG_KEY = key;
  else delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  (process.env as Record<string, string>).NODE_ENV = "production";
  if (consent) window.localStorage.setItem("unbrewed-analytics-notice", consent);
  a = require("./analytics");
  x = require("./experiments");
  account = require("./account/useAccount");
  recent = require("./pro/recentRooms");
  if (consent === "seen") {
    a.startAnalytics();
    await flush();
  }
};

const stored = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
const exposures = () => capture.mock.calls.filter(([e]) => e === "experiment_exposed");

/** A deterministic random source (mulberry32) behind crypto.getRandomValues. */
const seedRandom = (seed: number) => {
  let s = seed >>> 0;
  return jest.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint32Array) => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    arr[0] = (t ^ (t >>> 14)) >>> 0;
    return arr;
  }) as typeof crypto.getRandomValues);
};
/** Force the next draws to land at fraction `f` of the weight total. */
const fixRandom = (f: number) =>
  jest.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint32Array) => {
    arr[0] = Math.floor(f * 2 ** 32);
    return arr;
  }) as typeof crypto.getRandomValues);

let cleanups: Array<() => void> = [];
const afterThis = (fn: () => void) => cleanups.push(fn);
beforeEach(() => {
  capture.mockClear();
  distinctId = "anon-1";
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});
afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  jest.restoreAllMocks();
  (process.env as Record<string, string | undefined>).NODE_ENV = ORIGINAL_ENV;
});

describe("resolveExperiment: who is never assigned", () => {
  it.each([
    ["analytics unavailable (no key)", { key: null }],
    ["the notice was not seen", { consent: null }],
    ["analytics was declined", { consent: "declined" as const }],
  ])("%s → null, nothing written", async (_label, opts) => {
    await load(opts);
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("a non-production build → null, nothing written", async () => {
    await load();
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("an entry with live: false → null, nothing written", async () => {
    await load();
    x.__setExperimentsForTests({
      first_bot_tier: { variants: ["medium", "hard"], audience: "everyone", live: false },
    });
    try {
      expect(x.resolveExperiment("first_bot_tier")).toBeNull();
      expect(x.exposeExperiment("first_bot_tier")).toBeNull();
      expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(exposures()).toHaveLength(0);
    } finally {
      x.__setExperimentsForTests();
    }
  });

  it("blocked or unparsable storage → null, nothing written", async () => {
    await load();
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("{not json");
    window.localStorage.removeItem(STORAGE_KEY);
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
  });

  it("an assigned browser that later declines gets null again", async () => {
    await load();
    fixRandom(0.9);
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    a.declineAnalytics();
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(stored().first_bot_tier.v).toBe("hard");
  });
});

describe("resolveExperiment: assignment", () => {
  it("stores a variant on first call and keeps it across identify, reset and reload", async () => {
    await load();
    fixRandom(0.9);
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    expect(stored()).toEqual({ first_bot_tier: { v: "hard", at: expect.any(String) } });
    fixRandom(0.1); // a redraw would give medium
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    a.identifyAccount({ id: "acct-1", username: "p", avatarUrl: null });
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    a.resetIdentity();
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    await load(); // reload
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
  });

  it.each([
    ["a recent hero", () => recent.rememberHero("bigfoot")],
    [
      "a recent room",
      () => {
        recent.setToken("ROOM1", "tok");
        recent.rememberRoom("ROOM1");
      },
    ],
  ])("%s → null, stored, and still null after the list is cleared", async (_label, seed) => {
    await load();
    seed();
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(stored().first_bot_tier.v).toBeNull();
    window.localStorage.removeItem("unbrewed-pro-recent-heroes");
    window.localStorage.removeItem("unbrewed-pro-recent-rooms");
    window.sessionStorage.clear();
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
  });

  it("a signed-in account → null, stored", async () => {
    await load();
    const realFetch = global.fetch;
    afterThis(() => {
      global.fetch = realFetch;
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ user: { id: "u1", username: "p" } }),
    }) as unknown as typeof fetch;
    await account.ensureAccountProbe();
    expect(account.getAccountStatus()).toBe("signed-in");
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
    expect(stored().first_bot_tier.v).toBeNull();
  });

  it("splits 50/50 within 2 points over 10 000 draws", () => {
    x = require("./experiments");
    seedRandom(1611);
    const def = { variants: ["medium", "hard"], audience: "everyone", live: true } as const;
    let hard = 0;
    for (let i = 0; i < 10_000; i++) if (x.drawVariant(def) === "hard") hard++;
    expect(Math.abs(hard / 10_000 - 0.5)).toBeLessThan(0.02);
  });

  it("respects custom weights", () => {
    x = require("./experiments");
    seedRandom(42);
    const def = { variants: ["a", "b", "c"], weights: [1, 1, 2], audience: "everyone", live: true } as const;
    const n: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 10_000; i++) n[x.drawVariant(def)]++;
    expect(Math.abs(n.a / 10_000 - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(n.b / 10_000 - 0.25)).toBeLessThan(0.02);
    expect(Math.abs(n.c / 10_000 - 0.5)).toBeLessThan(0.02);
  });
});

describe("exposeExperiment", () => {
  it("sends exactly one experiment_exposed per browser", async () => {
    await load();
    fixRandom(0.9);
    expect(x.exposeExperiment("first_bot_tier")).toBe("hard");
    expect(x.exposeExperiment("first_bot_tier")).toBe("hard");
    expect(exposures()).toEqual([
      [
        "experiment_exposed",
        { experiment: "first_bot_tier", variant: "hard", "$feature/first_bot_tier": "hard" },
      ],
    ]);
    expect(stored().first_bot_tier.exposed).toBe(true);
    await load(); // reload
    expect(x.exposeExperiment("first_bot_tier")).toBe("hard");
    expect(exposures()).toHaveLength(1);
  });

  it("sends nothing for a null browser", async () => {
    await load();
    recent.rememberHero("bigfoot");
    expect(x.exposeExperiment("first_bot_tier")).toBeNull();
    expect(exposures()).toHaveLength(0);
  });

  it("leaves the mark unset when track returns false, and retries next time", async () => {
    await load();
    fixRandom(0.1);
    window.history.pushState({}, "", "/dev/x"); // silent route: track() returns false
    expect(x.exposeExperiment("first_bot_tier")).toBe("medium");
    expect(exposures()).toHaveLength(0);
    expect(stored().first_bot_tier.exposed).toBeUndefined();
    window.history.pushState({}, "", "/");
    expect(x.exposeExperiment("first_bot_tier")).toBe("medium");
    expect(exposures()).toHaveLength(1);
    expect(stored().first_bot_tier.exposed).toBe(true);
  });
});

describe("?exp= QA override", () => {
  it("forces the variant, sends nothing, leaves storage untouched, works with analytics off", async () => {
    await load({ key: null, consent: null });
    window.history.pushState({}, "", "/?exp=first_bot_tier:hard");
    expect(x.resolveExperiment("first_bot_tier")).toBe("hard");
    expect(x.exposeExperiment("first_bot_tier")).toBe("hard");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(exposures()).toHaveLength(0);
  });

  it("wins over a stored variant and the audience, without touching storage", async () => {
    await load();
    fixRandom(0.1);
    expect(x.resolveExperiment("first_bot_tier")).toBe("medium");
    const before = window.localStorage.getItem(STORAGE_KEY);
    window.history.pushState({}, "", "/?exp=other:x,first_bot_tier:hard");
    expect(x.exposeExperiment("first_bot_tier")).toBe("hard");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(exposures()).toHaveLength(0);
  });

  it("ignores an unknown variant", async () => {
    await load({ key: null, consent: null });
    window.history.pushState({}, "", "/?exp=first_bot_tier:nope");
    expect(x.resolveExperiment("first_bot_tier")).toBeNull();
  });
});

describe("useExperiment", () => {
  it("is null on the first render, then the variant; expose() sends once", async () => {
    await load();
    fixRandom(0.9);
    // React from the same (reset) module registry as `x`.
    const React = require("react") as typeof import("react");
    const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
    const { act } = require("react-dom/test-utils") as typeof import("react-dom/test-utils");
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const seen: Array<string | null> = [];
    let expose = () => {};
    const Probe = () => {
      const r = x.useExperiment("first_bot_tier");
      seen.push(r.variant);
      expose = r.expose;
      return null;
    };
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe)));
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]).toBe("hard");
    expect(exposures()).toHaveLength(0);
    expose();
    act(() => root.render(React.createElement(Probe)));
    expose();
    expect(exposures()).toHaveLength(1);
    act(() => root.unmount());
  });
});
