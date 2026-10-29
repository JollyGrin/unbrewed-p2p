const capture = jest.fn();
const init = jest.fn();
const identify = jest.fn();
const optOut = jest.fn();
let optedOut = false;
jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: (...a: unknown[]) => init(...a),
    capture: (...a: unknown[]) => capture(...a),
    identify: (...a: unknown[]) => identify(...a),
    opt_out_capturing: () => { optedOut = true; optOut(); },
    has_opted_out_capturing: () => optedOut,
    get_distinct_id: () => "anon-1",
    register: jest.fn(),
    reset: jest.fn(),
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
    a.identifyAccount("discord-9");
    expect(identify).not.toHaveBeenCalled();
    await flush();
    expect(identify).toHaveBeenCalledWith("discord-9");
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
