/**
 * The leaderboard's "Games played" chart (#958): every column shows a total,
 * and hovering/focusing/tapping a column opens a tooltip with the weekly
 * breakdown while dimming the rest.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import type { CommunityWeek } from "@/lib/stats/types";

import { StackedColumns, weekAriaLabel, weekRangeLabel } from "./StackedColumns";

const week = (weekStart: string, human: number, hardExpert: number, casual: number): CommunityWeek => ({
  weekStart,
  human,
  hardExpert,
  casual,
});

const WEEKS: CommunityWeek[] = [
  week("2026-07-06", 2, 1, 0),
  week("2026-07-13", 0, 0, 0),
  week("2026-09-21", 3, 1, 0),
];

const renderChart = (weeks = WEEKS) =>
  render(
    <ChakraProvider>
      <StackedColumns weeks={weeks} />
    </ChakraProvider>,
  );

describe("weekRangeLabel", () => {
  it("formats a plain week as its Mon–Sun range", () => {
    expect(weekRangeLabel("2026-07-06")).toBe("Jul 6 – Jul 12");
  });

  it("crosses a month boundary", () => {
    expect(weekRangeLabel("2026-09-28")).toBe("Sep 28 – Oct 4");
  });

  it("prefixes the current week", () => {
    expect(weekRangeLabel("2026-09-21", true)).toBe("This week · Sep 21 – Sep 27");
  });
});

describe("weekAriaLabel", () => {
  it("rounds each kind's share of that week's games", () => {
    const label = weekAriaLabel(week("2026-07-06", 2, 1, 0), false);
    expect(label).toContain("3 games");
    expect(label).toContain("Human vs human 2 (67%)");
    expect(label).toContain("vs hard / expert bot 1 (33%)");
    expect(label).toContain("vs casual bot 0 (0%)");
  });

  it("calls out a week with no games instead of dividing by zero", () => {
    const label = weekAriaLabel(week("2026-07-13", 0, 0, 0), false);
    expect(label).toContain("no games this week");
    expect(label).not.toContain("NaN");
  });
});

describe("StackedColumns", () => {
  it("prints a total above every column, including 0", () => {
    renderChart();
    const columns = screen.getAllByTestId("week-column");
    expect(columns).toHaveLength(3);
    expect(columns[0]).toHaveTextContent("3");
    expect(columns[1]).toHaveTextContent("0");
    expect(columns[2]).toHaveTextContent("4");
  });

  it("carries the same breakdown in the column's aria-label", () => {
    renderChart();
    const columns = screen.getAllByTestId("week-column");
    expect(columns[0]).toHaveAttribute("aria-label", weekAriaLabel(WEEKS[0], false));
    expect(columns[2]).toHaveAttribute("aria-label", weekAriaLabel(WEEKS[2], true));
  });

  it("drops the native title attribute", () => {
    renderChart();
    for (const col of screen.getAllByTestId("week-column")) {
      expect(col).not.toHaveAttribute("title");
    }
  });

  it("opens the tooltip with the full breakdown when a column is focused, and closes on blur", () => {
    renderChart();
    const columns = screen.getAllByTestId("week-column");
    fireEvent.focus(columns[0]);
    const tooltip = within(screen.getByRole("tooltip"));
    expect(tooltip.getByText("Jul 6 – Jul 12")).toBeInTheDocument();
    expect(tooltip.getByText("Human vs human")).toBeInTheDocument();
    expect(tooltip.getByText("2 (67%)")).toBeInTheDocument();
    expect(tooltip.getByText("3 games")).toBeInTheDocument();

    fireEvent.blur(columns[0]);
    const closing = screen.queryByRole("tooltip");
    if (closing) expect(closing).toHaveStyle({ opacity: 0 });
  });

  it("shows 'No games this week' for a zero-game column", () => {
    renderChart();
    const columns = screen.getAllByTestId("week-column");
    fireEvent.focus(columns[1]);
    expect(screen.getByText("No games this week")).toBeInTheDocument();
  });

  it("dims the other columns while one is active", () => {
    renderChart();
    const columns = screen.getAllByTestId("week-column");
    fireEvent.mouseEnter(columns[0]);
    expect(columns[0]).toHaveStyle({ opacity: 1 });
    expect(columns[1]).toHaveStyle({ opacity: 0.55 });
    expect(columns[2]).toHaveStyle({ opacity: 0.55 });
    fireEvent.mouseLeave(columns[0]);
    expect(columns[1]).toHaveStyle({ opacity: 1 });
  });
});
