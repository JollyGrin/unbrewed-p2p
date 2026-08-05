/**
 * The cloud bag store (#566). Two promises to the user are load-bearing here
 * and easy to break by accident, so they get tests:
 *
 * 1. **A guest pays nothing.** Signed out — or pointed at an API that doesn't
 *    exist — the Bag must issue ZERO requests beyond the `/me` probe that
 *    shipped with #459, and must show no cloud UI to explain itself.
 * 2. **Sync stays explicit.** One listing when a signed-in user opens the Bag,
 *    however many components ask for it, and a re-list only after the user's own
 *    write. Nothing polls, nothing merges.
 */
import "@testing-library/jest-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { API_URL } from "./apiUrl";
import { __resetAccountStoreForTests } from "./useAccount";
import { __resetCloudBagStoresForTests, useCloudBag } from "./useCloudBag";

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const DECK_ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Bruce Lee",
  bytes: 4096,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

let fetchMock: jest.Mock;

/** Routes by path so a test doesn't care what order the hook asks in. */
const route = (handlers: Record<string, (init?: any) => Response>) =>
  jest.fn(async (url: string, init?: any) => {
    const path = url.replace(API_URL, "");
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (path === prefix) return handler(init);
    }
    if (path.startsWith("/bag/decks/")) return handlers["/bag/decks/:id"]!(init);
    throw new TypeError(`unrouted ${path}`);
  });

const pathsCalled = () =>
  fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url.replace(API_URL, "")}`);

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetCloudBagStoresForTests();
});

const install = (mock: jest.Mock) => {
  fetchMock = mock;
  global.fetch = mock as unknown as typeof fetch;
};

describe("a signed-out visitor", () => {
  it("makes no bag request at all and gets the sign-in affordance", async () => {
    install(route({ "/me": () => reply(401, { user: null }) }));

    const { result } = renderHook(() => useCloudBag("decks"));

    await waitFor(() => expect(result.current.status).toBe("guest"));
    expect(pathsCalled()).toEqual(["GET /me"]);
    expect(result.current.items).toEqual([]);
  });

  it("reports `offline` — render nothing — when the API is unreachable", async () => {
    install(jest.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const { result } = renderHook(() => useCloudBag("maps"));

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // the /me probe, nothing more
  });
});

describe("a signed-in user", () => {
  it("lists once per kind no matter how many components ask", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: [DECK_ROW] }),
      }),
    );

    const first = renderHook(() => useCloudBag("decks"));
    const second = renderHook(() => useCloudBag("decks"));
    const third = renderHook(() => useCloudBag("decks"));

    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    await waitFor(() => expect(second.result.current.items).toHaveLength(1));
    expect(third.result.current.items).toEqual([DECK_ROW]);
    expect(pathsCalled().filter((p) => p === "GET /bag/decks")).toHaveLength(1);
  });

  it("surfaces the quota the header renders", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () =>
          reply(200, { decks: [DECK_ROW, { ...DECK_ROW, id: "b", bytes: 1024 }] }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.usedBytes).toBe(4096 + 1024);
    expect(result.current.cap).toBe(100);
    expect(result.current.isFull).toBe(false);
  });

  it("is `isFull` at the cap, so the save button can go quiet", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      ...DECK_ROW,
      id: `id-${i}`,
      name: `deck-${i}`,
    }));
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: rows }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));

    await waitFor(() => expect(result.current.isFull).toBe(true));
  });

  it("hides the shelf when the listing itself fails", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/maps": () => reply(500, {}),
      }),
    );

    const { result } = renderHook(() => useCloudBag("maps"));

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.items).toEqual([]);
  });
});

describe("save", () => {
  it("POSTs a new name, then re-lists so bytes/updated are the server's", async () => {
    let rows: unknown[] = [];
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": (init) => {
          if (init?.method === "POST") {
            rows = [DECK_ROW];
            return reply(201, { id: DECK_ROW.id });
          }
          return reply(200, { decks: rows });
        },
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const outcome = await result.current.save("Bruce Lee", { id: "deck" });
      expect(outcome).toEqual({
        ok: true,
        value: { id: DECK_ROW.id, replaced: false },
      });
    });

    expect(result.current.items).toEqual([DECK_ROW]);
    expect(pathsCalled()).toEqual([
      "GET /me",
      "GET /bag/decks",
      "POST /bag/decks",
      "GET /bag/decks",
    ]);
  });

  it("PUTs over a same-named item instead of eating a second slot", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: [DECK_ROW] }),
        "/bag/decks/:id": () => reply(200, { id: DECK_ROW.id }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const outcome = await result.current.save("Bruce Lee", { id: "deck" });
      expect(outcome).toEqual({
        ok: true,
        value: { id: DECK_ROW.id, replaced: true },
      });
    });

    expect(pathsCalled()).toContain(`PUT /bag/decks/${DECK_ROW.id}`);
    expect(pathsCalled()).not.toContain("POST /bag/decks");
  });

  it("hands the cap refusal back for a toast, and leaves the list alone", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": (init) =>
          init?.method === "POST"
            ? reply(409, { error: "cap_reached", cap: 100 })
            : reply(200, { decks: [DECK_ROW] }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const outcome = await result.current.save("Something else", {});
      expect(outcome).toEqual({ ok: false, reason: "cap_reached" });
    });

    // No re-list after a refusal: one press, one request.
    expect(pathsCalled().filter((p) => p === "GET /bag/decks")).toHaveLength(1);
  });

  it("hands back `too_large` for an oversize deck", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": (init) =>
          init?.method === "POST"
            ? reply(413, { error: "too_large", limit: 262144 })
            : reply(200, { decks: [] }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      const outcome = await result.current.save("Huge", {});
      expect(outcome).toEqual({ ok: false, reason: "too_large" });
    });
  });
});

describe("load and remove", () => {
  it("load returns just the payload, for the existing import path", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: [DECK_ROW] }),
        "/bag/decks/:id": () =>
          reply(200, { id: DECK_ROW.id, name: "Bruce Lee", data: { id: "d1" } }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await expect(result.current.load(DECK_ROW.id)).resolves.toEqual({
        ok: true,
        value: { id: "d1" },
      });
    });
  });

  it("remove drops the row and re-lists", async () => {
    let rows: unknown[] = [DECK_ROW];
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: rows }),
        "/bag/decks/:id": (init) => {
          if (init?.method === "DELETE") {
            rows = [];
            return { ok: true, status: 204 } as Response;
          }
          return reply(404, { error: "not_found" });
        },
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await expect(result.current.remove(DECK_ROW.id)).resolves.toEqual({
        ok: true,
        value: null,
      });
    });

    expect(result.current.items).toEqual([]);
  });

  it("reports a vanished item without emptying the shelf", async () => {
    install(
      route({
        "/me": () => reply(200, { user: USER }),
        "/bag/decks": () => reply(200, { decks: [DECK_ROW] }),
        "/bag/decks/:id": () => reply(404, { error: "not_found" }),
      }),
    );

    const { result } = renderHook(() => useCloudBag("decks"));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      await expect(result.current.remove(DECK_ROW.id)).resolves.toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    expect(result.current.items).toHaveLength(1);
  });
});
