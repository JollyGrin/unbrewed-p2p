/** Organizer queue (#1219): item types from fixtures; actions hit the right routes. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { FIXTURE_ATTENTION, fixtureRunning8 } from "@/lib/tournaments/fixtures";
import { mapLockHash } from "@/lib/tournaments/mapHash";

import { AttentionQueue, OverrideForm } from "./OrganizerTools";

jest.mock("../../lib/pro/useProLiveRoster", () => ({
  useProLiveRosterState: () => ({ heroes: [], offline: false }),
}));

const reply = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

const f = fixtureRunning8();
let calls: { url: string; method: string; body: any }[];
const reload = jest.fn();

beforeEach(() => {
  calls = [];
  reload.mockClear();
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(init.body as string) : null,
    });
    if (url.endsWith("/attention"))
      return reply(200, { items: FIXTURE_ATTENTION["fixture-8"] });
    return reply(200, { match: {} });
  }) as any;
});

const mount = () =>
  render(
    <ChakraProvider>
      <AttentionQueue
        t={f.tournament}
        entries={f.entries}
        matches={f.matches}
        reload={reload}
        now={Date.parse("2026-10-05T12:00:00Z")}
      />
    </ChakraProvider>,
  );

it("renders every item kind", async () => {
  mount();
  const items = await screen.findAllByTestId("attention-item");
  expect(items.map((i) => i.getAttribute("data-kind")).sort()).toEqual([
    "awaiting_organizer",
    "deadline_passed",
    "entrant_left",
    "no_matchup",
    "unverified_game",
  ]);
  expect(screen.getByText(/Needs your attention · 5/)).toBeInTheDocument();
});

it("one-click confirm calls the confirm route", async () => {
  mount();
  fireEvent.click(await screen.findByText("Confirm for crystal_lake_jay"));
  await waitFor(() =>
    expect(calls.some((c) => c.method === "POST")).toBe(true),
  );
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url).toMatch(
    /\/tournaments\/fixture-8\/matches\/m1-1\/games\/0\/confirm$/,
  );
  await waitFor(() => expect(reload).toHaveBeenCalled());
});

it("award opens the override form with a note and posts it", async () => {
  mount();
  fireEvent.click(await screen.findByText("Forfeit to hokuto_shin"));
  fireEvent.click(await screen.findByText("Apply override"));
  // m2-1 has a game in play: the organizer confirms first (#1242).
  fireEvent.click(await screen.findByTestId("confirm-override-in-play"));
  await waitFor(() =>
    expect(calls.some((c) => c.url.endsWith("/override"))).toBe(true),
  );
  const post = calls.find((c) => c.url.endsWith("/override"))!;
  expect(post.url).toMatch(/matches\/m2-1\/override$/);
  expect(post.body).toEqual({
    winnerEntry: "e2",
    note: "bountyhuntr left the tournament.",
  });
});

it("re-deciding a decided match sends replacesWinner", async () => {
  const decided = f.matches.find((m) => m.id === "m1-3")!;
  render(
    <ChakraProvider>
      <OverrideForm
        slug="fixture-8"
        match={decided}
        entries={f.entries}
        onDone={jest.fn()}
      />
    </ChakraProvider>,
  );
  fireEvent.click(screen.getAllByRole("radio")[0]);
  fireEvent.click(screen.getByText("Apply override"));
  await waitFor(() => expect(calls.length).toBe(1));
  expect(calls[0].body.replacesWinner).toBe(decided.winner);
});

it("double-clicking Apply override sends ONE override (p2p #1269)", async () => {
  (global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: null });
    return new Promise(() => {}); // in flight for good
  });
  const decided = f.matches.find((m) => m.id === "m1-3")!;
  render(
    <ChakraProvider>
      <OverrideForm slug="fixture-8" match={decided} entries={f.entries} onDone={jest.fn()} />
    </ChakraProvider>,
  );
  fireEvent.click(screen.getAllByRole("radio")[0]);
  const apply = screen.getByText("Apply override");
  fireEvent.click(apply);
  fireEvent.click(apply);
  expect(calls.filter((c) => c.url.endsWith("/override"))).toHaveLength(1);
});

it("fixing a map says the save pins it, and an edited map needs re-saving (p2p #1269)", async () => {
  mount();
  fireEvent.click(await screen.findByText("Set matchup"));
  fireEvent.click(within(screen.getByRole("group", { name: "Map" })).getByText("Players choose"));
  expect(screen.queryByTestId("map-pin-hint")).toBeNull(); // nothing pinned
  fireEvent.click(await screen.findByText("Weathertop"));
  expect(screen.getByTestId("map-pin-hint")).toHaveTextContent(
    "Saving pins this map exactly as it is now. If the map is edited later, save the matchup again so games use the new version.",
  );
});

it("set matchup puts a rule, never per-game fields", async () => {
  mount();
  fireEvent.click(await screen.findByText("Set matchup"));
  fireEvent.click(await screen.findByText("Weathertop"));
  fireEvent.click(screen.getByText("Save matchup"));
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
  const put = calls.find((c) => c.method === "PUT")!;
  expect(put.url).toMatch(/matches\/m2-1\/matchup$/);
  expect(put.body).toEqual({
    matchupRule: { mode: "map", map: { kind: "catalog", id: "weathertop" } },
  });
});

it("set matchup with WebCrypto sends the board's content hash on the map lock (#1268)", async () => {
  const { webcrypto } = jest.requireActual<typeof import("node:crypto")>("node:crypto");
  const jsdomCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  try {
    const hash = await mapLockHash({ kind: "catalog", id: "weathertop" });
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    mount();
    fireEvent.click(await screen.findByText("Set matchup"));
    fireEvent.click(await screen.findByText("Weathertop"));
    fireEvent.click(screen.getByText("Save matchup"));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      matchupRule: { mode: "map", map: { kind: "catalog", id: "weathertop", hash } },
    });
  } finally {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: jsdomCrypto });
  }
});

it("'Not valid…' rejects the game via the reject route, not an override", async () => {
  mount();
  fireEvent.click(await screen.findByText("Not valid…"));
  expect(await screen.findByTestId("reject-confirm")).toHaveTextContent(/will not count/);
  expect(calls.some((c) => c.method === "POST")).toBe(false);
  fireEvent.click(screen.getByText("Yes, reject game"));
  await waitFor(() =>
    expect(calls.some((c) => c.method === "POST")).toBe(true),
  );
  const post = calls.find((c) => c.method === "POST")!;
  expect(post.url).toMatch(/matches\/m1-1\/games\/0\/reject$/);
  expect(calls.some((c) => c.url.endsWith("/override"))).toBe(false);
  await waitFor(() => expect(reload).toHaveBeenCalled());
});

it("maps reject 409s to plain copy", async () => {
  (global.fetch as jest.Mock).mockImplementation(
    async (url: string, init?: RequestInit) =>
      url.endsWith("/attention")
        ? reply(200, { items: FIXTURE_ATTENTION["fixture-8"] })
        : init?.method === "POST"
          ? reply(409, { error: "already_verified" })
          : reply(200, {}),
  );
  mount();
  fireEvent.click(await screen.findByText("Not valid…"));
  fireEvent.click(await screen.findByText("Yes, reject game"));
  expect(await screen.findByTestId("organizer-error")).toHaveTextContent(
    /already confirmed.*override/,
  );
  expect(reload).not.toHaveBeenCalled();
});

it("'Keep it' cancels the reject without calling the api", async () => {
  mount();
  fireEvent.click(await screen.findByText("Not valid…"));
  fireEvent.click(await screen.findByText("Keep it"));
  expect(screen.queryByTestId("reject-confirm")).toBeNull();
  expect(calls.some((c) => c.method === "POST")).toBe(false);
});

describe("override while a game is in play (#1242)", () => {
  const live = { ...f.matches.find((m) => m.id === "m1-3")!, winner: null, status: "in_play" as const, inPlay: true, decidedBy: null };
  const renderIt = (onDone = jest.fn()) =>
    render(
      <ChakraProvider>
        <OverrideForm slug="fixture-8" match={live} entries={f.entries} onDone={onDone} />
      </ChakraProvider>,
    );

  it("warns up front and needs a confirm before anything is sent", async () => {
    renderIt();
    expect(screen.getByTestId("override-in-play-warning")).toHaveTextContent(
      "A game is in progress. Overriding decides the match now; the game's result will be recorded but won't change this decision.",
    );
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByText("Apply override"));
    expect(calls.some((c) => c.url.endsWith("/override"))).toBe(false);
    fireEvent.click(screen.getByTestId("confirm-override-in-play"));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/override"))).toBe(true));
  });

  it("no warning when no game is in play", () => {
    render(
      <ChakraProvider>
        <OverrideForm slug="fixture-8" match={{ ...live, inPlay: false, status: "open" }} entries={f.entries} onDone={jest.fn()} />
      </ChakraProvider>,
    );
    expect(screen.queryByTestId("override-in-play-warning")).toBeNull();
  });

  it("shows the api's gameInPlay answer and holds the form open", async () => {
    global.fetch = jest.fn(async () => reply(200, { match: {}, gameInPlay: true })) as any;
    const onDone = jest.fn();
    renderIt(onDone);
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByText("Apply override"));
    fireEvent.click(screen.getByTestId("confirm-override-in-play"));
    expect(await screen.findByTestId("override-game-in-play")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Close"));
    expect(onDone).toHaveBeenCalled();
  });
});

it("awaiting_organizer names who holds a seat when the api sends reason/holdUntil/readyBy (D3, api #88)", async () => {
  const { attentionRows } = jest.requireActual("../../lib/tournaments/organizer");
  const m = f.matches.find((x) => x.id === "m2-1")!;
  const item = {
    kind: "awaiting_organizer",
    matchId: m.id,
    round: m.round,
    position: m.position,
    deadlineAt: "2026-10-05T10:00:00Z",
    until: "2026-10-06T10:00:00Z",
    reason: "ready_hold_pending",
    holdUntil: "2026-10-05T12:30:00Z",
    readyBy: [m.slotA],
  };
  const [row] = attentionRows([item], f.entries, f.matches, 3, Date.parse("2026-10-05T12:00:00Z"));
  expect(row.body).toMatch(/pressed Play and holds a seat until \d\d:\d\d; the rules decide after that\./);
  const [generic] = attentionRows([{ ...item, reason: "no_ready_check", holdUntil: null, readyBy: [] }], f.entries, f.matches, 3, Date.parse("2026-10-05T12:00:00Z"));
  expect(generic.body).toMatch(/No game was played\. If a player is holding a seat/);
});

describe("override refused with tickets_outstanding (api #101)", () => {
  const m = { ...f.matches.find((x) => x.id === "m1-3")!, inPlay: false, status: "open" as const, winner: null, decidedBy: null };
  const EXPIRES = "2026-10-05T14:30:00Z";
  const overrides = () => calls.filter((c) => c.url.endsWith("/override"));
  const go = (onDone = jest.fn()) => {
    render(
      <ChakraProvider>
        <OverrideForm slug="fixture-8" match={m} entries={f.entries} onDone={onDone} />
      </ChakraProvider>,
    );
    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByText("Apply override"));
    return onDone;
  };
  const refuse = (body: unknown) =>
    ((global.fetch as jest.Mock).mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : null });
      return body && !calls.some((c) => c.body?.force) ? reply(409, body) : reply(200, { match: {} });
    }));

  it("shows the expiry in local time, then Force change confirms inline and resends with force:true", async () => {
    refuse({ error: "tickets_outstanding", message: "raw api text", ticketsExpireAt: EXPIRES, canForce: true });
    const onDone = go();
    const box = await screen.findByTestId("override-tickets-outstanding");
    const d = new Date(EXPIRES);
    const local = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    expect(box).toHaveTextContent(`holds a join ticket for the next match until`);
    expect(box).toHaveTextContent(local);
    expect(box).toHaveTextContent("(a player can't extend it by pressing Play). Wait: nothing changes now. Try the change again after");
    expect(box).toHaveTextContent(`Force change: applies now, but the new finalists may not be able to start their game until`);
    expect(box).not.toHaveTextContent("keep one alive");
    expect(box).not.toHaveTextContent("raw api text");
    expect(overrides()[0].body.force).toBeUndefined();
    fireEvent.click(screen.getByText("Force change"));
    expect(overrides()).toHaveLength(1); // inline confirm first
    fireEvent.click(screen.getByTestId("confirm-force"));
    await waitFor(() => expect(overrides()).toHaveLength(2));
    expect(overrides()[1].body.force).toBe(true);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("Wait closes the form without forcing", async () => {
    refuse({ error: "tickets_outstanding", ticketsExpireAt: EXPIRES, canForce: true });
    const onDone = go();
    await screen.findByTestId("override-tickets-outstanding");
    fireEvent.click(screen.getByText("Wait and retry later"));
    expect(onDone).toHaveBeenCalled();
    expect(overrides()).toHaveLength(1);
  });

  it("a plain 409 without canForce keeps the generic copy and no Force button", async () => {
    refuse({ error: "match_changed" });
    go();
    expect(await screen.findByTestId("organizer-error")).toHaveTextContent("This match changed while you were looking");
    expect(screen.queryByText("Force change")).toBeNull();
  });
});
