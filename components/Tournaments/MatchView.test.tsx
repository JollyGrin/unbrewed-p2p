/** The match page's six states (#1218), rendered from fixtures through the real MatchBody. */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { MatchBody } from "./MatchView";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import type { MatchPageState } from "@/lib/tournaments/matchPage";
import type { MatchDetail } from "@/lib/tournaments/types";
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
  expect(screen.queryByText("If the deadline passes")).not.toBeInTheDocument(); // C5 (#1236)
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

it("deadline passed, organizer deciding: no Play button, the 24h rule, deadline closed (#1230)", () => {
  renderState("deadline_passed");
  expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "deadline_passed");
  expect(banner()).toHaveTextContent("The deadline has passed. The organizer is deciding this match.");
  // deadline = now - 1h, so the organizer's cutoff is now + 23h (D5).
  expect(banner()).toHaveTextContent("If they don't decide by Tue 6 Oct, 13:00, the higher seed advances.");
  expect(banner()).not.toHaveTextContent("Play any time");
  expect(screen.queryByTestId("play-box")).not.toBeInTheDocument();
  expect(screen.queryByTestId("play-button")).not.toBeInTheDocument();
  expect(screen.queryByText("I'm ready to play")).not.toBeInTheDocument();
  expect(screen.getByTestId("sticky-play")).toHaveTextContent("See the bracket");
  expect(screen.getByTestId("deadline-card")).toHaveTextContent("Closed");
});

it("past the deadline with a live pre-deadline hold: still Join now, no organizer copy (#1233 review)", () => {
  const f = fixtureMatch("opponent_ready");
  const pressedAt = Date.parse(f.detail.readyChecks[0].createdAt);
  const d = { ...f.detail, match: { ...f.detail.match, deadlineAt: new Date(pressedAt + 5 * 60_000).toISOString() } };
  render(
    <ChakraProvider>
      <MatchBody d={d} t={f.tournament} myUserId={FIXTURE_MATCH_YOU} signedOut={false} now={pressedAt + 6 * 60_000} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
  expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "opponent_ready");
  expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toHaveTextContent("Join now");
  expect(banner()).not.toHaveTextContent("organizer");
});

it("past the deadline, an unanswered pre-deadline check: rule 1 copy, no Play (#1233 review)", () => {
  const f = fixtureMatch("opponent_ready");
  const pressedAt = Date.parse(f.detail.readyChecks[0].createdAt);
  const d = { ...f.detail, match: { ...f.detail.match, deadlineAt: new Date(pressedAt + 5 * 60_000).toISOString() } };
  render(
    <ChakraProvider>
      <MatchBody d={d} t={f.tournament} myUserId={FIXTURE_MATCH_YOU} signedOut={false} now={pressedAt + 16 * 60_000} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
  expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "deadline_passed");
  expect(banner()).toHaveTextContent("bountyhuntr was ready and you never joined, so bountyhuntr advances.");
  expect(banner()).toHaveTextContent("Rule 1 · unanswered ready-check");
  expect(screen.queryByTestId("play-button")).not.toBeInTheDocument();
});

