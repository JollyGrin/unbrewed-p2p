/**
 * Round-4 review (p2p #1278): the match page's copy and states after the UX,
 * interactions and journeys reports — rendered through the real MatchBody.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen, within } from "@testing-library/react";

import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import { clock, dateTime, type MatchPageState } from "@/lib/tournaments/matchPage";
import type { Game, MatchDetail, Tournament } from "@/lib/tournaments/types";
import type { PlayPhase } from "@/lib/tournaments/usePlayMatch";

import { MatchBody } from "./MatchView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div data-testid="replay-open" /> }));

const NOW = Date.parse(FIXTURE_NOW);
const MIN = 60_000;

const draw = (
  d: MatchDetail,
  opts: { t?: Tournament | null; as?: string | null; now?: number; phase?: PlayPhase; signedOut?: boolean; organizer?: boolean } = {},
) =>
  render(
    <ChakraProvider>
      <MatchBody
        d={d}
        t={opts.t === undefined ? fixtureMatch("waiting").tournament : opts.t}
        myUserId={opts.as === undefined ? FIXTURE_MATCH_YOU : opts.as}
        signedOut={!!opts.signedOut}
        now={opts.now ?? NOW}
        phase={opts.phase ?? { kind: "idle" }}
        onPlay={() => {}}
      />
    </ChakraProvider>,
  );
const state = (s: MatchPageState) => fixtureMatch(s);
const banner = () => screen.getByTestId("match-banner");
const bannerText = () => screen.getByTestId("match-banner-text");

/** A pre-deadline hold by bountyhuntr (e3) that outlives the deadline (5 min after the press). */
const lateHold = () => {
  const f = state("opponent_ready");
  const pressedAt = Date.parse(f.detail.readyChecks[0].createdAt);
  const d: MatchDetail = { ...f.detail, match: { ...f.detail.match, deadlineAt: new Date(pressedAt + 5 * MIN).toISOString() } };
  return { f, d, now: pressedAt + 6 * MIN };
};

describe("UX B1: play stays open after the deadline until the organizer decides", () => {
  it("the holder of a pre-deadline hold is told they advance if nobody joins", () => {
    const { d, now } = lateHold();
    draw(d, { as: "u3", now }); // bountyhuntr, the holder
    expect(screen.getByTestId("match-page")).toHaveAttribute("data-state", "you_ready");
    expect(bannerText()).toHaveTextContent(`You're waiting in your room until ${clock(d.liveRoom!.expiresAt)}. If nobody joins, you advance.`);
  });

  it("a spectator reads the hold with both names, never an ambiguous 'they'", () => {
    const { d, now } = lateHold();
    draw(d, { as: null, now });
    expect(bannerText()).toHaveTextContent(
      `The deadline has passed. bountyhuntr pressed Play and is waiting until ${clock(d.liveRoom!.expiresAt)}; if hokuto_shin doesn't join, bountyhuntr advances.`,
    );
    expect(screen.queryByTestId("play-box")).toBeNull();
  });

  it("past the deadline with no hold, a spectator is told the players can still play", () => {
    draw(state("deadline_passed").detail, { as: null });
    expect(bannerText()).toHaveTextContent("The deadline has passed. They can still play until the organizer decides.");
  });

  it("a guest who plays this match gets the sign-in prompt past the deadline", () => {
    draw(state("deadline_passed").detail, { as: null, signedOut: true });
    expect(screen.getByTestId("sign-in-prompt")).toHaveTextContent("Sign in to press Play.");
  });
});

describe("UX B2: seat-hold countdowns say what they are", () => {
  it("you're ready: 'left' on the big clock and the sticky button", () => {
    draw(state("you_ready").detail);
    expect(screen.getByTestId("seat-clock")).toHaveTextContent("14:32left");
    expect(screen.getByTestId("seat-clock")).toHaveAttribute("role", "timer");
    expect(screen.getByTestId("sticky-play")).toHaveTextContent("Take your seat here · 14:32 left");
  });

  it("opponent ready: 'Join now · 11:48 left' on the sticky button", () => {
    draw(state("opponent_ready").detail);
    expect(screen.getByTestId("sticky-play")).toHaveTextContent("Join now · 11:48 left");
  });
});

