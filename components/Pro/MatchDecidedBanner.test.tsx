/** p2p #1256 (D4): the organizer decided the match while the viewer is in its room. */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";

import { getMatch } from "../../lib/tournaments/api";

import { MatchDecidedBanner } from "./MatchDecidedBanner";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn() }));
const mockGet = getMatch as jest.Mock;

const mount = (at: { slug: string; matchId: string } | null) =>
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={at} />
    </ChakraProvider>,
  );
const reply = (match: object) => mockGet.mockResolvedValue({ ok: true, value: { match } });

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
