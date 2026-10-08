/** p2p #1256 (D4): the organizer decided the match while the viewer is in its room. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";

import { getMatch } from "../../lib/tournaments/api";

import { MatchDecidedBanner } from "./MatchDecidedBanner";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn() }));
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => ({ status: "signed-in", account: { id: "u-me" } }) }));
const mockGet = getMatch as jest.Mock;

const mount = (at: { slug: string; matchId: string } | null) =>
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={at} />
    </ChakraProvider>,
  );
const reply = (match: object, players: object = {}) => mockGet.mockResolvedValue({ ok: true, value: { match, players } });

afterEach(() => jest.resetAllMocks());

it("organizer-decided: banner with a way back to the match", async () => {
  reply({ status: "decided", winner: "e1", decidedBy: "organizer" });
  mount({ slug: "s", matchId: "m" });
  expect(await screen.findByText(/The organizer decided this match. This game won't count./)).toBeInTheDocument();
  expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=s&m=m");
});

it("a match decided by play, or still open, shows nothing", async () => {
  reply({ status: "decided", winner: "e1", decidedBy: "result" });
  mount({ slug: "s", matchId: "m" });
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByTestId("match-decided-banner")).not.toBeInTheDocument();
});

it("a casual room (no tournament) never polls", () => {
  mount(null);
  expect(mockGet).not.toHaveBeenCalled();
});

it("displaced viewer: no longer in this match, with a way back, and the seat-held copy is gone", async () => {
  reply({ status: "open", winner: null, decidedBy: null }, { a: { userId: "u-x" }, b: { userId: "u-y" } });
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={{ slug: "s", matchId: "m" }}>
        <p>seat held, keep this tab open</p>
      </MatchDecidedBanner>
    </ChakraProvider>,
  );
  expect(await screen.findByText(/You are no longer in this match \(the organizer changed the bracket\)\./)).toBeInTheDocument();
  expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=s&m=m");
  expect(screen.queryByText(/keep this tab open/)).not.toBeInTheDocument();
});

it("a viewer still in the match keeps the seat-held copy", async () => {
  reply({ status: "open", winner: null, decidedBy: null }, { a: { userId: "u-me" }, b: null });
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={{ slug: "s", matchId: "m" }}>
        <p>seat held, keep this tab open</p>
      </MatchDecidedBanner>
    </ChakraProvider>,
  );
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.getByText(/keep this tab open/)).toBeInTheDocument();
  expect(screen.queryByTestId("match-removed-banner")).not.toBeInTheDocument();
});

it("decided: the waiting-room copy that contradicts it is hidden", async () => {
  reply({ status: "decided", winner: "e1", decidedBy: "organizer" });
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={{ slug: "s", matchId: "m" }}>
        <p>seat held, keep this tab open</p>
      </MatchDecidedBanner>
    </ChakraProvider>,
  );
  expect(await screen.findByTestId("match-decided-banner")).toBeInTheDocument();
  expect(screen.queryByText(/keep this tab open/)).not.toBeInTheDocument();
});
