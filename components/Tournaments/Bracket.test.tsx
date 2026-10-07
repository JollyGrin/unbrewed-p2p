/** The bracket page and the organizer's seeding panel (#1217), against fixtures. */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { MatchCell } from "./Bracket";
import { buildBracket } from "@/lib/tournaments/bracket";
import { BracketEventView } from "./BracketEventView";
import { SeedingPanel } from "./SeedingPanel";
import { API_URL } from "@/lib/account/apiUrl";
import { fixtureBracket, fixtureComplete4, fixtureRunning16, fixtureRunning8, fixtureSignup8 } from "@/lib/tournaments/fixtures";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const page = (p: ReturnType<typeof fixtureRunning8>) =>
  render(
    <ChakraProvider>
      <BracketEventView t={p.tournament} entries={p.entries} matches={p.matches} />
    </ChakraProvider>,
  );

describe("BracketEventView", () => {
  it.each([
    ["fixture-4", fixtureComplete4, 3],
    ["fixture-8", fixtureRunning8, 7],
    ["fixture-16", fixtureRunning16, 15],
  ])("%s draws every match in the tree and the phone tabs", (_, make, matches) => {
    page(make());
    const tree = screen.getByTestId("bracket-tree");
    expect(within(tree).getAllByTestId("match-cell")).toHaveLength(matches);
    // jsdom resolves Chakra's base breakpoint: the phone panel shows one round.
    expect(screen.getByTestId("round-tabs")).toBeInTheDocument();
  });

  it("marks in play now without a game number, and links it to the match page", () => {
    page(fixtureRunning8());
    const tree = screen.getByTestId("bracket-tree");
    const live = within(tree).getAllByTestId("match-cell").find((c) => c.dataset.state === "in_play")!;
    expect(live).toHaveAttribute("href", "/tournaments?t=fixture-8&m=m2-1");
    expect(live).toHaveTextContent("In play now");
    expect(live.textContent).not.toMatch(/game\s*\d/i);
  });

  it("opens the phone view on the live round and swaps rounds by tab", () => {
    page(fixtureRunning8());
    const tabs = within(screen.getByTestId("round-tabs"));
    expect(tabs.getByRole("tab", { selected: true })).toHaveTextContent("Semis");
    fireEvent.click(tabs.getByRole("tab", { name: /Quarters/ }));
    expect(tabs.getAllByTestId("match-cell")).toHaveLength(4);
  });

  it("crowns the champion when complete", () => {
    page(fixtureComplete4());
    expect(screen.getByTestId("champion-line")).toHaveTextContent("Champion: RavenDefeatsAll");
    expect(within(screen.getByTestId("bracket-tree")).getByTestId("champion")).toHaveTextContent("RavenDefeatsAll");
  });
});

