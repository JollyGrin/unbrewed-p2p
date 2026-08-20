/**
 * The unified bag (#644).
 *
 * Two promises hold this feature up, and both are easy to break by accident:
 *
 * 1. **A guest is untouched.** Signed out — or pointed at an API that isn't
 *    there — the bag is localStorage, byte for byte, and costs ZERO requests
 *    beyond the `/me` probe that shipped with #459.
 * 2. **A signed-in user's bag is their account.** Adds and imports go up and do
 *    not touch localStorage at all, unless the API refuses — in which case the
 *    item is kept on the device rather than lost.
 *
 * Plus the thing a signed-in player would notice first if it broke: the deck
 * they starred still resolves at game start when it lives in the account.
 */
import "@testing-library/jest-dom";
import { act, renderHook, waitFor } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { LS_KEY } from "@/lib/hooks/useLocalStorage";
import { readStarredDeck } from "@/lib/sandbox/initGame";
import { __resetBagStoresForTests, setStar } from "./bagStore";
import { useBagDecks, useBagMaps } from "./useBag";

jest.mock("react-hot-toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const deck = (id: string, name = id) =>
  ({ id, name, version_id: `${id}-v1`, deck_data: { cards: [] } }) as any;

const CLOUD_ROW = (id: string, name: string) => ({
  id,
  name,
  bytes: 128,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
});

let fetchMock: jest.Mock;

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const install = (handler: (url: string, init?: any) => Response | Promise<Response>) => {
  fetchMock = jest.fn(async (url: string, init?: any) => handler(url, init));
  global.fetch = fetchMock as unknown as typeof fetch;
};

const paths = () =>
  fetchMock.mock.calls.map(
    ([url, init]) => `${init?.method ?? "GET"} ${url.replace(API_URL, "")}`,
  );

/**
 * A signed-in user whose account holds `rows` decks (payloads keyed by row id),
 * with every write accepted. Returns the mutable server-side state so a test
 * can assert on what was actually uploaded.
 */
const signedInApi = (options?: {
  deckRows?: { row: ReturnType<typeof CLOUD_ROW>; data: unknown }[];
  onCreate?: (kind: string, body: any) => Response | undefined;
}) => {
  const server = {
    decks: options?.deckRows ?? [],
    created: [] as { kind: string; name: string; data: any }[],
  };
  install((url, init) => {
    const path = url.replace(API_URL, "");
    if (path === "/me") return reply(200, { user: USER });
    if (path === "/bag/decks" && (init?.method ?? "GET") === "GET") {
      return reply(200, { decks: server.decks.map((entry) => entry.row) });
    }
    if (path === "/bag/maps" && (init?.method ?? "GET") === "GET") {
      return reply(200, { maps: [] });
    }
    if (init?.method === "POST" && path.startsWith("/bag/")) {
      const kind = path.slice("/bag/".length);
      const body = JSON.parse(init.body);
      const override = options?.onCreate?.(kind, body);
      if (override) return override;
      server.created.push({ kind, name: body.name, data: body.data });
      return reply(201, { id: `cloud-${server.created.length}` });
    }
    if (path.startsWith("/bag/decks/")) {
      const id = path.slice("/bag/decks/".length);
      const entry = server.decks.find((row) => row.row.id === id);
      return entry
        ? reply(200, { id, name: entry.row.name, data: entry.data })
        : reply(404, { error: "not_found" });
    }
    throw new TypeError(`unrouted ${path}`);
  });
  return server;
};

beforeEach(() => {
  localStorage.clear();
  __resetAccountStoreForTests();
  __resetBagStoresForTests();
});

describe("a guest", () => {
  it("gets the localStorage bag and costs nothing beyond the /me probe", async () => {
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify([deck("d1", "Bruce Lee")]));
    install(() => reply(401, { user: null }));

    const { result } = renderHook(() => useBagDecks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.decks).toEqual([deck("d1", "Bruce Lee")]);
    expect(result.current.sourceOf("d1")).toBe("device");
    expect(paths()).toEqual(["GET /me"]);
  });

  it("writes an added deck straight to localStorage and stars it", async () => {
    install(() => reply(401, { user: null }));
    const { result } = renderHook(() => useBagDecks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      expect(await result.current.pushDeck(deck("d1", "Bruce Lee"))).toBe(true);
    });

    expect(JSON.parse(localStorage.getItem(LS_KEY.DECKS)!)).toHaveLength(1);
    expect(localStorage.getItem(LS_KEY.STAR_DECK)).toBe("d1");
    expect(paths()).toEqual(["GET /me"]); // still nothing but the probe
  });

  it("keeps working, on the device, when the API is unreachable entirely", async () => {
    localStorage.setItem(LS_KEY.MAP_LIST, JSON.stringify([{ imgUrl: "a.png" }]));
    install(() => {
      throw new TypeError("Failed to fetch");
    });

    const { result } = renderHook(() => useBagMaps());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ imgUrl: "a.png" }]);
  });
});

