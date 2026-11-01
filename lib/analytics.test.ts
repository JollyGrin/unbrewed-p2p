const capture = jest.fn();
const init = jest.fn();
const identify = jest.fn();
const optOut = jest.fn();
const reset = jest.fn();
const setPersonProperties = jest.fn();
let optedOut = false;
// Mirrors what posthog-js persists: a distinct id and whether it is identified.
let distinctId = "anon-1";
let userState = "anonymous";
jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: (...a: unknown[]) => init(...a),
    capture: (...a: unknown[]) => capture(...a),
    identify: (id: string, ...a: unknown[]) => {
      distinctId = id;
      userState = "identified";
      identify(id, ...a);
    },
    setPersonProperties: (...a: unknown[]) => setPersonProperties(...a),
    opt_out_capturing: () => { optedOut = true; optOut(); },
    has_opted_out_capturing: () => optedOut,
    get_distinct_id: () => distinctId,
    get_property: (k: string) => (k === "$user_state" ? userState : undefined),
    register: jest.fn(),
    reset: () => {
      distinctId = "anon-2";
      userState = "anonymous";
      reset();
    },
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const load = (env: Record<string, string | undefined>) => {
  jest.resetModules();
  Object.assign(process.env, env);
  for (const k of Object.keys(env)) if (env[k] === undefined) delete process.env[k];
  return require("./analytics") as typeof import("./analytics");
};

beforeEach(() => {
  jest.clearAllMocks();
  optedOut = false;
  distinctId = "anon-1";
  userState = "anonymous";
  window.localStorage.clear();
  window.history.pushState({}, "", "/");
});

describe("analytics wrapper", () => {
  it("is a no-op without a key", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: undefined, NODE_ENV: "production" });
    a.acknowledgeNotice();
    await flush();
    a.trackPageview();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(a.getAnalyticsId()).toBeUndefined();
    expect(a.shouldShowNotice()).toBe(false);
  });

  it("is a no-op outside production", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "test" });
    a.acknowledgeNotice();
    await flush();
    expect(init).not.toHaveBeenCalled();
  });

  it("new visitor: nothing before the notice, then one landing $pageview after start", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.trackPageview();
    expect(capture).not.toHaveBeenCalled();
    expect(a.shouldShowNotice()).toBe(true);
    a.acknowledgeNotice();
    a.trackPageview(); // while loading: dropped, the landing view covers it
    expect(capture).not.toHaveBeenCalled();
    expect(a.getAnalyticsId()).toBeUndefined(); // safe before the import resolves
    await flush();
    expect(init.mock.calls[0][1]).toMatchObject({ persistence: "localStorage", disable_session_recording: true });
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("$pageview");
    a.trackPageview();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(a.getAnalyticsId()).toBe("anon-1");
    expect(a.shouldShowNotice()).toBe(false);
  });

  it("returning visitor: starts at mount, exactly one $pageview", async () => {
    window.localStorage.setItem("unbrewed-analytics-notice", "seen");
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    expect(a.shouldShowNotice()).toBe(false);
    a.startAnalytics();
    a.startAnalytics();
    await flush();
    expect(init).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("queues identify made before the import resolves", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    a.identifyAccount({ id: "acct-9", username: "dean", avatarUrl: null });
    expect(identify).not.toHaveBeenCalled();
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(identify.mock.calls[0][0]).toBe("acct-9");
  });

  it("stays silent on /dev and /debug", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    window.history.pushState({}, "", "/dev/map-editor");
    a.acknowledgeNotice();
    await flush();
    window.history.pushState({}, "", "/debug");
    a.track("deck_added");
    a.trackPageview();
    expect(capture).not.toHaveBeenCalled();
  });

  it("honours decline: opts out, hides the id, never restarts", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    await flush();
    capture.mockClear();
    a.declineAnalytics();
    expect(optOut).toHaveBeenCalled();
    a.trackPageview();
    expect(capture).not.toHaveBeenCalled();
    expect(a.getAnalyticsId()).toBeUndefined();
    const b = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    init.mockClear();
    b.startAnalytics();
    await flush();
    expect(init).not.toHaveBeenCalled();
  });

  it("knows the in-game routes", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    for (const p of ["/pro/game", "/game", "/irl", "/irl/x", "/offline", "/table"]) expect(a.isGameRoute(p)).toBe(true);
    for (const p of ["/", "/pro", "/bag", "/gamesx", "/tournaments"]) expect(a.isGameRoute(p)).toBe(false);
  });
});

