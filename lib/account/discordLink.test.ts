/**
 * The Discord Linked Roles transport (#578).
 *
 * What matters here is that the two "normal" failures stay distinguishable:
 * 503 (the feature isn't configured on this deploy → hide the card entirely)
 * and 429 (the one-a-minute refresh limit → a toast, and the card stays put).
 * Everything else collapses into the same quiet `unavailable`.
 */
import {
  discordLinkUrl,
  fetchDiscordLink,
  normalizeLinkStatus,
  refreshDiscordLink,
  syncedAgoLabel,
  unlinkDiscord,
} from "./discordLink";

const reply = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const LINKED = {
  linked: true,
  stale: false,
  lastPushAt: "2026-08-06T12:00:00.000Z",
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("normalizeLinkStatus", () => {
  it("reads the documented body", () => {
    expect(normalizeLinkStatus(LINKED)).toEqual(LINKED);
  });

  it("treats a missing or junk field as the safe default", () => {
    // Anything but an explicit `true` is not linked: a body we can't parse must
    // never render as "your data is being shared".
    expect(normalizeLinkStatus({})).toEqual({
      linked: false,
      stale: false,
      lastPushAt: null,
    });
    expect(normalizeLinkStatus({ linked: "yes", stale: 1, lastPushAt: 17 })).toEqual(
      { linked: false, stale: false, lastPushAt: null },
    );
    expect(normalizeLinkStatus(null)).toEqual({
      linked: false,
      stale: false,
      lastPushAt: null,
    });
  });
});

describe("fetchDiscordLink", () => {
  it("sends one cookie-authenticated GET and returns the status", async () => {
    fetchMock.mockResolvedValue(reply(200, LINKED));

    const result = await fetchDiscordLink();

    expect(result).toEqual({ ok: true, value: LINKED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/me\/discord$/);
    expect(init.credentials).toBe("include");
    expect(init.method).toBeUndefined();
  });

  it("reports 503 — the unconfigured deploy — as unavailable", async () => {
    fetchMock.mockResolvedValue(reply(503, { error: "linked_roles_not_configured" }));

    expect(await fetchDiscordLink()).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reports a lost session as unauthorized, and a dead API as unavailable", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "unauthorized" }));
    expect(await fetchDiscordLink()).toEqual({ ok: false, reason: "unauthorized" });

    fetchMock.mockRejectedValue(new TypeError("network"));
    expect(await fetchDiscordLink()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("refreshDiscordLink", () => {
  it("POSTs and takes the fresh status straight from the reply", async () => {
    const pushed = { ...LINKED, lastPushAt: "2026-08-06T12:30:00.000Z" };
    fetchMock.mockResolvedValue(reply(200, pushed));

    expect(await refreshDiscordLink()).toEqual({ ok: true, value: pushed });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/me\/discord\/refresh$/);
    expect(init.method).toBe("POST");
  });

  it("keeps the 429 rate limit apart from every other failure", async () => {
    fetchMock.mockResolvedValue(reply(429, { error: "rate_limited" }));
    expect(await refreshDiscordLink()).toEqual({ ok: false, reason: "rate_limited" });

    fetchMock.mockResolvedValue(reply(404, { error: "not_linked" }));
    expect(await refreshDiscordLink()).toEqual({ ok: false, reason: "not_linked" });

    // 503 here is telemetry being unreachable, not the feature being absent —
    // same quiet reason either way.
    fetchMock.mockResolvedValue(reply(503, { error: "upstream_unavailable" }));
    expect(await refreshDiscordLink()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("unlinkDiscord", () => {
  it("POSTs and accepts the API's 204 (no body to parse)", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);

    expect(await unlinkDiscord()).toEqual({ ok: true, value: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/me\/discord\/unlink$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("never throws on a dead API", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    expect(await unlinkDiscord()).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("discordLinkUrl", () => {
  it("points at the link start route with the return path", () => {
    expect(discordLinkUrl("/account")).toMatch(
      /\/auth\/discord\/link\?return_to=%2Faccount$/,
    );
  });

  it("refuses anything that isn't a path", () => {
    // The API guards this too; the client must not even offer the open
    // redirect. A protocol-relative URL starts with "/" and is not a path.
    expect(discordLinkUrl("//evil.com")).toMatch(/return_to=%2F$/);
    expect(discordLinkUrl("https://evil.com")).toMatch(/return_to=%2F$/);
    expect(discordLinkUrl()).toMatch(/return_to=%2F$/);
  });
});

describe("syncedAgoLabel", () => {
  const NOW = Date.parse("2026-08-06T12:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();

  it("rounds down to the coarsest honest unit", () => {
    expect(syncedAgoLabel(ago(5_000), NOW)).toBe("just now");
    expect(syncedAgoLabel(ago(60_000), NOW)).toBe("1 minute ago");
    expect(syncedAgoLabel(ago(12 * 60_000), NOW)).toBe("12 minutes ago");
    expect(syncedAgoLabel(ago(60 * 60_000), NOW)).toBe("1 hour ago");
    expect(syncedAgoLabel(ago(5 * 60 * 60_000), NOW)).toBe("5 hours ago");
    expect(syncedAgoLabel(ago(26 * 60 * 60_000), NOW)).toBe("1 day ago");
    expect(syncedAgoLabel(ago(3 * 24 * 60 * 60_000), NOW)).toBe("3 days ago");
  });

  it("has nothing to say about a missing or unparseable timestamp", () => {
    expect(syncedAgoLabel(null, NOW)).toBeNull();
    expect(syncedAgoLabel("not a date", NOW)).toBeNull();
  });

  it("reads a clock-skewed future push as just now, never as negative", () => {
    expect(syncedAgoLabel(ago(-90_000), NOW)).toBe("just now");
  });
});
