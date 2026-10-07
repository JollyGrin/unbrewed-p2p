/**
 * Round-4 review (p2p #1278) through the real pages with a faked api: load
 * failure retry (S11), an expired session (B3), errors that clear themselves
 * (journeys S3), the /pro banner's cooldown (F4), and the join panel (S4, S21, B3).
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetReseatCooldownsForTests } from "@/lib/tournaments/api";
import { FIXTURE_MATCH_YOU, fixtureMatch, fixtureMyTournaments } from "@/lib/tournaments/fixtures";
import { clock } from "@/lib/tournaments/matchPage";
import { nextMatchView, sizeOf } from "@/lib/tournaments/nextMatch";
import type { Entry, Tournament } from "@/lib/tournaments/types";

import { JoinPanel } from "./EventView";
import { MatchView } from "./MatchView";
import { NextMatchCard } from "./NextMatchBanner";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn(), asPath: "/pro" }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const reply = (status: number, b: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => b }) as Response;
const ME = { user: { id: FIXTURE_MATCH_YOU, username: "hokuto_shin", avatarUrl: null } };

beforeEach(() => {
  __resetAccountStoreForTests();
  __resetReseatCooldownsForTests();
});
afterEach(() => jest.restoreAllMocks());

describe("match page", () => {
  const f = fixtureMatch("waiting", new Date().toISOString());
  const page = () => render(<ChakraProvider><MatchView slug={f.tournament.slug} matchId={f.detail.match.id} /></ChakraProvider>);
  const event = () => reply(200, { tournament: f.tournament, entries: f.entries, matches: f.matches });

  it("UX S11: a load failure says it retries and offers Try again", async () => {
    let up = false;
    global.fetch = jest.fn(async (url: string) => {
      if (url === `${API_URL}/me`) return reply(200, ME);
      if (url.includes("/matches/")) return up ? reply(200, f.detail) : reply(503, {});
      if (url.endsWith(`/tournaments/${f.tournament.slug}`)) return event();
      return reply(404, {});
    }) as unknown as typeof fetch;
    page();
    expect(await screen.findByText(/Retrying automatically/)).toBeInTheDocument();
    up = true;
    fireEvent.click(screen.getByTestId("match-retry"));
    expect(await screen.findByTestId("match-page")).toBeInTheDocument();
  });

  it("UX B3: a 401 on Play shows Sign in with Discord and re-probes the session", async () => {
    let meCalls = 0;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API_URL}/me`) {
        meCalls++;
        return reply(200, ME); // the probe still says signed in: the button must come from the 401
      }
      if (url.includes("/matches/") && url.endsWith("/ticket")) return reply(401, {});
      if (url.endsWith("/ready") && init?.method === "POST") return reply(401, {});
      if (url.includes("/matches/")) return reply(200, f.detail);
      if (url.endsWith(`/tournaments/${f.tournament.slug}`)) return event();
      return reply(404, {});
    }) as unknown as typeof fetch;
    page();
    const box = await screen.findByTestId("play-box");
    await waitFor(() => expect(within(box).getByTestId("play-button")).toBeEnabled());
    const before = meCalls;
    await act(async () => void fireEvent.click(within(box).getByTestId("play-button")));
    const btn = await screen.findByTestId("play-sign-in");
    expect(btn.closest("a")?.getAttribute("href")).toContain(encodeURIComponent(`/tournaments?t=${f.tournament.slug}&m=${f.detail.match.id}`));
    await waitFor(() => expect(meCalls).toBeGreaterThan(before));
  });

  it("journeys S3: 'Couldn't reach the server' clears once the api answers a later poll", async () => {
    let now = Date.now();
    jest.spyOn(Date, "now").mockImplementation(() => now);
    let release: (() => void) | null = null;
    let held = false;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API_URL}/me`) return reply(200, ME);
      if (url.endsWith("/ready") && init?.method === "POST") {
        held = true; // the poll the failed press triggers answers only later
        throw new TypeError("network down");
      }
      if (url.endsWith("/ticket")) return reply(200, { action: "create", ticket: "t", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "", roomId: null });
      if (url.includes("/matches/")) {
        if (held && !release) await new Promise<void>((ok) => (release = ok));
        return reply(200, f.detail);
      }
      if (url.endsWith(`/tournaments/${f.tournament.slug}`)) return event();
      return reply(404, {});
    }) as unknown as typeof fetch;
    page();
    const box = await screen.findByTestId("play-box");
    await waitFor(() => expect(within(box).getByTestId("play-button")).toBeEnabled());
    await act(async () => void fireEvent.click(within(box).getByTestId("play-button")));
    expect(await screen.findByTestId("play-error")).toHaveTextContent("Couldn't reach the server. Try again.");
    await waitFor(() => expect(release).not.toBeNull());
    expect(screen.getByTestId("play-error")).toBeInTheDocument();
    now += 6_000;
    held = false;
    await act(async () => release!());
    await waitFor(() => expect(screen.queryByTestId("play-error")).toBeNull());
  });
});

describe("/pro banner", () => {
  const card = (state: "waiting", until?: string) => {
    const my = fixtureMyTournaments(state, new Date().toISOString());
    if (until) my.nextMatch!.match.reseatCooldownUntil = until;
    const detail = fixtureMatch(state, new Date().toISOString()).detail;
    detail.match = my.nextMatch!.match;
    return nextMatchView(my.nextMatch!, detail, sizeOf(my.nextMatch!, my.tournaments), Date.now());
  };

  it("interactions F4: a cooldown disables Play and says when it opens, in local time", () => {
    const until = new Date(Date.now() + 20 * 60_000).toISOString();
    render(<ChakraProvider><NextMatchCard view={card("waiting", until)} myName="hokuto_shin" /></ChakraProvider>);
    expect(screen.getByRole("button", { name: "I'm ready to play" })).toBeDisabled();
    expect(screen.getByTestId("next-match-notice")).toHaveTextContent(`This match was re-seated. Play opens at ${clock(until)} (local time).`);
    expect(screen.getByTestId("next-match-caption")).toHaveAttribute("aria-live", "polite");
  });

  it("journeys S3: a failed press's message clears when the situation changes, no reload", async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/ready") && init?.method === "POST") return reply(503, {});
      if (url.includes("/matches/")) return reply(200, fixtureMatch("waiting", new Date().toISOString()).detail);
      return reply(404, {});
    }) as unknown as typeof fetch;
    const open = card("waiting");
    const r = render(<ChakraProvider><NextMatchCard view={open} myName="hokuto_shin" /></ChakraProvider>);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "I'm ready to play" })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server.");
    // The match moved on (the opponent pressed Play): a new situation.
    r.rerender(<ChakraProvider><NextMatchCard view={{ ...open, state: "opponent_ready", primary: "join", primaryLabel: "Join now" }} myName="hokuto_shin" /></ChakraProvider>);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("UX B3: a 401 offers Sign in with Discord", async () => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/ready") && init?.method === "POST") return reply(401, {});
      if (url.includes("/matches/")) return reply(401, {});
      if (url === `${API_URL}/me`) return reply(401, {});
      return reply(404, {});
    }) as unknown as typeof fetch;
    render(<ChakraProvider><NextMatchCard view={card("waiting")} myName="hokuto_shin" /></ChakraProvider>);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "I'm ready to play" })));
    expect(await screen.findByTestId("next-match-sign-in")).toHaveTextContent("Sign in with Discord");
  });
});

describe("join panel", () => {
  const T: Tournament = {
    id: "t1", slug: "lab-rats-open", name: "Lab Rats Open",
    organizer: { userId: "org", username: "cecil", avatarUrl: "" },
    format: "single_elim", size: 8, firstTo: 1, matchWindowHours: 48,
    matchupRule: { mode: "free" }, roundMaps: null, status: "signup",
    signupClosesAt: "2030-01-01T00:00:00Z", startsAt: null, createdAt: "2026-10-01T00:00:00Z",
    settings: {}, entryCount: 3, signupOpen: true, latestPossibleFinal: null,
  };
  const entry = (userId: string, n: number): Entry => ({
    id: `e${n}`, userId, username: userId, avatarUrl: "", seed: null, joinedAt: `2026-10-0${n}T00:00:00Z`, leftAt: null,
  });
  const serve = (me: boolean, join = 201) => {
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API_URL}/me`) return me ? reply(200, { user: { id: "hok", username: "hokuto_shin", avatarUrl: null } }) : reply(401, {});
      if (init?.method === "POST") return reply(join, {});
      return reply(404, {});
    }) as unknown as typeof fetch;
  };
  const mount = (t: Tournament, entries: Entry[]) => render(<ChakraProvider><JoinPanel t={t} entries={entries} reload={() => {}} /></ChakraProvider>);

  it("UX S4/S21: joined says 'player N of M'; Discord is promised only when the bot is live", async () => {
    serve(true);
    const entries = [entry("a", 1), entry("b", 2), entry("hok", 3)];
    const r = mount(T, entries);
    expect(await screen.findByText("You're in, player 3 of 8.")).toBeInTheDocument();
    expect(screen.getByTestId("join-panel")).toHaveTextContent("Check this page for your match");
    expect(screen.getByTestId("join-panel")).not.toHaveTextContent("Discord");
    r.unmount();
    mount({ ...T, notifications: "discord" }, entries);
    expect(await screen.findByText(/We'll ping you on Discord when your match is ready/)).toBeInTheDocument();
  });

  it("UX S4: signed out, no Discord ping promised unless the bot is live", async () => {
    serve(false);
    const r = mount(T, [entry("a", 1)]);
    await screen.findByRole("link", { name: /sign in with discord to join/i });
    expect(screen.getByTestId("join-panel")).not.toHaveTextContent("ping you");
    r.unmount();
    mount({ ...T, notifications: "discord" }, [entry("a", 1)]);
    expect(await screen.findByText(/We use Discord to ping you when your match opens/)).toBeInTheDocument();
  });

  it("UX B3: a 401 on Join offers Sign in with Discord", async () => {
    serve(true, 401);
    mount(T, [entry("a", 1)]);
    const join = await screen.findByRole("button", { name: /join lab rats open/i });
    await act(async () => void fireEvent.click(join));
    expect(await screen.findByTestId("join-sign-in")).toHaveTextContent("Sign in with Discord");
  });
});
