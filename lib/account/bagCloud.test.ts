/**
 * The cloud bag transport (#566) sits between the Bag and an API that may be
 * missing, down, rate-limiting, or full. These tests pin the contract the rest
 * of the feature leans on: every failure becomes a typed `reason` with friendly
 * copy, nothing throws, and the two documented refusals (cap and size) are
 * distinguishable from "the network ate it" — because those three want three
 * different sentences in a toast.
 */
import { API_URL } from "./apiUrl";
import {
  BAG_ITEM_CAP,
  cloudFailureMessage,
  createCloudItem,
  deleteCloudItem,
  fetchSharedItem,
  formatBytes,
  formatStamp,
  listCloudItems,
  readCloudItem,
  shareUrl,
  updateCloudItem,
} from "./bagCloud";

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

/** A reply whose body isn't JSON at all (a proxy's HTML error page). */
const unparseable = (status: number) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token <");
    },
  }) as unknown as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("listCloudItems", () => {
  it("reads the kind-keyed listing and sends the session cookie", async () => {
    const rows = [
      { id: "a", name: "Bruce Lee", bytes: 2048, createdAt: "x", updatedAt: "y" },
    ];
    fetchMock.mockResolvedValue(reply(200, { decks: rows }));

    const result = await listCloudItems("decks");

    expect(result).toEqual({ ok: true, value: rows });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/bag/decks`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("reads maps from their own key", async () => {
    fetchMock.mockResolvedValue(reply(200, { maps: [], decks: [{ id: "no" }] }));
    await expect(listCloudItems("maps")).resolves.toEqual({
      ok: true,
      value: [],
    });
  });

  it("drops rows that are missing the fields the UI renders", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { decks: [{ id: "a", name: "ok" }, { id: 7 }, null] }),
    );
    const result = await listCloudItems("decks");
    expect(result.ok && result.value).toHaveLength(1);
  });

  it("turns a network failure into `offline`, never a throw", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listCloudItems("decks")).resolves.toEqual({
      ok: false,
      reason: "offline",
    });
  });

  it("turns an expired session into `unauthorized`", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "unauthorized" }));
    await expect(listCloudItems("decks")).resolves.toEqual({
      ok: false,
      reason: "unauthorized",
    });
  });

  it("treats a 5xx with an unreadable body as offline", async () => {
    fetchMock.mockResolvedValue(unparseable(502));
    await expect(listCloudItems("decks")).resolves.toEqual({
      ok: false,
      reason: "offline",
    });
  });

  it("treats a 200 with an unreadable body as offline", async () => {
    fetchMock.mockResolvedValue(unparseable(200));
    await expect(listCloudItems("decks")).resolves.toEqual({
      ok: false,
      reason: "offline",
    });
  });
});

describe("createCloudItem", () => {
  it("POSTs {name, data} and returns the new id", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "new-id" }));

    const result = await createCloudItem("decks", "Bruce Lee", { a: 1 });

    expect(result).toEqual({ ok: true, value: { id: "new-id" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/bag/decks`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Bruce Lee", data: { a: 1 } });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("surfaces the cap as `cap_reached`, not as an error", async () => {
    fetchMock.mockResolvedValue(
      reply(409, { error: "cap_reached", cap: BAG_ITEM_CAP }),
    );
    await expect(createCloudItem("decks", "n", {})).resolves.toEqual({
      ok: false,
      reason: "cap_reached",
    });
  });

  it("surfaces an oversize payload as `too_large`", async () => {
    fetchMock.mockResolvedValue(reply(413, { error: "too_large", limit: 262144 }));
    await expect(createCloudItem("maps", "n", {})).resolves.toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("surfaces the write bucket as `rate_limited`", async () => {
    fetchMock.mockResolvedValue(reply(429, { error: "rate_limited" }));
    await expect(createCloudItem("decks", "n", {})).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("refuses to invent an id when the 201 body is malformed", async () => {
    fetchMock.mockResolvedValue(reply(201, { nope: true }));
    await expect(createCloudItem("decks", "n", {})).resolves.toEqual({
      ok: false,
      reason: "offline",
    });
  });
});

describe("updateCloudItem / deleteCloudItem / readCloudItem", () => {
  it("PUTs to the item path and keeps the id it was given", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "id1", bytes: 10 }));

    const result = await updateCloudItem("maps", "id1", "Nowhere", { b: 2 });

    expect(result).toEqual({ ok: true, value: { id: "id1" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/bag/maps/id1`);
    expect(init.method).toBe("PUT");
  });

  it("accepts the 204 DELETE, which has no body to parse", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 } as Response);
    await expect(deleteCloudItem("decks", "id1")).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("maps someone else's (or a missing) item to `not_found`", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));
    await expect(deleteCloudItem("decks", "id1")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("returns the payload on an owner read", async () => {
    fetchMock.mockResolvedValue(
      reply(200, { id: "id1", name: "Bruce", data: { id: "deck" } }),
    );
    const result = await readCloudItem("decks", "id1");
    expect(result.ok && result.value.data).toEqual({ id: "deck" });
  });

  it("treats an owner read with no data field as offline", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "id1", name: "Bruce" }));
    await expect(readCloudItem("decks", "id1")).resolves.toEqual({
      ok: false,
      reason: "offline",
    });
  });
});

describe("fetchSharedItem", () => {
  it("reads the public route WITHOUT credentials, so a guest takes one path", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "x", name: "n", data: {} }));

    await fetchSharedItem("decks", "x");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/share/decks/x`);
    expect(init.credentials).toBeUndefined();
  });

  it("escapes a hostile id rather than letting it walk the path", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));
    await fetchSharedItem("maps", "../decks/secret");
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${API_URL}/share/maps/..%2Fdecks%2Fsecret`,
    );
  });

  it("maps a dead link to `not_found`", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));
    await expect(fetchSharedItem("decks", "x")).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("share links", () => {
  it("uses the singular client route and the live origin", () => {
    expect(shareUrl("decks", "abc")).toBe(
      `${window.location.origin}/share/deck/abc`,
    );
    expect(shareUrl("maps", "abc")).toBe(
      `${window.location.origin}/share/map/abc`,
    );
  });
});

describe("copy helpers", () => {
  it("names every failure without leaking a status code", () => {
    const reasons = [
      "cap_reached",
      "too_large",
      "unauthorized",
      "not_found",
      "rate_limited",
      "offline",
    ] as const;
    reasons.forEach((reason) => {
      const message = cloudFailureMessage(reason);
      expect(message).toMatch(/[a-z]/);
      expect(message).not.toMatch(/\b[45]\d\d\b/);
    });
    expect(cloudFailureMessage("cap_reached")).toContain(String(BAG_ITEM_CAP));
  });

  it("formats sizes and stamps for a table cell", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(40 * 1024)).toBe("40 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatBytes(-1)).toBe("—");
    expect(formatStamp("2026-08-06T10:20:30.000Z")).toBe("2026-08-06");
    expect(formatStamp("not a date")).toBe("—");
  });
});