describe("UX B3: an expired session on Play", () => {
  it("shows the message and a Sign in with Discord button back to this match", () => {
    const f = state("waiting");
    draw(f.detail, { phase: { kind: "error", message: "Your session ended. Sign in with Discord again.", reason: "unauthorized" } });
    expect(screen.getByTestId("play-error")).toHaveTextContent("Your session ended.");
    const btn = screen.getByTestId("play-sign-in");
    expect(btn).toHaveTextContent("Sign in with Discord");
    expect(btn.closest("a")?.getAttribute("href")).toContain(encodeURIComponent(`/tournaments?t=${f.tournament.slug}&m=${f.detail.match.id}`));
  });

  it("any other error shows no sign-in button", () => {
    draw(state("waiting").detail, { phase: { kind: "error", message: "Couldn't reach the server. Try again.", reason: "unavailable" } });
    expect(screen.queryByTestId("play-sign-in")).toBeNull();
  });
});

describe("UX B5: a decided match speaks to the two players", () => {
  it("the winner advances; the loser is thanked and pointed somewhere; a spectator keeps the plain line", () => {
    const d = state("decided").detail; // hokuto_shin (u2) beat bountyhuntr (u3)
    const { unmount } = draw(d);
    expect(bannerText()).toHaveTextContent("You won. You advance to the Final.");
    expect(screen.queryByTestId("after-loss")).toBeNull();
    unmount();
    const r = draw(d, { as: "u3" });
    expect(bannerText()).toHaveTextContent("hokuto_shin won this one. You're out of the bracket, thanks for playing.");
    const after = screen.getByTestId("after-loss");
    expect(within(after).getByText("See the bracket").closest("a")).toHaveAttribute("href", expect.stringContaining("/tournaments?t="));
    expect(within(after).getByText("Find another tournament").closest("a")).toHaveAttribute("href", "/tournaments");
    r.unmount();
    draw(d, { as: null });
    expect(bannerText()).toHaveTextContent("Decided. hokuto_shin advances to the Final.");
  });

  it("the champion is congratulated; the runner-up is thanked", () => {
    const f = state("decided");
    const d: MatchDetail = { ...f.detail, match: { ...f.detail.match, round: 3, position: 0, nextMatchId: null, nextSlot: null } };
    const { unmount } = draw(d);
    expect(bannerText()).toHaveTextContent("You won the tournament. Champion!");
    unmount();
    draw(d, { as: "u3" });
    expect(bannerText()).toHaveTextContent("hokuto_shin won the final. You finish runner-up, thanks for playing.");
  });

  it("a rule-decided match says it to the loser too — nobody 'won this one' (#1279 review)", () => {
    draw(state("decided_by_rule").detail, { as: "u3" });
    expect(bannerText()).toHaveTextContent(
      "Decided by the deadline rule. hokuto_shin advances. You're out of the bracket, thanks for playing.",
    );
    expect(bannerText()).not.toHaveTextContent("won this one");
  });

  it("…and to the winner: they advance, no game was won (#1279 review)", () => {
    draw(state("decided_by_rule").detail);
    expect(bannerText()).toHaveTextContent("Decided by the deadline rule. You advance to the Final.");
    expect(bannerText()).not.toHaveTextContent("You won");
  });

  it("a round-robin GROUP loser is still in the event: only 'See the standings' (#1279 review)", () => {
    const f = state("decided");
    const d: MatchDetail = { ...f.detail, match: { ...f.detail.match, stage: "group" } };
    const r = draw(d, { as: "u3" });
    const after = screen.getByTestId("after-loss");
    expect(within(after).getByText("See the standings")).toBeInTheDocument();
    expect(within(after).queryByText("Find another tournament")).toBeNull();
    r.unmount();
    // the round-robin FINAL's loser is done with the event: both stay
    draw({ ...f.detail, match: { ...f.detail.match, stage: "final", nextMatchId: null, nextSlot: null } }, { as: "u3" });
    expect(within(screen.getByTestId("after-loss")).getByText("Find another tournament")).toBeInTheDocument();
  });
});

