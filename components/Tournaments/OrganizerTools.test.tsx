/** Organizer queue (#1219): item types from fixtures; actions hit the right routes. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FIXTURE_ATTENTION, fixtureRunning8 } from "@/lib/tournaments/fixtures";

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

it("'Not valid…' (api #75 pending) opens the override form without calling the api", async () => {
  mount();
  fireEvent.click(await screen.findByText("Not valid…"));
  expect(await screen.findByTestId("override-form")).toBeInTheDocument();
  expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
});