it("decided by deadline rule: names the rule and marks it applied", () => {
  renderState("decided_by_rule");
  expect(banner()).toHaveTextContent("Decided by the deadline rule. hokuto_shin advances.");
  expect(banner()).toHaveTextContent("Rule 1 · unanswered ready-check");
  // D6: the full rules card is gone; one line names the rule.
  expect(screen.queryByText("If the deadline passes")).not.toBeInTheDocument();
  expect(screen.getByTestId("decided-by-rule")).toHaveTextContent("Decided by Rule 1 · unanswered ready-check.");
  expect(screen.getByTestId("games-list")).toHaveTextContent("No game was played before");
  expect(screen.getByTestId("ready-checks")).toHaveTextContent("Your opponent didn't join");
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

describe("final smoke fixes (#1239)", () => {
  const draw = (d: MatchDetail, extra: Partial<Parameters<typeof MatchBody>[0]> = {}) => {
    const f = fixtureMatch("waiting");
    return render(
      <ChakraProvider>
        <MatchBody d={d} t={f.tournament} myUserId={null} signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} {...extra} />
      </ChakraProvider>,
    );
  };

  it("D2: shows the organizer's override note on the match page, for a guest too", () => {
    const d = fixtureMatch("decided").detail;
    d.match.decidedBy = "organizer";
    d.decision = { by: "organizer", note: "Opponent no-showed twice", at: null };
    draw(d);
    expect(screen.getByTestId("decision-note")).toHaveTextContent("Decided by the organizer: Opponent no-showed twice");
  });

  it("D2: an organizer decision without a note, and a played result, say nothing extra", () => {
    const d = fixtureMatch("decided").detail;
    d.decision = { by: "organizer", note: null, at: null };
    const { unmount } = draw(d);
    expect(screen.getByTestId("decision-note")).toHaveTextContent("Decided by the organizer.");
    unmount();
    draw({ ...d, decision: null });
    expect(screen.queryByTestId("decision-note")).not.toBeInTheDocument();
  });

  it("D5: the organizer's own view says 'You are deciding', shows the cutoff and offers no Set matchup", () => {
    const f = fixtureMatch("deadline_passed");
    render(
      <ChakraProvider>
        <MatchBody d={f.detail} t={f.tournament} myUserId="u1" signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} organizer={{ entries: f.entries, reload: () => {} }} />
      </ChakraProvider>,
    );
    expect(banner()).toHaveTextContent("The deadline has passed. You are deciding this match.");
    expect(banner()).not.toHaveTextContent("The organizer is deciding");
    expect(banner()).toHaveTextContent("Decide by Tue 6 Oct, 13:00, or the higher seed advances.");
    expect(screen.getByTestId("organizer-panel")).toHaveTextContent("Override result");
    expect(screen.getByTestId("organizer-panel")).not.toHaveTextContent("Set matchup");
  });

  it("D5: an open match still offers Set matchup to the organizer", () => {
    const f = fixtureMatch("waiting");
    render(
      <ChakraProvider>
        <MatchBody d={f.detail} t={f.tournament} myUserId="u1" signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} organizer={{ entries: f.entries, reload: () => {} }} />
      </ChakraProvider>,
    );
    expect(screen.getByTestId("organizer-panel")).toHaveTextContent("Set matchup");
  });

  it("D6: a result-decided match hides the rules card", () => {
    renderState("decided");
    expect(screen.queryByText("If the deadline passes")).not.toBeInTheDocument();
    expect(screen.queryByTestId("decided-by-rule")).not.toBeInTheDocument();
  });

  it("D6: one numbering — Rule 1 / Rule 2 — in the card and the banner", () => {
    const { unmount } = renderState("waiting");
    const card = screen.getByText("If the deadline passes").parentElement!;
    expect(card).toHaveTextContent("Rule 1 · unanswered ready-check");
    expect(card).toHaveTextContent("Rule 2 · otherwise the organizer decides within 24h");
    unmount();
    const d = fixtureMatch("decided_by_rule").detail;
    d.match.decidedBy = "deadline_higher_seed";
    draw(d);
    expect(banner()).toHaveTextContent("Rule 2 · organizer did not decide in 24h");
  });

  it("D7: a final decided by a rule says the winner wins the tournament", () => {
    const f = fixtureMatch("decided_by_rule");
    const m = { ...f.detail.match, round: 3, position: 0, nextMatchId: null, nextSlot: null, decidedBy: "deadline_higher_seed" as const };
    draw({ ...f.detail, match: m });
    expect(banner()).toHaveTextContent("hokuto_shin wins the tournament.");
    expect(banner()).not.toHaveTextContent("advances");
  });

  it("D9: a decided players-choose match with no recorded heroes or board points at the replay", () => {
    const f = fixtureMatch("decided");
    const d: MatchDetail = {
      ...f.detail,
      match: { ...f.detail.match, matchup: { heroes: { a: null, b: null }, map: null }, matchupRule: { mode: "free" }, games: f.detail.match.games.map((g) => ({ ...g, assignment: { heroes: { a: null, b: null }, map: null } })) },
    };
    draw(d);
    expect(screen.queryByText("Random board")).not.toBeInTheDocument();
    expect(screen.queryByText(/Dealt at random/)).not.toBeInTheDocument();
    expect(screen.getByTestId("matchup-unrecorded")).toHaveTextContent("Heroes and board: see the replay");
    fireEvent.click(screen.getByTestId("matchup-replay-link"));
    expect(screen.getByTestId("replay-open")).toBeInTheDocument();
  });

  it("D9: a decided match with no game says so instead of describing a random board", () => {
    const f = fixtureMatch("decided_by_rule");
    const d: MatchDetail = { ...f.detail, match: { ...f.detail.match, matchup: { heroes: { a: null, b: null }, map: null }, matchupRule: { mode: "free" } } };
    draw(d);
    expect(screen.getByTestId("matchup-unrecorded")).toHaveTextContent("No game was played");
    expect(screen.queryByText("Random board")).not.toBeInTheDocument();
  });
});