describe("interactions S1 / journeys B2: a game with no winner", () => {
  const noWinner = (extra: Partial<Game> = {}) => {
    const f = state("waiting");
    const game: Game = {
      gameIndex: 0,
      roomId: "R1",
      gameId: null,
      startedAt: new Date(NOW - 40 * MIN).toISOString(),
      finishedAt: new Date(NOW - 20 * MIN).toISOString(),
      winnerEntry: null,
      source: "tagged",
      verified: false,
      assignment: f.detail.match.matchup,
      ...extra,
    };
    return { ...f.detail, match: { ...f.detail.match, games: [game] } };
  };

  it("reads 'ended with no result, play again', never 'Unknown won' or 'Awaiting confirmation'", () => {
    draw(noWinner({ endReason: "abandoned" }));
    const row = screen.getAllByTestId("game-row")[0];
    expect(row).toHaveTextContent("Game 1 ended with no result (both players left). Play again.");
    expect(row).not.toHaveTextContent("Unknown");
    expect(row).not.toHaveTextContent("Awaiting confirmation");
    expect(bannerText()).toHaveTextContent(`Game 1 ended with no result. Play again any time before ${dateTime(state("waiting").detail.match.deadlineAt)}.`);
    expect(bannerText()).not.toHaveTextContent("confirm");
    expect(within(screen.getByTestId("play-box")).getByTestId("play-button")).toBeEnabled();
  });

  it("a stalled close says so", () => {
    draw(noWinner({ endReason: "stalled" }));
    expect(screen.getAllByTestId("game-row")[0]).toHaveTextContent("Game 1 ended with no result (the game stalled and was closed).");
  });

  it("after the match is later decided it is still 'no result', not 'finished after the match was decided'", () => {
    const d = noWinner();
    const dec: MatchDetail = { ...d, match: { ...d.match, status: "decided", winner: d.match.slotA, decidedBy: "organizer" } };
    draw(dec);
    const row = screen.getAllByTestId("game-row")[0];
    expect(row).toHaveTextContent("Game 1 ended with no result.");
    expect(row).not.toHaveTextContent("Play again");
    expect(row).not.toHaveTextContent("Finished after the match was decided");
  });

  it("an untagged game with a winner still waits for the organizer — with no 24h promise", () => {
    const d = noWinner({ winnerEntry: "e3", source: "untagged" });
    draw(d);
    expect(bannerText()).toHaveTextContent("A result is waiting for the organizer. It only counts if they confirm it; until then the match stays open.");
    expect(bannerText()).not.toHaveTextContent("24h");
    expect(screen.getAllByTestId("game-row")[0]).toHaveTextContent("Awaiting confirmation");
  });

  it("a forfeit win names the reason (endReason disconnect)", () => {
    const f = state("decided");
    const d: MatchDetail = { ...f.detail, match: { ...f.detail.match, games: [{ ...f.detail.match.games[0], endReason: "disconnect" }] } };
    draw(d);
    expect(screen.getAllByTestId("game-row")[0]).toHaveTextContent("hokuto_shin won (opponent disconnected)");
  });

  it("phones get the date / length / id line under each game (journeys polish)", () => {
    draw(state("decided").detail);
    expect(screen.getByTestId("game-meta-phone")).toHaveTextContent("#10571");
  });
});

