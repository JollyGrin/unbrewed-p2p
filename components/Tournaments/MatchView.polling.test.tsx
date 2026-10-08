/**
 * The match page's request rate and its event source: a match detail that
 * carries the event (newer api) is the page's ONE poll; an older api's detail
 * falls back to polling the whole tournament too.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";

import { MatchView } from "./MatchView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div /> }));
jest.mock("../../lib/pro/useProLiveRoster", () => ({
  useProLiveRosterState: () => ({ heroes: [], offline: false }),
}));
const mockAccount = jest.fn();
jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => mockAccount(),
}));

const f = fixtureMatch("waiting");
const SLUG = f.tournament.slug;
const ORGANIZER = f.tournament.organizer.userId;

/** The match detail as a newer api sends it: the event rides along. */
const withEvent = (viewerIsOrganizer: boolean) => ({
  ...f.detail,
  tournament: {
    ...f.detail.tournament,
    size: f.tournament.size,
    latestPossibleFinal: f.tournament.latestPossibleFinal,
    settings: f.tournament.settings,
    organizer: f.tournament.organizer,
    viewerIsOrganizer,
    entryNames: { [f.detail.match.slotA!]: "alpha_named", [f.detail.match.slotB!]: "bravo_named" },
    roomOpenGraceMs: 90_000,
    roomGoneMinAgeMs: 30_000,
  },
});

/** Routes the match detail and the whole tournament; counts every request by kind. */
const serve = (detail: unknown) => {
  const counts = { match: 0, tournament: 0, other: 0 };
  global.fetch = jest.fn(async (url: string) => {
    const path = url.replace(API_URL, "");
    const body =
      path === `/tournaments/${SLUG}/matches/m2-1`
        ? (counts.match++, detail)
        : path === `/tournaments/${SLUG}`
          ? (counts.tournament++, { tournament: f.tournament, entries: f.entries, matches: f.matches, standings: null })
          : (counts.other++, null);
    return { ok: !!body, status: body ? 200 : 404, headers: new Headers(), json: async () => body ?? { error: "not_found" } };
  }) as unknown as typeof fetch;
  return counts;
};

const mount = () =>
  render(
    <ChakraProvider>
      <MatchView slug={SLUG} matchId="m2-1" />
    </ChakraProvider>,
  );

const elapse = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
/** A minute in 1 s steps, so each poll's reload renders (and fetches) before the next one. */
const aMinute = async () => {
  for (let i = 0; i < 60; i++) await elapse(1000);
};

beforeEach(() => {
  jest.useFakeTimers({ now: Date.parse(FIXTURE_NOW) });
  mockAccount.mockReturnValue({ status: "signed-in", account: { id: "u-viewer" } });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("requests per minute on a match page", () => {
  it("a detail that carries the event: one getMatch every 10 s, no tournament poll", async () => {
    const counts = serve(withEvent(false));
    mount();
    await elapse(0);
    const start = { ...counts };
    await aMinute();
    expect({ match: counts.match - start.match, tournament: counts.tournament - start.tournament }).toEqual({ match: 6, tournament: 0 });
    expect(counts.tournament).toBe(0);
    expect(counts.other).toBe(0);
    expect(screen.getByText(f.tournament.name)).toBeInTheDocument();
  });

  it("an older api's detail: the tournament poll is the fallback", async () => {
    const counts = serve(f.detail);
    mount();
    await elapse(0);
    const start = { ...counts };
    await aMinute();
    expect({ match: counts.match - start.match, tournament: counts.tournament - start.tournament }).toEqual({ match: 6, tournament: 6 });
    expect(screen.getByText(f.tournament.name)).toBeInTheDocument();
  });
});

/** The decided fixture's detail, its event `running` or `complete`, carrying the event like a newer api. */
const decidedIn = (status: "running" | "complete") => {
  const d = fixtureMatch("decided");
  return { ...d.detail, tournament: { ...withEvent(false).tournament, status } };
};

describe("requests per minute on a decided match page", () => {
  it("while its tournament runs: one getMatch every 15 s, so a correction shows within seconds", async () => {
    const counts = serve(decidedIn("running"));
    mount();
    await elapse(0);
    const start = counts.match;
    await aMinute();
    expect(counts.match - start).toBe(4);
  });

  it("once its tournament is complete: one getMatch a minute", async () => {
    const counts = serve(decidedIn("complete"));
    mount();
    await elapse(0);
    const start = counts.match;
    await aMinute();
    expect(counts.match - start).toBe(1);
  });

  it("asks again when the window regains focus", async () => {
    const counts = serve(decidedIn("complete"));
    mount();
    await elapse(5000);
    const start = counts.match;
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await elapse(0);
    expect(counts.match - start).toBe(1);
  });

  it("a tab return fires visibilitychange and then focus: one ask, not two", async () => {
    const counts = serve(decidedIn("complete"));
    mount();
    await elapse(5000);
    const start = counts.match;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await elapse(50);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await elapse(0);
    expect(counts.match - start).toBe(1);
  });
});

describe("organizer tools from the match detail", () => {
  it("shows the panel when the api says the viewer organizes, naming entries from entryNames", async () => {
    mockAccount.mockReturnValue({ status: "signed-in", account: { id: ORGANIZER } });
    serve(withEvent(true));
    mount();
    await elapse(0);
    expect(screen.getByTestId("organizer-panel")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Override result…"));
    expect(screen.getByText("Award match to alpha_named")).toBeInTheDocument();
    expect(screen.getByText("Award match to bravo_named")).toBeInTheDocument();
  });

  it("no panel when the api says the viewer doesn't organize, whatever the user id", async () => {
    mockAccount.mockReturnValue({ status: "signed-in", account: { id: ORGANIZER } });
    serve(withEvent(false));
    mount();
    await elapse(0);
    expect(screen.getByText(f.tournament.name)).toBeInTheDocument();
    expect(screen.queryByTestId("organizer-panel")).toBeNull();
  });
});
