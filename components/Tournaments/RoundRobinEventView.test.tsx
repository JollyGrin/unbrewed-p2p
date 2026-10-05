/** The round-robin page (#1221), against fixtures. */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { RoundRobinEventView } from "./RoundRobinEventView";
import {
  fixtureRoundRobin4,
  fixtureRoundRobin5,
  fixtureRoundRobin6,
  fixtureRoundRobin6Complete,
  fixtureRoundRobin6Final,
} from "@/lib/tournaments/fixtures";

jest.mock("next/router", () => ({ useRouter: () => ({ query: {}, isReady: true, push: jest.fn() }) }));
jest.mock("../Navbar", () => ({ Navbar: () => <nav /> }));

const page = (p: ReturnType<typeof fixtureRoundRobin4>) =>
  render(
    <ChakraProvider>
      <RoundRobinEventView t={p.tournament} entries={p.entries} matches={p.matches} standings={p.standings ?? null} />
    </ChakraProvider>,
  );

describe("RoundRobinEventView", () => {
  it.each([
    [4, fixtureRoundRobin4, 6],
    [5, fixtureRoundRobin5, 10],
  ])("%i players: one standings row each and every match listed", (n, make, matches) => {
    page(make());
    expect(screen.getAllByTestId("standing-row")).toHaveLength(n);
    expect(screen.getAllByTestId("rr-match")).toHaveLength(matches);
    expect(screen.queryByTestId("rr-final")).toBeNull();
  });

  it("6 players with a final: cut line copy, dropped player, match links to the match page", () => {
    page(fixtureRoundRobin6());
    expect(screen.getByText(/Final cut: top 2 advance/)).toBeInTheDocument();
    expect(screen.getAllByText("Dropped out").length).toBeGreaterThan(0);
    const live = screen.getAllByTestId("rr-match").find((m) => m.dataset.state === "in_play")!;
    expect(live).toHaveTextContent("In play now");
    expect(live.getAttribute("href")).toMatch(/^\/tournaments\?t=fixture-rr-6&m=g5-/);
    expect(live.textContent).not.toMatch(/game\s*\d/i);
  });

  it("summary line mentions the top-2 final only when there is one", () => {
    const { unmount } = page(fixtureRoundRobin6());
    expect(screen.getByTestId("standings")).toHaveTextContent("then the top 2 play a final");
    unmount();
    page(fixtureRoundRobin4());
    expect(screen.getByTestId("standings")).not.toHaveTextContent("play a final");
  });

  it("final open: shows the final card above the match list", () => {
    page(fixtureRoundRobin6Final());
    const final = screen.getByTestId("rr-final");
    expect(within(final).getAllByTestId("rr-match")).toHaveLength(1);
    const rows = screen.getAllByTestId("standing-row");
    expect(rows.filter((r) => r.textContent?.includes("In the final"))).toHaveLength(2);
  });

  it("complete: names the champion", () => {
    page(fixtureRoundRobin6Complete());
    expect(screen.getByTestId("champion-line")).toHaveTextContent("Champion:");
    expect(screen.getAllByTestId("standing-row")[0]).toHaveTextContent("♛ Champion");
  });
});
