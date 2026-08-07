/**
 * The "Discord server perks" card (#578), rendered through the real /account
 * page so the guest gate and the "card doesn't exist" rule are exercised where
 * they actually live.
 *
 * What these pin:
 *  - the four states: unlinked, linked, stale (re-link), and hidden;
 *  - a 503 — the normal answer on a deploy with no Discord app — removes the
 *    card entirely rather than showing an error, with the rest of /account
 *    untouched;
 *  - a GUEST makes zero /me/discord requests, and a signed-in visit makes
 *    exactly one;
 *  - the refresh rate limit (429) is a quiet toast that leaves the linked card
 *    exactly as it was.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { AccountPage } from "./AccountPage";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";

jest.mock("next/router", () => ({
  useRouter: () => ({ asPath: "/account", query: {}, push: jest.fn() }),
}));
// Relative paths: SWC rewrites `@/` in imports, but not inside jest.mock().
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("../../lib/pro/replayStore", () => ({ listReplays: () => [] }));

const USER = { id: "u1", username: "JollyGrin", avatarUrl: null };

const LINKED = {
  linked: true,
  stale: false,
  lastPushAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};
const UNLINKED = { linked: false, stale: false, lastPushAt: null };
const STALE = { ...LINKED, stale: true };

const reply = (status: number, body?: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

let fetchMock: jest.Mock;

/** Signed in, empty stats/history shelves, and whatever the test wants for Discord. */
const signedInWithDiscord = (
  discord: (method: string, url: string) => Response | undefined,
) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/me")) return reply(200, { user: USER });
    if (url.includes("/me/stats")) return reply(503, {});
    if (url.includes("/me/games"))
      return reply(200, { games: [], nextBefore: null });
    if (url.includes("/me/discord")) {
      const answer = discord(method, url);
      if (answer) return answer;
    }
    throw new TypeError(`unexpected fetch: ${method} ${url}`);
  });
};

/** The common case: one status answer, no writes expected. */
const statusIs = (status: number, body?: unknown) =>
  signedInWithDiscord((method, url) =>
    method === "GET" && url.endsWith("/me/discord")
      ? reply(status, body)
      : undefined,
  );

const renderPage = () =>
  render(
    <ChakraProvider>
      <AccountPage />
    </ChakraProvider>,
  );

const discordRequests = () =>
  fetchMock.mock.calls.filter(([url]: [string]) => url.includes("/me/discord"));

const card = () => screen.queryByTestId("account-discord");

