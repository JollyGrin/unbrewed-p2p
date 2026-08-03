/**
 * The account probe (#459) is the one place the static site talks to the
 * accounts API, and the whole point of the ticket is that it can NEVER break
 * guest play. These tests pin that contract: every failure shape lands on "no
 * account", the probe fires exactly once per page load no matter how many
 * chips mount, and a dead API is distinguishable from a signed-out one so the
 * UI can hide the affordance instead of dangling a broken link.
 */
import "@testing-library/jest-dom";
import { renderHook, waitFor, act } from "@testing-library/react";
import { API_URL } from "./apiUrl";
import {
  __resetAccountStoreForTests,
  signInUrl,
  signOut,
  useAccount,
} from "./useAccount";

const USER = {
  id: "u1",
  username: "JollyGrin",
  avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png",
};

/** A `fetch` reply with just the bits the probe reads. */
const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

beforeEach(() => {
  __resetAccountStoreForTests();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("useAccount", () => {
  it("reports the signed-in user from /me", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));

    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("signed-in"));
    expect(result.current.account).toEqual(USER);
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/me`,
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("treats 401 as a guest (the documented signed-out reply)", async () => {
    fetchMock.mockResolvedValue(reply(401, { user: null }));

    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("guest"));
    expect(result.current.account).toBeNull();
  });

  it("treats a network failure as offline, not as an error", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useAccount());

    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.account).toBeNull();
  });

  it("treats a 5xx / malformed body as offline or guest, never a throw", async () => {
    fetchMock.mockResolvedValue(reply(500, {}));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("offline"));

    __resetAccountStoreForTests();
    fetchMock.mockResolvedValue(reply(200, { user: { nope: true } }));
    const second = renderHook(() => useAccount());
    await waitFor(() => expect(second.result.current.status).toBe("guest"));
  });

  it("probes /me exactly once no matter how many chips mount", async () => {
    fetchMock.mockResolvedValue(reply(401, { user: null }));

    const first = renderHook(() => useAccount());
    const second = renderHook(() => useAccount());
    const third = renderHook(() => useAccount());

    await waitFor(() => expect(first.result.current.status).toBe("guest"));
    await waitFor(() => expect(second.result.current.status).toBe("guest"));
    expect(third.result.current.status).toBe("guest");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry after a failure (one dead request per page load)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const { result, rerender } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("offline"));
    rerender();
    renderHook(() => useAccount());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("signOut posts to /auth/logout, then refetches and updates every consumer", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    const first = renderHook(() => useAccount());
    const second = renderHook(() => useAccount());
    await waitFor(() => expect(first.result.current.status).toBe("signed-in"));

    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/auth/logout")
        ? reply(204, null)
        : reply(401, { user: null }),
    );
    await act(async () => {
      await signOut();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/logout`,
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
    expect(first.result.current.status).toBe("guest");
    expect(second.result.current.status).toBe("guest");
  });

  it("still lands on guest when the logout request itself fails", async () => {
    fetchMock.mockResolvedValue(reply(200, { user: USER }));
    const { result } = renderHook(() => useAccount());
    await waitFor(() => expect(result.current.status).toBe("signed-in"));

    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/logout")) throw new TypeError("Failed to fetch");
      return reply(401, { user: null });
    });
    await act(async () => {
      await signOut();
    });

    expect(result.current.status).toBe("guest");
  });
});

describe("signInUrl", () => {
  it("round-trips the current path", () => {
    expect(signInUrl("/pro?vs=bot")).toBe(
      `${API_URL}/auth/discord?return_to=${encodeURIComponent("/pro?vs=bot")}`,
    );
  });

  it("falls back to / for anything that isn't a same-site path", () => {
    const home = `${API_URL}/auth/discord?return_to=${encodeURIComponent("/")}`;
    expect(signInUrl(undefined)).toBe(home);
    expect(signInUrl("https://evil.example")).toBe(home);
    // protocol-relative — a path by the naive `startsWith("/")` test
    expect(signInUrl("//evil.example")).toBe(home);
  });
});