describe("identity", () => {
  const ON = { NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" };
  const dean = { id: "acct-1", username: "dean", avatarUrl: "https://cdn/a.png", discordId: "1234", createdAt: "2026-01-02T00:00:00.000Z" };
  const seen = () => window.localStorage.setItem("unbrewed-analytics-notice", "seen");
  const events = () => capture.mock.calls.map((c) => c[0]);

  it("identify carries $set / $set_once person properties and one login_completed", async () => {
    seen();
    const a = load(ON);
    a.identifyAccount(dean);
    a.startAnalytics();
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    const [id, set, setOnce] = identify.mock.calls[0];
    expect(id).toBe("acct-1");
    expect(set).toEqual({ username: "dean", avatar_url: "https://cdn/a.png", discord_id: "1234", auth_provider: "discord" });
    expect(setOnce).toEqual({ account_created_at: dean.createdAt, first_identified_at: expect.any(String) });
    expect(JSON.stringify([set, setOnce])).not.toMatch(/mail|token/i);
    expect(events().filter((e) => e === "login_completed")).toHaveLength(1);
    expect(capture).toHaveBeenCalledWith("login_completed", { provider: "discord" });
  });

  it("leaves out fields /me does not return yet", async () => {
    seen();
    const a = load(ON);
    a.identifyAccount({ id: "acct-1", username: "dean", avatarUrl: null });
    a.startAnalytics();
    await flush();
    expect(identify.mock.calls[0][1]).toEqual({ username: "dean", auth_provider: "discord" });
    expect(Object.keys(identify.mock.calls[0][2])).toEqual(["first_identified_at"]);
  });

  it("a repeat signed-in load with an unchanged profile sends no $identify, $set or login_completed", async () => {
    seen();
    const first = load(ON);
    first.identifyAccount(dean);
    first.startAnalytics();
    await flush();
    jest.clearAllMocks();
    const again = load(ON); // next page load: distinct id persisted as the account
    again.startAnalytics();
    again.identifyAccount(dean);
    await flush();
    again.identifyAccount({ ...dean }); // re-render with an equal object
    expect(identify).not.toHaveBeenCalled();
    expect(setPersonProperties).not.toHaveBeenCalled();
    expect(events()).toEqual(["$pageview"]);
  });

  it("already identified before createdAt existed: $set_once goes out exactly once when it appears", async () => {
    seen();
    distinctId = "acct-1"; // identified under phase A: no fingerprint, no $set_once yet
    userState = "identified";
    const { createdAt, ...noCreated } = dean;
    const a = load(ON);
    a.startAnalytics();
    await flush();
    a.identifyAccount(noCreated);
    expect(setPersonProperties).toHaveBeenCalledTimes(1);
    expect(Object.keys(setPersonProperties.mock.calls[0][1])).toEqual(["first_identified_at"]);
    setPersonProperties.mockClear();
    const b = load(ON); // later load, API now returns createdAt
    b.startAnalytics();
    await flush();
    b.identifyAccount(dean);
    b.identifyAccount({ ...dean });
    expect(setPersonProperties).toHaveBeenCalledTimes(1);
    expect(setPersonProperties.mock.calls[0][1]).toEqual({ account_created_at: createdAt, first_identified_at: expect.any(String) });
    setPersonProperties.mockClear();
    const c = load(ON);
    c.startAnalytics();
    await flush();
    c.identifyAccount(dean);
    expect(setPersonProperties).not.toHaveBeenCalled();
    expect(identify).not.toHaveBeenCalled();
  });

  it("sign-in in a new tab: the stale original tab does not send a second login_completed", async () => {
    seen();
    const original = load(ON); // game tab, loaded while anonymous
    original.startAnalytics();
    await flush();
    const signInTab = load(ON); // new tab back from Discord identifies
    signInTab.startAnalytics();
    await flush();
    signInTab.identifyAccount(dean);
    expect(events().filter((e) => e === "login_completed")).toHaveLength(1);
    // The original tab's posthog-js still holds its in-memory anonymous id.
    distinctId = "anon-1";
    userState = "anonymous";
    original.identifyAccount(dean); // account refreshed on focus
    expect(events().filter((e) => e === "login_completed")).toHaveLength(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("a changed profile sends $set once", async () => {
    seen();
    const a = load(ON);
    a.identifyAccount(dean);
    a.startAnalytics();
    await flush();
    const b = load(ON);
    b.startAnalytics();
    await flush();
    b.identifyAccount({ ...dean, username: "dean2" });
    b.identifyAccount({ ...dean, username: "dean2" });
    expect(setPersonProperties).toHaveBeenCalledTimes(1);
    expect(setPersonProperties).toHaveBeenCalledWith({ username: "dean2", avatar_url: "https://cdn/a.png", discord_id: "1234", auth_provider: "discord" });
    expect(identify).toHaveBeenCalledTimes(1);
  });

  it("first visit signed in on /pro/game, then /: identify fires once analytics starts", async () => {
    const a = load(ON);
    window.history.pushState({}, "", "/pro/game");
    a.identifyAccount(dean); // not started on a game route: remembered, not dropped
    await flush();
    expect(identify).not.toHaveBeenCalled();
    window.history.pushState({}, "", "/");
    a.acknowledgeNotice();
    await flush();
    expect(identify).toHaveBeenCalledTimes(1);
    expect(identify.mock.calls[0][0]).toBe("acct-1");
  });

  it("guest load with a persisted identified id resets; an anonymous one does not", async () => {
    seen();
    distinctId = "acct-1";
    userState = "identified";
    const a = load(ON);
    a.resetIdentity();
    a.startAnalytics();
    await flush();
    expect(reset).toHaveBeenCalledTimes(1);
    a.resetIdentity();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("signing in as a different account resets first, then identifies", async () => {
    seen();
    distinctId = "acct-other";
    userState = "identified";
    const a = load(ON);
    a.startAnalytics();
    await flush();
    a.identifyAccount(dean);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(identify.mock.calls[0][0]).toBe("acct-1");
  });

  it("discord_roles_linked is sent only when it changes, and only for the identified account", async () => {
    seen();
    const a = load(ON);
    a.startAnalytics();
    await flush();
    a.setDiscordRolesLinked(true); // no account known yet
    expect(setPersonProperties).not.toHaveBeenCalled();
    a.identifyAccount(dean);
    a.setDiscordRolesLinked(true);
    a.setDiscordRolesLinked(true);
    a.setDiscordRolesLinked(false);
    expect(setPersonProperties.mock.calls).toEqual([[{ discord_roles_linked: true }], [{ discord_roles_linked: false }]]);
  });

  describe("getAnalyticsId before posthog-js loads", () => {
    const persist = (v: object) => window.localStorage.setItem("ph_phc_test_posthog", JSON.stringify(v));

    it("returns the persisted id when consent is seen", () => {
      seen();
      persist({ distinct_id: "anon-7", $user_state: "anonymous" });
      const a = load(ON);
      expect(a.getAnalyticsId()).toBe("anon-7");
      a.startAnalytics(); // still loading
      expect(a.getAnalyticsId()).toBe("anon-7");
    });

    it("prefers the known account; withholds a persisted account id on a guest load", () => {
      seen();
      persist({ distinct_id: "acct-old", $user_state: "identified" });
      const a = load(ON);
      a.resetIdentity();
      expect(a.getAnalyticsId()).toBeUndefined();
      a.identifyAccount(dean);
      expect(a.getAnalyticsId()).toBe("acct-1");
    });

    it("is undefined when declined, unseen, unavailable or nothing is persisted", () => {
      persist({ distinct_id: "anon-7" });
      window.localStorage.setItem("unbrewed-analytics-notice", "declined");
      expect(load(ON).getAnalyticsId()).toBeUndefined();
      window.localStorage.removeItem("unbrewed-analytics-notice");
      expect(load(ON).getAnalyticsId()).toBeUndefined();
      seen();
      expect(load({ ...ON, NODE_ENV: "test" }).getAnalyticsId()).toBeUndefined();
      window.localStorage.removeItem("ph_phc_test_posthog");
      expect(load(ON).getAnalyticsId()).toBeUndefined();
    });
  });
});

describe("init options", () => {
  it("pins default captures off and cookieless", async () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    await flush();
    expect(init.mock.calls[0][1]).toMatchObject({
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      advanced_disable_decide: true,
      capture_performance: false,
      capture_heatmaps: false,
      enable_heatmaps: false,
      capture_dead_clicks: false,
    });
  });
});