describe("a signed-in user", () => {
  it("returns the account's decks in the same shape a guest's bag has", async () => {
    signedInApi({
      deckRows: [
        { row: CLOUD_ROW("row-1", "Bruce Lee"), data: deck("d1", "Bruce Lee") },
      ],
    });

    const { result } = renderHook(() => useBagDecks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.decks).toEqual([deck("d1", "Bruce Lee")]);
    expect(result.current.sourceOf("d1")).toBe("cloud");
    expect(result.current.cloudIdOf("d1")).toBe("row-1");
  });

  it("merges the account's items with anything still on the device", async () => {
    localStorage.setItem(LS_KEY.DECKS, JSON.stringify([deck("d2", "Yennenga")]));
    signedInApi({
      deckRows: [
        { row: CLOUD_ROW("row-1", "Bruce Lee"), data: deck("d1", "Bruce Lee") },
      ],
    });

    const { result } = renderHook(() => useBagDecks());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.decks?.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(result.current.sourceOf("d1")).toBe("cloud");
    expect(result.current.sourceOf("d2")).toBe("device");
  });

  it("sends an added deck to the account and never touches localStorage", async () => {
    const server = signedInApi();
    const { result } = renderHook(() => useBagDecks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.pushDeck(deck("d1", "Bruce Lee"));
    });

    expect(server.created).toEqual([
      { kind: "decks", name: "Bruce Lee", data: deck("d1", "Bruce Lee") },
    ]);
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
    await waitFor(() => expect(result.current.sourceOf("d1")).toBe("cloud"));
  });

  it("keys the account item by the deck's id, so same-named decks coexist", async () => {
    const server = signedInApi();
    const { result } = renderHook(() => useBagDecks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.pushDeck(deck("d1", "Bruce Lee"));
      await result.current.pushDeck(deck("d2", "Bruce Lee"));
    });

    // #566 matched on name and would have PUT over the first one.
    expect(server.created).toHaveLength(2);
    expect(result.current.decks?.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("falls back to the device when the account refuses the write", async () => {
    signedInApi({ onCreate: () => reply(413, { error: "too_large" }) });
    const { result } = renderHook(() => useBagDecks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      // Still "true": the deck was kept, which is what the caller toasts on.
      expect(await result.current.pushDeck(deck("d1", "Bruce Lee"))).toBe(true);
    });

    expect(JSON.parse(localStorage.getItem(LS_KEY.DECKS)!)).toEqual([
      deck("d1", "Bruce Lee"),
    ]);
    await waitFor(() => expect(result.current.sourceOf("d1")).toBe("device"));
  });

  it("resolves a starred ACCOUNT deck at game start", async () => {
    signedInApi({
      deckRows: [
        { row: CLOUD_ROW("row-1", "Bruce Lee"), data: deck("d1", "Bruce Lee") },
      ],
    });
    const { result } = renderHook(() => useBagDecks());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => setStar("d1"));

    // The pool builder reads through the store, not straight out of localStorage
    // — which holds no decks at all here.
    expect(localStorage.getItem(LS_KEY.DECKS)).toBeNull();
    expect(readStarredDeck()?.id).toBe("d1");
  });
});