describe("UX S2/S16/S17/P1: dates and spans", () => {
  it("the open banner names the full closing date, and the deadline card says local time", () => {
    const d = state("waiting").detail;
    draw(d);
    expect(bannerText()).toHaveTextContent(`Play any time before ${dateTime(d.match.deadlineAt)}.`);
    expect(screen.getByTestId("local-time-hint")).toHaveTextContent("(your local time)");
  });

  it("the last hour drops zero units: '12 m', not '0 d 0 h 12 m'", () => {
    const d = state("waiting").detail;
    draw(d, { now: Date.parse(d.match.deadlineAt!) - 12.5 * MIN });
    const big = screen.getByTestId("deadline-card");
    expect(big).toHaveTextContent("12m");
    expect(big).not.toHaveTextContent("0d");
    expect(big).not.toHaveTextContent("0h");
  });

  it("after the deadline the lede says 'closed'; a decided card says 'was due'", () => {
    const { unmount } = draw(state("deadline_passed").detail);
    expect(document.body).toHaveTextContent(/· closed /);
    expect(document.body).not.toHaveTextContent(/· closes /);
    unmount();
    const d = state("decided").detail;
    draw(d);
    expect(screen.getByTestId("deadline-card")).toHaveTextContent(`was due ${dateTime(d.match.deadlineAt)}`);
  });

  it("a spectator of an unplayed match sees when it closes (P18)", () => {
    const d = state("waiting").detail;
    draw(d, { as: null });
    expect(bannerText()).toHaveTextContent(`hokuto_shin and bountyhuntr haven't played yet. The match closes ${dateTime(d.match.deadlineAt)}.`);
  });
});

describe("UX S4: Discord is promised only when the bot is live", () => {
  it("notifications 'none' (or absent): no Discord promise, no 'told'", () => {
    const f = state("you_ready");
    draw(f.detail, { t: { ...f.tournament, notifications: "none" } });
    expect(bannerText()).toHaveTextContent("You're ready. bountyhuntr can join from this page.");
    expect(screen.getByTestId("play-box")).not.toHaveTextContent("told");
  });

  it("notifications 'discord': the ping is promised", () => {
    const f = state("you_ready");
    const { unmount } = draw(f.detail, { t: { ...f.tournament, notifications: "discord" } });
    expect(bannerText()).toHaveTextContent("You're ready. We let bountyhuntr know on Discord.");
    expect(screen.getByTestId("play-box")).toHaveTextContent("✓ bountyhuntr told on Discord");
    unmount();
    draw(state("waiting").detail, { t: { ...f.tournament, notifications: "discord" } });
    expect(screen.getByTestId("play-box")).toHaveTextContent("let bountyhuntr know on Discord");
  });

  it("without Discord the ready box says the opponent sees it here", () => {
    draw(state("waiting").detail);
    expect(screen.getByTestId("play-box")).toHaveTextContent("bountyhuntr sees you're ready on this page.");
    expect(screen.getByTestId("play-box")).not.toHaveTextContent("Discord");
  });
});

describe("UX S6/S13/S14/P4/P11/P17: jargon, announcements, headings", () => {
  it("the side card is 'Who pressed Play'; no 'ready-check' anywhere on the page", () => {
    draw(state("decided_by_rule").detail);
    expect(screen.getByTestId("ready-checks")).toHaveTextContent("Who pressed Play");
    expect(document.body.textContent).not.toMatch(/ready-check/i);
  });

  it("the state line is an H2, announced politely; the countdown is not; no internal tooltip", () => {
    draw(state("opponent_ready").detail);
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2).toBe(bannerText());
    expect(h2).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText(/Join within/)).not.toHaveAttribute("aria-live");
    expect(banner()).not.toHaveAttribute("title");
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
  });

  it("a hold that ran out (before the api's sweep) reads 'Your hold ran out', not 'ready now'", () => {
    const d = state("you_ready").detail;
    draw(d, { now: Date.parse(d.readyChecks[0].expiresAt) + 1000 });
    expect(screen.getByTestId("ready-checks")).toHaveTextContent("Your hold ran out");
    expect(screen.getByTestId("ready-checks")).not.toHaveTextContent("ready now");
  });

  it("in play: the banner doesn't repeat 'Live spectating isn't available yet'", () => {
    draw(state("in_play").detail);
    expect(banner()).not.toHaveTextContent("Live spectating");
  });
});

describe("UX P3: one replay button per surface", () => {
  it("a decided match on desktop offers the games-row chip, no second 'Watch the replay' button in the card", () => {
    draw(state("decided").detail);
    expect(screen.getAllByTestId("replay-chip")).toHaveLength(1);
    // Only the phone's sticky bar carries the big button.
    expect(screen.getAllByText("Watch the replay")).toHaveLength(1);
    expect(within(screen.getByTestId("sticky-play")).getByText("Watch the replay")).toBeInTheDocument();
  });
});
