/** Organizer panel on the match page (#1219): organizer only — never a player, spectator or signed-out viewer. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";

import { FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";

import { MatchView } from "./MatchView";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }),
}));
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
const mockEvent = jest.fn();
jest.mock("../../lib/tournaments/hooks", () => ({
  useMatchDetail: () => [{ status: "ready", value: f.detail }, jest.fn()],
  useTournament: () => [mockEvent(), jest.fn()],
  useNow: () => Date.parse(FIXTURE_NOW),
  useAttention: () => [{ status: "loading" }, jest.fn()],
}));
jest.mock("../../lib/tournaments/usePlayMatch", () => ({
  usePlayMatch: () => ({ phase: { kind: "idle" }, play: jest.fn() }),
}));

const as = (id: string | null) =>
  mockAccount.mockReturnValue(
    id
      ? { status: "signed-in", account: { id } }
      : { status: "guest", account: null },
  );
const eventReady = () =>
  mockEvent.mockReturnValue({
    status: "ready",
    value: { tournament: f.tournament, entries: f.entries, matches: f.matches },
  });

const mount = () =>
  render(
    <ChakraProvider>
      <MatchView slug={f.tournament.slug} matchId="m2-1" />
    </ChakraProvider>,
  );

beforeEach(eventReady);

it("shows the organizer panel to the organizer", () => {
  as(f.tournament.organizer.userId);
  mount();
  expect(screen.getByTestId("organizer-panel")).toBeInTheDocument();
  expect(screen.getByText("Set matchup…")).toBeInTheDocument();
  expect(screen.getByText("Override result…")).toBeInTheDocument();
});

it.each([
  ["a player in the match", "u2"],
  ["the other player", "u3"],
  ["a spectator", "u9"],
  ["a signed-out viewer", null],
])("never renders for %s", (_n, id) => {
  as(id);
  mount();
  expect(screen.queryByTestId("organizer-panel")).not.toBeInTheDocument();
  expect(screen.queryByText("Override result…")).not.toBeInTheDocument();
});

it("never renders before the tournament has loaded (organizer unknown)", () => {
  as(f.tournament.organizer.userId);
  mockEvent.mockReturnValue({ status: "loading" });
  mount();
  expect(screen.queryByTestId("organizer-panel")).not.toBeInTheDocument();
});
