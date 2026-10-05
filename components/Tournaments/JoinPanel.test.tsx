/** Join / leave states (#1216), driven through the real JoinPanel with a faked api. */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { JoinPanel } from "./EventView";
import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import type { Entry, Tournament } from "@/lib/tournaments/types";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const reply = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const T: Tournament = {
  id: "t1", slug: "lab-rats-open", name: "Lab Rats Open",
  organizer: { userId: "org", username: "cecil", avatarUrl: "" },
  format: "single_elim", size: 8, firstTo: 1, matchWindowHours: 48,
  matchupRule: { mode: "free" }, roundMaps: null, status: "signup",
  signupClosesAt: "2030-01-01T00:00:00Z", startsAt: null, createdAt: "2026-10-01T00:00:00Z",
  settings: {}, entryCount: 5, signupOpen: true, latestPossibleFinal: null,
};
const entry = (userId: string, n: number): Entry => ({
  id: `e${n}`, userId, username: userId, avatarUrl: "", seed: null,
  joinedAt: `2026-10-0${n}T00:00:00Z`, leftAt: null,
});
const FIVE = [1, 2, 3, 4, 5].map((n) => entry(`u${n}`, n));

let me: "guest" | "me";
let calls: { url: string; method: string }[];
const reload = jest.fn();

beforeEach(() => {
  __resetAccountStoreForTests();
  calls = [];
  reload.mockClear();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET" });
    if (url === `${API_URL}/me`)
      return me === "me" ? reply(200, { user: { id: "hok", username: "hokuto_shin", avatarUrl: null } }) : reply(401, {});
    if (init?.method === "POST") return reply(201, { entry: entry("hok", 6) });
    if (init?.method === "DELETE") return reply(200, { ok: true });
    return reply(404, {});
  }) as unknown as typeof fetch;
});

const mount = (t: Tournament, entries: Entry[]) =>
  render(<ChakraProvider><JoinPanel t={t} entries={entries} reload={reload} /></ChakraProvider>);

describe("JoinPanel", () => {
  it("signed out: Sign in with Discord to join, returning to the event", async () => {
    me = "guest";
    mount(T, FIVE);
    const link = await screen.findByRole("link", { name: /sign in with discord to join/i });
    const href = link.getAttribute("href")!;
    expect(decodeURIComponent(href)).toContain("return_to=/tournaments?t=lab-rats-open&join=1");
  });

  it("signed in: one tap joins, then the panel refreshes", async () => {
    me = "me";
    mount(T, FIVE);
    fireEvent.click(await screen.findByRole("button", { name: /join lab rats open/i }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(calls).toContainEqual({ url: `${API_URL}/tournaments/lab-rats-open/entries`, method: "POST" });
  });

  it("joined: 'You're seat 6 of 8' and Leave", async () => {
    me = "me";
    mount({ ...T, entryCount: 6 }, [...FIVE, entry("hok", 6)]);
    expect(await screen.findByText(/you're seat 6 of 8/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /leave tournament/i }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(calls).toContainEqual({ url: `${API_URL}/tournaments/lab-rats-open/entries/me`, method: "DELETE" });
  });

  it("after signup closes there is no Leave", async () => {
    me = "me";
    mount({ ...T, signupOpen: false, status: "running" }, [...FIVE, entry("hok", 6)]);
    expect(await screen.findByText(/you're seat 6 of 8/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /leave/i })).toBeNull();
  });

  it("full / closed show a plain sentence and no join control", async () => {
    me = "me";
    mount({ ...T, signupOpen: false, entryCount: 8 }, FIVE);
    expect(await screen.findByText(/all seats are taken/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /join/i })).toBeNull();
  });

  it("a refused join (signup_closed) is said out loud", async () => {
    me = "me";
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) =>
      url === `${API_URL}/me` ? reply(200, { user: { id: "hok", username: "h", avatarUrl: null } })
        : init?.method === "POST" ? reply(409, { error: "signup_closed" }) : reply(404, {}));
    mount(T, FIVE);
    fireEvent.click(await screen.findByRole("button", { name: /join lab rats open/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/signup has closed/i);
  });
});
