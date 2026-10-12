import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { Community, CommunityHero } from "@/lib/stats/types";

import { MatchGridCard } from "./Community";

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
});

const hero = (i: number): CommunityHero => ({
  heroId: `hero-${String(i).padStart(2, "0")}`,
  heroName: `Hero ${String(i).padStart(2, "0")}`,
  games: 100 - i,
  wins: 10,
  draws: 0,
  crown: null,
});

const community = (n: number): Community => {
  const heroes = Array.from({ length: n }, (_, i) => hero(i));
  return {
    window: "all",
    windowStart: null,
    generatedAt: null,
    totals: null,
    weekly: null,
    heroes,
    matchups: [
      { heroId: heroes[0].heroId, opponentHeroId: heroes[1].heroId, games: 5, wins: 3, draws: 0 },
      { heroId: heroes[1].heroId, opponentHeroId: heroes[0].heroId, games: 5, wins: 2, draws: 0 },
    ],
    playersRanked: null,
  };
};

const renderCard = (n: number) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChakraProvider>
        <MatchGridCard community={community(n)} />
      </ChakraProvider>
    </QueryClientProvider>,
  );

const rowCount = () => screen.getAllByRole("rowheader").length;

describe("MatchGridCard hero scope", () => {
  it("defaults to the top 10 and expands to every hero with games", () => {
    renderCard(14);
    expect(screen.getByRole("button", { name: "Top 10" })).toHaveAttribute("aria-pressed", "true");
    expect(rowCount()).toBe(10);
    expect(screen.getByRole("table", { name: /most played heroes/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All heroes" }));
    expect(rowCount()).toBe(14);
    expect(screen.getByRole("table", { name: /all heroes/ })).toBeInTheDocument();
  });

  it("keeps the scope when the mode toggle changes", () => {
    renderCard(14);
    fireEvent.click(screen.getByRole("button", { name: "All heroes" }));
    fireEvent.click(screen.getByRole("button", { name: "Win rate" }));
    expect(screen.getByRole("button", { name: "All heroes" })).toHaveAttribute("aria-pressed", "true");
    expect(rowCount()).toBe(14);
  });

  it("hides the scope toggle when 10 or fewer heroes have games", () => {
    renderCard(8);
    expect(screen.queryByRole("button", { name: "All heroes" })).toBeNull();
    expect(rowCount()).toBe(8);
  });
});
