/**
 * Cloud replay storage + share links (#567). The contract these pin is the
 * accounts API's (`POST /replays` → 201/409/413, public `GET /share/replays/:id`),
 * plus the rule that every failure resolves to a typed reason with a
 * ready-to-toast message instead of throwing — a dead API must never break the
 * replays page.
 */
import type { ReplayBundle } from "./protocol";
import {
  CLOUD_REPLAY_CAP,
  deleteCloudReplay,
  fetchSharedReplay,
  listCloudReplays,
  shareReplayPath,
  shareReplayUrl,
  uploadReplay,
} from "./replayCloud";
import { API_URL } from "@/lib/account/apiUrl";

const bundle: ReplayBundle = {
  v: 1,
  engine: { schemaVersion: 1, dslVersion: "0.11.0" },
  config: {
    seed: 1,
    players: { p1: { heroId: "king-kong", hero: {}, cards: [] }, p2: { heroId: "thrall", hero: {}, cards: [] } },
    map: { schemaVersion: "1.0", id: "mended-drum", meta: { title: "The Mended Drum", minPlayers: 2, maxPlayers: 2, specialRules: false }, zones: [], spaces: [] },
  },
  actionLog: [],
  meta: { winner: "p2", heroes: { p1: "king-kong", p2: "thrall" }, turns: 5, endedAt: 1_720_000_000_000, mapTitle: "The Mended Drum" },
};

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("uploadReplay", () => {
  it("returns the new id and a share URL on 201", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "11111111-2222-3333-4444-555555555555" }));

    const res = await uploadReplay({ bundle, title: "King Kong vs Thrall", origin: "https://unbrewed.xyz" });

    expect(res).toEqual({
      ok: true,
      id: "11111111-2222-3333-4444-555555555555",
      url: "https://unbrewed.xyz/share/replay/11111111-2222-3333-4444-555555555555",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_URL}/replays`);
    expect(init.method).toBe("POST");
    // Cookie auth — the session rides along or the API answers 401.
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ title: "King Kong vs Thrall", bundle });
  });

  it("sends a null title when the caller has no label", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "abc" }));

    await uploadReplay({ bundle });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBeNull();
  });

  it("reports the cap on 409 cap_reached", async () => {
    fetchMock.mockResolvedValue(reply(409, { error: "cap_reached", cap: CLOUD_REPLAY_CAP }));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("cap_reached");
    expect(res.message).toContain(String(CLOUD_REPLAY_CAP));
    expect(res.message).toMatch(/[Dd]elete/);
  });

  it("reports too_large on 413", async () => {
    fetchMock.mockResolvedValue(reply(413, { error: "too_large", limit: 2097152 }));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("too_large");
    expect(res.message).toMatch(/2 MB/);
  });

  it("refuses an oversized bundle without spending the upload", async () => {
    const huge: ReplayBundle = {
      ...bundle,
      actionLog: new Array(60_000).fill({ type: "MANEUVER", player: "p1", space: "a-very-long-space-id-padding" }),
    };

    const res = await uploadReplay({ bundle: huge });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("too_large");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports unauthorized on 401", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "unauthorized" }));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("unauthorized");
  });

  it("reports rate_limited on 429", async () => {
    fetchMock.mockResolvedValue(reply(429, { error: "rate_limited" }));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("rate_limited");
  });

  it("resolves to offline instead of throwing when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("offline");
  });

  it("treats a 201 with no id as an unreadable answer", async () => {
    fetchMock.mockResolvedValue(reply(201, {}));

    const res = await uploadReplay({ bundle });

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("invalid");
  });
});

describe("listCloudReplays", () => {
  it("returns the summaries", async () => {
    const rows = [{ id: "a", title: "Kong vs Thrall", bytes: 1234, createdAt: "2026-08-05T12:00:00.000Z" }];
    fetchMock.mockResolvedValue(reply(200, { replays: rows }));

    const res = await listCloudReplays();

    expect(res).toEqual({ ok: true, replays: rows });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("fails soft when the API is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const res = await listCloudReplays();

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("offline");
  });

  it("rejects a body that isn't a replay list", async () => {
    fetchMock.mockResolvedValue(reply(200, { replays: "nope" }));

    const res = await listCloudReplays();

    expect(res.ok).toBe(false);
  });
});

describe("deleteCloudReplay", () => {
  it("accepts a 204", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => null } as Response);

    expect(await deleteCloudReplay("abc")).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });

  it("maps 404 to not_found", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));

    const res = await deleteCloudReplay("abc");

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("not_found");
  });
});

describe("fetchSharedReplay", () => {
  it("reads the public endpoint WITHOUT credentials (recipients are signed out)", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "abc", title: "Kong vs Thrall", bundle, createdAt: "2026-08-05T12:00:00.000Z" }));

    const res = await fetchSharedReplay("abc");

    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("unreachable");
    expect(res.replay.bundle).toEqual(bundle);
    expect(res.replay.title).toBe("Kong vs Thrall");
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/share/replays/abc`);
    expect(fetchMock.mock.calls[0][1].credentials).toBeUndefined();
  });

  it("maps a deleted/unknown id to not_found", async () => {
    fetchMock.mockResolvedValue(reply(404, { error: "not_found" }));

    const res = await fetchSharedReplay("abc");

    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.reason).toBe("not_found");
  });

  it("rejects a payload with no bundle", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "abc", title: null }));

    const res = await fetchSharedReplay("abc");

    expect(res.ok).toBe(false);
  });
});

describe("share links", () => {
  it("builds the path a recipient opens", () => {
    expect(shareReplayPath("abc")).toBe("/share/replay/abc");
  });

  it("uses the page's own origin so a localhost link stays on localhost", () => {
    expect(shareReplayUrl("abc")).toBe(`${window.location.origin}/share/replay/abc`);
  });
});
