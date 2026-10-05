/** The match page's six states (#1218), rendered from fixtures through the real MatchBody. */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { MatchBody } from "./MatchView";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import type { MatchPageState } from "@/lib/tournaments/matchPage";
import type { PlayPhase } from "@/lib/tournaments/usePlayMatch";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const NOW = Date.parse(FIXTURE_NOW);

const renderState = (
  state: MatchPageState,
  opts: { as?: string | null; phase?: PlayPhase; onPlay?: () => void; signedOut?: boolean } = {},
) => {
  const f = fixtureMatch(state);
  return render(
    <ChakraProvider>
      <MatchBody
        d={f.detail}
        t={f.tournament}
        myUserId={opts.as === undefined ? FIXTURE_MATCH_YOU : opts.as}
        signedOut={!!opts.signedOut}
        now={NOW}
        phase={opts.phase ?? { kind: "idle" }}
        onPlay={opts.onPlay ?? (() => {})}
      />
    </ChakraProvider>,
  );
};

const banner = () => screen.getByTestId("match-banner");

it("waiting for a game: open window, 'I'm ready to play'", () => {
  const onPlay = jest.fn();
  renderState("waiting", { onPlay });
  expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "waiting");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Semifinal 2");
  expect(banner()).toHaveTextContent("Your semifinal 2 is open. Play any time before");
  expect(within(screen.getByTestId("play-box")).getByText("Ready when you are")).toBeInTheDocument();
  expect(screen.getByTestId("play-box")).toHaveTextContent("Heroes are set, so there's no hero picker.");
  fireEvent.click(within(screen.getByTestId("play-box")).getByTestId("play-button"));
  expect(onPlay).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("games-list")).toHaveTextContent("Not played yet");
  expect(screen.getByTestId("ready-checks")).toHaveTextContent("None yet");
});

it("opponent ready (join now): the seat clock and Join now", () => {
  renderState("opponent_ready");
  expect(banner()).toHaveTextContent("bountyhuntr is ready to play. Your seat is held.");
  expect(banner()).toHaveTextContent("Join within 11:48");
  const box = screen.getByTestId("play-box");
  expect(box).toHaveTextContent("bountyhuntr is waiting in your room");
  expect(box).toHaveTextContent("You'll load straight in as Kenshiro on Count's Castle.");
  expect(within(box).getByTestId("play-button")).toHaveTextContent("Join now");
});

afterEach(() => window.localStorage.clear());

it("you're ready (seat held): countdown and a way back to the room this browser holds", () => {
  window.localStorage.setItem("unbrewed-pro-token-SF2ROOM", "tok"); // seated from another tab
  renderState("you_ready");
  expect(banner()).toHaveTextContent("You're ready.");
  expect(screen.getByTestId("seat-clock")).toHaveTextContent("14:32");
  expect(screen.getAllByText("Back to your room")[0].closest("a")).toHaveAttribute("href", "/pro/game?room=SF2ROOM");
});

it("you're ready on a device with no seat token: a fresh ticket, never a ticketless ?room= link", () => {
  const onPlay = jest.fn();
  renderState("you_ready", { onPlay });
  expect(screen.queryByText("Back to your room")).not.toBeInTheDocument();
  expect(document.querySelector('a[href^="/pro/game"]')).toBeNull();
  fireEvent.click(within(screen.getByTestId("play-box")).getByText("Take your seat here"));
  expect(onPlay).toHaveBeenCalledTimes(1);
});

it("in play now: no game number, back to the game", () => {
  window.localStorage.setItem("unbrewed-pro-token-room-m2-1-0", "tok");
  renderState("in_play");
  expect(banner()).toHaveTextContent("In play now. Started");
  const rows = screen.getAllByTestId("game-row");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toHaveTextContent("—");
  expect(rows[0]).toHaveTextContent("In play now · Kenshiro vs Boba Fett");
  expect(rows[0]).not.toHaveTextContent(/Game 1|^1/);
  expect(screen.getAllByText("Back to game")[0].closest("a")).toHaveAttribute("href", "/pro/game?room=room-m2-1-0");
  expect(screen.getByText(/Watching live is coming later/)).toBeInTheDocument();
  expect(screen.getByTestId("play-box")).toHaveTextContent("Lost the tab? Rejoin the same room.");
});

it("in play now on another device: no rejoin promise it can't keep", () => {
  renderState("in_play");
  expect(screen.queryByText("Back to game")).not.toBeInTheDocument();
  expect(document.querySelector('a[href^="/pro/game"]')).toBeNull();
  expect(screen.getByTestId("play-box")).not.toHaveTextContent("Lost the tab?");
  expect(screen.getByTestId("play-box")).toHaveTextContent("open in the tab or device you started it on");
});

it("decided: the winner advances, the score, the replay chip", async () => {
  renderState("decided");
  expect(banner()).toHaveTextContent("Decided. hokuto_shin advances to the Final.");
  expect(screen.getByTestId("match-score")).toHaveTextContent("1–0");
  expect(screen.queryByTestId("play-box")).not.toBeInTheDocument();
  expect(screen.getAllByTestId("game-row")[0]).toHaveTextContent("hokuto_shin won · Kenshiro vs Boba Fett");
  fireEvent.click(screen.getByTestId("replay-chip"));
  // next/dynamic resolves the replay viewer asynchronously.
  expect(await screen.findByTestId("replay-open")).toBeInTheDocument();
});

it("decided: no Replay chip until the api reports replayAvailable", () => {
  const f = fixtureMatch("decided");
  f.detail.match.games[0].replayAvailable = undefined;
  render(
    <ChakraProvider>
      <MatchBody d={f.detail} t={f.tournament} myUserId={null} signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
  expect(screen.queryByTestId("replay-chip")).not.toBeInTheDocument();
  expect(screen.queryByText("Watch the replay")).not.toBeInTheDocument();
});

it("decided by deadline rule: names the rule and marks it applied", () => {
  renderState("decided_by_rule");
  expect(banner()).toHaveTextContent("Decided by the deadline rule. hokuto_shin advances.");
  expect(banner()).toHaveTextContent("Rule 1 · unanswered ready-check");
  expect(screen.getByText("Applied")).toBeInTheDocument();
  expect(screen.getByTestId("games-list")).toHaveTextContent("No game was played before");
  expect(screen.getByTestId("ready-checks")).toHaveTextContent("You pressed Play · no answer");
});

it("a spectator gets no Play button; a signed-out visitor is asked to sign in", () => {
  renderState("waiting", { as: null, signedOut: true });
  expect(screen.queryByTestId("play-box")).not.toBeInTheDocument();
  expect(screen.getByText("Sign in with Discord")).toBeInTheDocument();
});

it("shows why a ready failed, and the room-opening wait", () => {
  const { unmount } = renderState("waiting", { phase: { kind: "error", message: "A game for this match is already in play." } });
  expect(screen.getByTestId("play-error")).toHaveTextContent("already in play");
  unmount();
  renderState("opponent_ready", { phase: { kind: "opening" } });
  expect(screen.getByTestId("play-opening")).toHaveTextContent("Opening bountyhuntr's room");
});

it("shows the latest possible final", () => {
  renderState("waiting");
  expect(screen.getByTestId("latest-final")).toHaveTextContent("Latest possible final");
});
