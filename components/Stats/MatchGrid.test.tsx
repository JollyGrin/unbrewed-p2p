import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { matchupLookup } from "@/lib/stats/matchGrid";

import { MatchGrid } from "./MatchGrid";

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
});

const HEROES = [{ heroId: "thrall" }, { heroId: "appa" }, { heroId: "batman" }];
const lookup = matchupLookup([
  { heroId: "thrall", opponentHeroId: "appa", games: 10, wins: 7, draws: 0 },
  { heroId: "appa", opponentHeroId: "thrall", games: 10, wins: 3, draws: 0 },
  { heroId: "thrall", opponentHeroId: "batman", games: 2, wins: 1, draws: 0 },
  { heroId: "batman", opponentHeroId: "thrall", games: 2, wins: 1, draws: 0 },
]);

const renderGrid = (mode: "games" | "winRate") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <MatchGrid rows={HEROES} cols={HEROES} lookup={lookup} mode={mode} caption="test grid" />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const row = (name: string) => screen.getByRole("rowheader", { name }).closest("tr") as HTMLElement;

describe("MatchGrid", () => {
  it("is a captioned table with a blank diagonal and a tooltip on every other cell", () => {
    renderGrid("games");
    expect(screen.getByRole("table", { name: "test grid" })).toBeInTheDocument();
    const cells = within(row("Thrall")).getAllByRole("cell");
    expect(cells.map((c) => c.getAttribute("data-cell-kind"))).toEqual(["diagonal", "value", "value"]);
    expect(cells[0]).not.toHaveAttribute("title");
    expect(cells[1]).toHaveAttribute("title", "Thrall vs Appa: 10 games");
    expect(within(row("Appa")).getAllByRole("cell")[2]).toHaveTextContent("·");
  });

  it("shows win rates only from 3 games up", () => {
    renderGrid("winRate");
    const cells = within(row("Thrall")).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("70%");
    expect(cells[2]).toHaveTextContent("·");
    expect(within(row("Appa")).getAllByRole("cell")[0]).toHaveTextContent("30%");
  });
});