beforeEach(() => {
  __resetAccountStoreForTests();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("AccountDiscord — the four states", () => {
  it("unlinked: explains what is shared and offers the OAuth link", async () => {
    statusIs(200, UNLINKED);

    renderPage();

    const button = await screen.findByTestId("discord-link-button");
    expect(button).toHaveTextContent("Link Discord");
    // A real cross-origin navigation, not a fetch: an <a> to the API's link
    // route carrying the path to come back to.
    expect(button.getAttribute("href")).toMatch(
      /\/auth\/discord\/link\?return_to=%2Faccount$/,
    );
    expect(card()).toHaveTextContent("@Veteran");
    expect(card()).toHaveTextContent("only your level and win counts");
    expect(screen.queryByTestId("discord-sync-button")).toBeNull();
  });

  it("linked: says when it last synced, and offers sync + unlink", async () => {
    statusIs(200, LINKED);

    renderPage();

    await screen.findByTestId("discord-sync-button");
    expect(card()).toHaveTextContent("Last synced 5 minutes ago.");
    expect(screen.getByTestId("discord-unlink-button")).toBeInTheDocument();
    expect(screen.queryByTestId("discord-link-button")).toBeNull();
  });

  it("linked but never pushed: says so instead of inventing a time", async () => {
    statusIs(200, { linked: true, stale: false, lastPushAt: null });

    renderPage();

    await screen.findByTestId("discord-sync-button");
    expect(card()).toHaveTextContent("Not synced yet.");
  });

  it("stale: asks for a re-link through the same OAuth button", async () => {
    statusIs(200, STALE);

    renderPage();

    const button = await screen.findByTestId("discord-link-button");
    expect(button).toHaveTextContent("Re-link Discord");
    expect(button.getAttribute("href")).toMatch(/\/auth\/discord\/link\?/);
    expect(card()).toHaveTextContent("Re-link to get your roles back.");
    // Nothing to sync on a grant Discord no longer honours.
    expect(screen.queryByTestId("discord-sync-button")).toBeNull();
  });

  it("hidden: a 503 leaves no card at all, and the rest of /account stands", async () => {
    statusIs(503, { error: "linked_roles_not_configured" });

    renderPage();

    // The page itself is up…
    await screen.findByText("My record");
    await waitFor(() => expect(discordRequests()).toHaveLength(1));
    // …and the card never appears, in any form.
    expect(card()).toBeNull();
    expect(screen.queryByText("Discord server perks")).toBeNull();
  });

  it("hidden: an unreachable API is the same nothing", async () => {
    signedInWithDiscord(() => {
      throw new TypeError("network");
    });

    renderPage();

    await screen.findByText("My record");
    await waitFor(() => expect(discordRequests()).toHaveLength(1));
    expect(card()).toBeNull();
  });
});

describe("AccountDiscord — request budget", () => {
  it("a guest asks nothing about Discord", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/me")) return reply(401, { error: "unauthorized" });
      throw new TypeError(`unexpected fetch: ${url}`);
    });

    renderPage();

    await screen.findByText("Sign in with Discord");
    expect(discordRequests()).toHaveLength(0);
    expect(card()).toBeNull();
  });

  it("a signed-in visit asks exactly once", async () => {
    statusIs(200, UNLINKED);

    renderPage();

    await screen.findByTestId("discord-link-button");
    expect(discordRequests()).toHaveLength(1);
  });
});

describe("AccountDiscord — sync and unlink", () => {
  it("sync now takes the fresh timestamp from the refresh reply", async () => {
    const pushed = { linked: true, stale: false, lastPushAt: new Date().toISOString() };
    signedInWithDiscord((method, url) => {
      if (method === "GET") return reply(200, LINKED);
      if (url.endsWith("/refresh")) return reply(200, pushed);
      return undefined;
    });

    renderPage();

    fireEvent.click(await screen.findByTestId("discord-sync-button"));

    await waitFor(() =>
      expect(card()).toHaveTextContent("Last synced just now."),
    );
  });

  it("a 429 is a quiet toast and changes nothing on the card", async () => {
    signedInWithDiscord((method, url) => {
      if (method === "GET") return reply(200, LINKED);
      if (url.endsWith("/refresh")) return reply(429, { error: "rate_limited" });
      return undefined;
    });

    renderPage();

    fireEvent.click(await screen.findByTestId("discord-sync-button"));

    await screen.findByText(/try again in a minute/i);
    // Still linked, still showing the same last-synced line — a rate limit is
    // "you already did this", not a failure worth undoing the UI over.
    expect(card()).toHaveTextContent("Last synced 5 minutes ago.");
    expect(screen.getByTestId("discord-sync-button")).toBeInTheDocument();
  });

  it("a failed sync says so without dropping the link", async () => {
    signedInWithDiscord((method, url) => {
      if (method === "GET") return reply(200, LINKED);
      if (url.endsWith("/refresh")) return reply(503, { error: "upstream_unavailable" });
      return undefined;
    });

    renderPage();

    fireEvent.click(await screen.findByTestId("discord-sync-button"));

    await screen.findByText(/couldn't sync/i);
    expect(screen.getByTestId("discord-sync-button")).toBeInTheDocument();
  });

  it("unlink drops straight back to the unlinked card", async () => {
    signedInWithDiscord((method, url) => {
      if (method === "GET") return reply(200, LINKED);
      if (url.endsWith("/unlink")) return { ok: true, status: 204 } as Response;
      return undefined;
    });

    renderPage();

    fireEvent.click(await screen.findByTestId("discord-unlink-button"));

    // No re-read: the 204 is the answer, so the card flips on its own.
    await screen.findByTestId("discord-link-button");
    expect(screen.queryByTestId("discord-sync-button")).toBeNull();
    expect(discordRequests()).toHaveLength(2);
  });
});
