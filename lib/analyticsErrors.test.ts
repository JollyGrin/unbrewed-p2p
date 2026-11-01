export {}; // a module, so its top-level names do not clash with analytics.test.ts

// The real analytics wrapper under the error helpers (issue #1514 review): a
// render-time crash fires before AnalyticsNotice starts PostHog.
const capture = jest.fn();
const captureException = jest.fn();
jest.mock("posthog-js", () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    capture: (...a: unknown[]) => capture(...a),
    captureException: (...a: unknown[]) => captureException(...a),
    has_opted_out_capturing: () => false,
    opt_out_capturing: jest.fn(),
    get_distinct_id: () => "anon-1",
    register: jest.fn(),
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));

const load = () => {
  jest.resetModules();
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  Object.assign(process.env, { NODE_ENV: "production" });
  return {
    analytics: require("./analytics") as typeof import("./analytics"),
    errors: require("./analyticsErrors") as typeof import("./analyticsErrors"),
  };
};

const clientErrors = () => capture.mock.calls.filter(([event]) => event === "client_error");

describe("client_error before PostHog starts", () => {
  const env = { ...process.env };
  beforeEach(() => {
    capture.mockClear();
    captureException.mockClear();
    window.localStorage.clear();
  });
  afterAll(() => {
    process.env = env;
  });

  it("notice already seen: queued at catch time, delivered once after start", async () => {
    window.localStorage.setItem("unbrewed-analytics-notice", "seen");
    const { analytics, errors } = load();
    errors.reportClientError("sandbox", new Error("boom"));
    errors.reportClientError("sandbox", new Error("boom again")); // slot used: dropped
    expect(capture).not.toHaveBeenCalled();

    analytics.startAnalytics();
    await flush();
    expect(clientErrors()).toHaveLength(1);
    expect(clientErrors()[0][1]).toMatchObject({ boundary: "sandbox", message: "boom" });
    // Error Tracking too (#1526): the original Error (stack intact), once per boundary.
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(captureException.mock.calls[0][0].message).toBe("boom");
    expect(captureException.mock.calls[0][1]).toEqual({ boundary: "sandbox" });
  });

  it("captureException: once per boundary per page load, boundaries counted separately", async () => {
    window.localStorage.setItem("unbrewed-analytics-notice", "seen");
    const { analytics, errors } = load();
    analytics.startAnalytics();
    await flush();
    errors.reportClientError("pro", new Error("a"));
    errors.reportClientError("pro", new Error("b"));
    errors.reportClientError("table", "not an Error");
    expect(captureException.mock.calls.map(([e, p]) => [e instanceof Error ? e.message : e, p])).toEqual([
      ["a", { boundary: "pro" }],
      ["not an Error", { boundary: "table" }],
    ]);
  });

  it("notice not yet seen: dropped, and the slot stays free for a later crash", async () => {
    const { analytics, errors } = load();
    errors.reportClientError("irl", new Error("first"));
    analytics.acknowledgeNotice();
    await flush();
    expect(clientErrors()).toHaveLength(0); // nothing before the notice

    expect(captureException).not.toHaveBeenCalled();

    errors.reportClientError("irl", new Error("second"));
    expect(clientErrors()).toHaveLength(1);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(clientErrors()[0][1]).toMatchObject({ message: "second" });
  });

  it("an analytics failure never throws into the boundary", () => {
    const { errors } = load();
    window.history.pushState({}, "", "/");
    jest.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(() => errors.reportClientError("pro", new Error("x"))).not.toThrow();
    jest.restoreAllMocks();
  });
});

describe("scrubMessage", () => {
  const { scrubMessage } = require("./analyticsErrors") as typeof import("./analyticsErrors");

  it("redacts long quoted input but keeps short quoted names", () => {
    expect(scrubMessage(`Unexpected token 'h', "hello my secret deck" is not valid JSON`)).toBe(
      `Unexpected token 'h', "…" is not valid JSON`
    );
    expect(scrubMessage(`Cannot read properties of undefined (reading 'fighters')`)).toBe(
      `Cannot read properties of undefined (reading 'fighters')`
    );
    expect(scrubMessage(`bad 'a very long single-quoted bit'`)).toBe(`bad '…'`);
  });

  it("caps at 200 chars after redaction", () => {
    expect(scrubMessage("y".repeat(300))).toHaveLength(200);
  });
});