describe("SeedingPanel", () => {
  let calls: { url: string; method: string; body: unknown }[];
  beforeEach(() => {
    calls = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      return { ok: true, status: 200, json: async () => ({ entries: [], matches: [] }) } as Response;
    }) as unknown as typeof fetch;
  });

  it("saves the dragged order, then starts", async () => {
    const p = fixtureSignup8();
    const saved = p.entries.map((e, i) => ({ ...e, seed: i + 1 }));
    const reload = jest.fn();
    render(
      <ChakraProvider>
        <SeedingPanel t={p.tournament} entries={saved} reload={reload} />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move crystal_lake_jay up" }));
    fireEvent.click(screen.getByTestId("start-bracket"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-start"));
    });
    expect(calls.map((c) => `${c.method} ${c.url.replace(API_URL, "")}`)).toEqual([
      "PUT /tournaments/fixture-signup/seeds",
      "POST /tournaments/fixture-signup/start",
    ]);
    expect(calls[0].body).toEqual({ order: ["e1", "e2", "e3", "e5", "e4", "e6"] });
    expect(reload).toHaveBeenCalled();
  });

  it("double-clicking Start sends ONE save and ONE start (p2p #1269)", async () => {
    const p = fixtureSignup8();
    const saved = p.entries.map((e, i) => ({ ...e, seed: i + 1 }));
    (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: null });
      // The save answers; the start hangs, so a second click lands while it is in flight.
      if (url.endsWith("/seeds")) return { ok: true, status: 200, json: async () => ({ entries: [] }) } as Response;
      return new Promise(() => {});
    });
    render(
      <ChakraProvider>
        <SeedingPanel t={p.tournament} entries={saved} reload={jest.fn()} />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move crystal_lake_jay up" }));
    fireEvent.click(screen.getByTestId("start-bracket"));
    const confirm = screen.getByTestId("confirm-start");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => {});
    fireEvent.click(confirm);
    await act(async () => {});
    expect(calls.filter((c) => c.url.endsWith("/seeds"))).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith("/start"))).toHaveLength(1);
  });

  it("won't start under half full", () => {
    const p = fixtureSignup8();
    render(
      <ChakraProvider>
        <SeedingPanel t={p.tournament} entries={p.entries.slice(0, 4)} reload={jest.fn()} />
      </ChakraProvider>,
    );
    expect(screen.getByTestId("start-bracket")).toBeDisabled();
    expect(screen.getByText(/more than half the seats/)).toBeInTheDocument();
  });

  it("signup closed and under-filled: no dead Start, says what to do (#1242)", () => {
    const p = fixtureSignup8();
    render(
      <ChakraProvider>
        <SeedingPanel t={{ ...p.tournament, signupClosesAt: "2020-01-01T00:00:00Z", signupOpen: false }} entries={p.entries.slice(0, 4)} reload={jest.fn()} />
      </ChakraProvider>,
    );
    expect(screen.queryByTestId("start-bracket")).toBeNull();
    expect(screen.getByText("Not enough players to start. Extend signup, or cancel.")).toBeInTheDocument();
  });

  it("pluralizes the bye line", () => {
    const p = fixtureSignup8();
    const draw = (n: number) =>
      render(
        <ChakraProvider>
          <SeedingPanel t={{ ...p.tournament, size: 8 }} entries={p.entries.slice(0, n)} reload={jest.fn()} />
        </ChakraProvider>,
      );
    draw(6);
    expect(screen.getByText(/2 empty seats become byes for the top seeds\./)).toBeInTheDocument();
  });
});

describe("D4: deadline passed on an open match (#1239)", () => {
  it("reads 'Deadline passed' instead of 'Ready to play' / 'Waiting for a game'", () => {
    const b = fixtureBracket(4, 4);
    b.at(1, 0).deadlineAt = "2026-10-05T10:00:00Z";
    const view = buildBracket({ slug: "x", size: 4, status: "running" }, b.entries, b.matches);
    const cell = view.rounds[0].cells[0];
    expect(cell.state).toBe("ready");
    const draw = (now: number) =>
      render(
        <ChakraProvider>
          <MatchCell c={cell} now={now} />
        </ChakraProvider>,
      );
    const before = draw(Date.parse(cell.deadlineAt!) - 3_600_000);
    expect(screen.getByTestId("match-cell")).toHaveTextContent("Ready to play");
    expect(screen.getByTestId("match-cell")).toHaveTextContent("Waiting for a game");
    before.unmount();
    draw(Date.parse(cell.deadlineAt!) + 3_600_000);
    expect(screen.getByTestId("match-cell")).toHaveTextContent("Deadline passed");
    expect(screen.getByTestId("match-cell")).not.toHaveTextContent("Ready to play");
    expect(screen.getByTestId("match-cell")).not.toHaveTextContent("Waiting for a game");
  });
});

