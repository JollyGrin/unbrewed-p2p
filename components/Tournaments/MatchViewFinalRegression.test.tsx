/** p2p #1256: re-seated ready-check, corrected result, unverified late game, cancelled wording. */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { MatchBody } from "./MatchView";
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";
import type { MatchPageKind } from "@/lib/tournaments/matchPage";
import type { MatchDetail } from "@/lib/tournaments/types";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div /> }));

const NOW = Date.parse(FIXTURE_NOW);

const show = (state: MatchPageKind, tweak: (d: MatchDetail) => MatchDetail = (d) => d) => {
  const f = fixtureMatch(state);
  return render(
    <ChakraProvider>
      <MatchBody d={tweak(f.detail)} t={f.tournament} myUserId={FIXTURE_MATCH_YOU} signedOut={false} now={NOW} phase={{ kind: "idle" }} onPlay={() => {}} />
    </ChakraProvider>,
  );
};

it("D2: a displaced player's pending check is neither the opponent's room nor listed", () => {
  show("opponent_ready", (d) => ({ ...d, match: { ...d.match, slotB: "e9" } }));
  expect(screen.getByTestId("play-box")).not.toHaveTextContent("waiting in your room");
  expect(screen.getByTestId("ready-checks")).toHaveTextContent("None yet");
  expect(screen.queryByTestId("seat-held-note")).toBeNull();
});

it("D5: an organizer-corrected match shows no game score", () => {
  show("decided", (d) => ({ ...d, match: { ...d.match, decidedBy: "organizer" } }));
  expect(screen.getByTestId("match-score")).toHaveTextContent("–");
  expect(screen.getByTestId("match-score")).toHaveTextContent("Decided by organizer");
  expect(screen.getByTestId("match-score")).not.toHaveTextContent("Final score");
});

it("D6: an unverified game on a decided match is no score, no awaiting-confirmation, no replay promise", () => {
  show("decided", (d) => ({
    ...d,
    match: {
      ...d.match,
      decidedBy: "organizer",
      matchup: { heroes: { a: null, b: null }, map: null },
      games: d.match.games.map((g) => ({ ...g, verified: false, replayAvailable: false })),
    },
  }));
  expect(screen.getByTestId("match-score")).not.toHaveTextContent(/\d–\d/);
  expect(screen.getByTestId("games-list")).not.toHaveTextContent("Awaiting confirmation");
  expect(screen.queryByText("Heroes and board: see the replay")).toBeNull();
});

it("D7: a cancelled match says Cancelled, never 'Dealt at random' or a future 'Closed'", () => {
  show("waiting", (d) => ({ ...d, match: { ...d.match, cancelled: true, inPlay: false, matchup: { heroes: { a: null, b: null }, map: null } } }));
  expect(screen.queryByText(/Dealt at random/)).toBeNull();
  expect(screen.getByTestId("deadline-card")).not.toHaveTextContent(/Closed/);
});
