/** Match page dead ends (p2p #1269): pending Play, a lapsed session mid-game, a stalled game, the re-seat cooldown. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { API_URL } from "@/lib/account/apiUrl";
import { __resetAccountStoreForTests } from "@/lib/account/useAccount";
import { __resetReseatCooldownsForTests } from "@/lib/tournaments/api";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import { clock, type MatchPageState } from "@/lib/tournaments/matchPage";
import type { MatchDetail, Tournament } from "@/lib/tournaments/types";

import { MatchBody, MatchView } from "./MatchView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const NOW = Date.parse(FIXTURE_NOW);
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

const body = (
  d: MatchDetail,
  t: Tournament,
  opts: { as?: string | null; signedOut?: boolean; noticedCooldown?: string | null } = {},
) => (
  <ChakraProvider>
    <MatchBody
      d={d}
      t={t}
      myUserId={opts.as === undefined ? FIXTURE_MATCH_YOU : opts.as}
      signedOut={!!opts.signedOut}
      now={NOW}
      phase={{ kind: "idle" }}
      onPlay={() => {}}
      noticedCooldown={opts.noticedCooldown}
    />
  </ChakraProvider>
);
const fixture = (state: MatchPageState) => fixtureMatch(state);

afterEach(() => window.localStorage.clear());

describe("S4: a pending match has no Ready button", () => {
  it("an entrant whose opponent is still unknown gets no 'I'm ready to play' (box or sticky)", () => {
    const f = fixture("waiting");
    f.detail.match.slotB = null;
    f.detail.match.status = "pending";
    f.detail.players.b = null;
    render(body(f.detail, f.tournament));
    expect(screen.getByTestId("match-banner")).toHaveTextContent("Waiting for both players.");
    expect(screen.queryByTestId("play-box")).toBeNull();
    expect(screen.queryByTestId("play-button")).toBeNull();
    expect(screen.queryByText(/I'm ready to play/)).toBeNull();
  });

  it("with both seats filled the entrant still gets it", () => {
    const f = fixture("waiting");
    render(body(f.detail, f.tournament));
    expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toHaveTextContent("I'm ready to play");
  });
});

describe("S5: a session that expired mid-game", () => {
  const live = () => {
    const f = fixture("in_play");
    const roomId = f.detail.match.games.find((g) => g.startedAt && !g.finishedAt)!.roomId!;
    return { f, roomId };
  };

  it("signed out with this browser's seat token: Back to game (box and sticky) plus the sign-in prompt", () => {
    const { f, roomId } = live();
    window.localStorage.setItem(`unbrewed-pro-token-${roomId}`, "tok");
    render(body(f.detail, f.tournament, { as: null, signedOut: true }));
    expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "in_play");
    const back = within(screen.getByTestId("seat-return")).getByRole("link", { name: "Back to game" });
    expect(back).toHaveAttribute("href", `/pro/game?room=${encodeURIComponent(roomId)}`);
    expect(within(screen.getByTestId("sticky-play")).getByRole("link", { name: "Back to game" })).toHaveAttribute(
      "href",
      `/pro/game?room=${encodeURIComponent(roomId)}`,
    );
    expect(screen.getByTestId("sign-in-prompt")).toHaveTextContent("Sign in to get back to your game.");
  });

  it("signed out with no seat token: the sign-in prompt, no dead seat link", () => {
    const { f } = live();
    render(body(f.detail, f.tournament, { as: null, signedOut: true }));
    expect(screen.getByTestId("sign-in-prompt")).toBeInTheDocument();
    expect(screen.queryByTestId("seat-return")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to game" })).toBeNull();
  });

  it("a signed-in spectator gets neither", () => {
    const { f } = live();
    render(body(f.detail, f.tournament, { as: "someone-else" }));
    expect(screen.queryByTestId("sign-in-prompt")).toBeNull();
    expect(screen.queryByTestId("seat-return")).toBeNull();
    expect(screen.queryByTestId("stalled-note")).toBeNull();
  });
});

it("in play: the page explains a stalled game instead of looping (names the organizer)", () => {
  const f = fixture("in_play");
  render(body(f.detail, f.tournament));
  expect(screen.getByTestId("stalled-note")).toHaveTextContent(
    `If your game room closed, the match reopens automatically once the stalled game times out, or ask the organizer (${f.tournament.organizer.username}) to confirm a result.`,
  );
});

describe("force re-seat cooldown (api #126)", () => {
  const until = inHours(0.5);
  const message = `This match was re-seated. Play opens at ${clock(until)} (local time).`;

  it("match JSON reseatCooldownUntil in the future: the message, Play disabled", () => {
    const f = fixture("waiting");
    f.detail.match.reseatCooldownUntil = until;
    render(body(f.detail, f.tournament));
    expect(screen.getByTestId("reseat-cooldown")).toHaveTextContent(message);
    expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toBeDisabled();
    expect(within(screen.getByTestId("sticky-play")).getByRole("button")).toBeDisabled();
  });

  it("an absent, null or past cooldown is no cooldown", () => {
    for (const v of [undefined, null, inHours(-0.1)]) {
      const f = fixture("waiting");
      if (v !== undefined) f.detail.match.reseatCooldownUntil = v;
      const { unmount } = render(body(f.detail, f.tournament));
      expect(screen.queryByTestId("reseat-cooldown")).toBeNull();
      expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toBeEnabled();
      unmount();
    }
  });

  it("a 409 reseat_cooldown this tab met (no field in the match JSON yet): the same message", () => {
    const f = fixture("opponent_ready");
    render(body(f.detail, f.tournament, { noticedCooldown: until }));
    expect(screen.getByTestId("reseat-cooldown")).toHaveTextContent(message);
    expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toBeDisabled();
  });
});

describe("the 409 through the real page (MatchView + api)", () => {
  const reply = (status: number, b: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => b }) as Response;

  beforeEach(() => {
    __resetAccountStoreForTests();
    __resetReseatCooldownsForTests();
  });

  it("pressing Ready during a cooldown shows 'Play opens at' and disables Play", async () => {
    const now = new Date().toISOString();
    const f = fixtureMatch("waiting", now);
    const until = new Date(Date.now() + 30 * 60_000).toISOString();
    const matchBody = JSON.parse(JSON.stringify({ ...f.detail }));
    let readies = 0;
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url === `${API_URL}/me`) return reply(200, { user: { id: FIXTURE_MATCH_YOU, username: "hokuto_shin", avatarUrl: null } });
      if (url.endsWith("/ready") && init?.method === "POST") {
        readies++;
        return reply(409, { error: "reseat_cooldown", ticketsExpireAt: until });
      }
      if (url.includes("/matches/")) return reply(200, matchBody);
      if (url.endsWith(`/tournaments/${f.tournament.slug}`)) return reply(200, { tournament: f.tournament, entries: f.entries, matches: f.matches });
      return reply(404, {});
    }) as unknown as typeof fetch;

    render(<ChakraProvider><MatchView slug={f.tournament.slug} matchId={f.detail.match.id} /></ChakraProvider>);
    const box = await screen.findByTestId("play-box");
    await waitFor(() => expect(within(box).getByTestId("play-button")).toBeEnabled());
    await act(async () => {
      fireEvent.click(within(box).getByTestId("play-button"));
    });
    expect(await screen.findByTestId("reseat-cooldown")).toHaveTextContent(
      `This match was re-seated. Play opens at ${clock(until)} (local time).`,
    );
    expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toBeDisabled();
    expect(readies).toBe(1);
  });
});
