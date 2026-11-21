/** A match that loaded and was then deleted (two 404s) is announced above the stale data (#1267). */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";

import { FIXTURE_NOW, fixtureMatch } from "@/lib/tournaments/fixtures";

import { MatchView } from "./MatchView";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));
jest.mock("./MatchReplay", () => ({ MatchReplay: () => <div /> }));
jest.mock("../../lib/pro/useProLiveRoster", () => ({ useProLiveRosterState: () => ({ heroes: [], offline: false }) }));
jest.mock("../../lib/account/useAccount", () => ({
  ...jest.requireActual("../../lib/account/useAccount"),
  useAccount: () => ({ status: "guest", account: null }),
}));

const f = fixtureMatch("waiting");
let gone = false;
jest.mock("../../lib/tournaments/hooks", () => ({
  useMatchDetail: () => [{ status: "ready", value: f.detail }, jest.fn(), gone],
  useTournament: () => [{ status: "loading" }, jest.fn()],
  useNow: () => Date.parse(FIXTURE_NOW),
  useAttention: () => [{ status: "loading" }, jest.fn()],
}));
jest.mock("../../lib/tournaments/usePlayMatch", () => ({
  usePlayMatch: () => ({ phase: { kind: "idle" }, play: jest.fn() }),
}));

const mount = () =>
  render(
    <ChakraProvider>
      <MatchView slug={f.tournament.slug} matchId={f.detail.match.id} />
    </ChakraProvider>,
  );

it("shows no notice while the match is there", () => {
  gone = false;
  mount();
  expect(screen.queryByTestId("match-gone-notice")).toBeNull();
});

it("says the match is no longer available, with a link back, above the stale data", () => {
  gone = true;
  mount();
  const n = screen.getByTestId("match-gone-notice");
  expect(n).toHaveTextContent("This match is no longer available");
  expect(n.querySelector("a")).toHaveAttribute("href", expect.stringContaining(f.tournament.slug));
});
