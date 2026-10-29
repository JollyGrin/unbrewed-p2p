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
  it("is a no-op without a key", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: undefined, NODE_ENV: "production" });
    a.acknowledgeNotice();
    a.trackPageview();
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
    expect(a.getAnalyticsId()).toBeUndefined();
    expect(a.shouldShowNotice()).toBe(false);
  });

  it("is a no-op outside production", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "test" });
    a.acknowledgeNotice();
    expect(init).not.toHaveBeenCalled();
  });

  it("captures nothing before the notice starts it, then pageviews with cookieless config", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.trackPageview();
    expect(capture).not.toHaveBeenCalled();
    expect(a.shouldShowNotice()).toBe(true);
    a.acknowledgeNotice();
    expect(init.mock.calls[0][1]).toMatchObject({ persistence: "localStorage", disable_session_recording: true });
    a.trackPageview();
    expect(capture).toHaveBeenCalledWith("$pageview");
    expect(a.getAnalyticsId()).toBe("anon-1");
    expect(a.shouldShowNotice()).toBe(false);
  });

  it("stays silent on /dev and /debug", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    window.history.pushState({}, "", "/dev/map-editor");
    a.trackPageview();
    window.history.pushState({}, "", "/debug");
    a.track("deck_added");
    expect(capture).not.toHaveBeenCalled();
  });

  it("honours decline: opts out, hides the id, never restarts", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    a.declineAnalytics();
    expect(optOut).toHaveBeenCalled();
    a.trackPageview();
    expect(capture).not.toHaveBeenCalled();
    expect(a.getAnalyticsId()).toBeUndefined();
    const b = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    init.mockClear();
    b.startAnalytics();
    expect(init).not.toHaveBeenCalled();
  });

  it("identifies once with the account id", () => {
    const a = load({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test", NODE_ENV: "production" });
    a.acknowledgeNotice();
    a.identifyAccount("discord-9");
    expect(identify).toHaveBeenCalledWith("discord-9");
  });
});