describe("#1246 N2/N3/N5", () => {
  it("N2: a decided match with only a late-recorded game says so in the bracket cell", () => {
    const b = fixtureBracket(4, 4);
    b.decide(b.at(1, 0), "a", "organizer");
    const m = b.at(1, 0);
    m.games = [{ ...(fixtureComplete4().matches[0].games[0]), recordedAfterDecision: true }];
    const view = buildBracket({ slug: "x", size: 4, status: "running" }, b.entries, b.matches);
    const cell = view.rounds[0].cells[0];
    expect(`${cell.a.sub}|${cell.b.sub}`).toContain("a game finished afterwards (not counted)");
    expect(`${cell.a.sub}|${cell.b.sub}`).not.toContain("no game played");
  });

  it("N3: a cancelled tournament has no crown line, no open rounds, nobody still in", () => {
    const p = fixtureRunning8();
    const t = { ...p.tournament, status: "cancelled" as const };
    render(
      <ChakraProvider>
        <BracketEventView t={t} entries={p.entries} matches={p.matches.map((m) => ({ ...m, cancelled: m.status !== "decided" }))} />
      </ChakraProvider>,
    );
    expect(document.body).not.toHaveTextContent("Latest possible final");
    expect(document.body).not.toHaveTextContent("Crowned automatically");
    expect(document.body).not.toHaveTextContent("To be crowned");
    expect(document.body).not.toHaveTextContent("Still in");
    expect(screen.getAllByTestId("champion-cancelled").length).toBeGreaterThan(0);
  });

  it("N3: an untouched open round reads Cancelled", () => {
    const b = fixtureBracket(4, 4);
    const run = buildBracket({ slug: "x", size: 4, status: "running" }, b.entries, b.matches);
    expect(run.rounds[0].summary).toBe("open");
    const dead = buildBracket({ slug: "x", size: 4, status: "cancelled" }, b.entries, b.matches);
    expect(dead.rounds[0].summary).toBe("Cancelled");
  });

  it("N5: past the deadline with a live pre-deadline hold names the holder", () => {
    const b = fixtureBracket(4, 4);
    b.at(1, 0).deadlineAt = "2026-10-05T10:00:00Z";
    const until = "2026-10-05T12:30:00Z";
    const view = buildBracket({ slug: "x", size: 4, status: "running" }, b.entries, b.matches, { "m1-0": { name: "hokuto", until } });
    render(
      <ChakraProvider>
        <MatchCell c={view.rounds[0].cells[0]} now={Date.parse("2026-10-05T12:00:00Z")} />
      </ChakraProvider>,
    );
    expect(screen.getByTestId("match-cell")).toHaveTextContent(/Deadline passed · hokuto is holding a seat until \d{1,2}:\d\d/); // locale clock (UX S2)
  });
});

describe("organizer attention queue on the bracket page (p2p #1269)", () => {
  let attention: number;
  beforeEach(() => {
    attention = 0;
    global.fetch = jest.fn(async (url: string) => {
      if (url.endsWith("/attention")) attention++;
      return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
    }) as unknown as typeof fetch;
  });

  it("is fetched ONCE per page, then again only when the page poll brings changed matches", async () => {
    const p = fixtureRunning8();
    const ui = (matches: typeof p.matches) => (
      <ChakraProvider>
        <BracketEventView t={p.tournament} entries={p.entries} matches={matches} isOrganizer />
      </ChakraProvider>
    );
    const { rerender } = render(ui(p.matches));
    await act(async () => {});
    expect(attention).toBe(1);
    rerender(ui(p.matches)); // a re-render that is not a poll result
    await act(async () => {});
    expect(attention).toBe(1);
    rerender(ui(p.matches.map((m) => ({ ...m })))); // the page poll answered, nothing changed
    await act(async () => {});
    expect(attention).toBe(1);
    rerender(ui(p.matches.map((m, i) => (i === 0 ? { ...m, status: m.status === "decided" ? ("open" as const) : ("decided" as const) } : m)))); // a match moved on
    await act(async () => {});
    expect(attention).toBe(2);
  });
});
