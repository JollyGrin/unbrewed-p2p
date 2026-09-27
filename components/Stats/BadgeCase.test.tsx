/**
 * The player dashboard's Badge case (#948): the /account grid, read-only,
 * inside the dashboard card — every badge drawn, locked ones with their
 * progress, the worn one marked with its slot, "Within reach" above it.
 */
import "@testing-library/jest-dom";
import { render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { fixturePlayer } from "@/lib/stats/fixtures";
import { normalizeStatsPlayer } from "@/lib/stats/normalize";
import type { StatsPlayer } from "@/lib/stats/types";

import { BadgeCase } from "./PlayerSections";

// 241 games wearing "regular": Veteran (250) is locked and close.
const player = normalizeStatsPlayer(fixturePlayer("pawnstorm")) as StatsPlayer;

const renderCase = () =>
  render(
    <ChakraProvider>
      <BadgeCase player={player} />
    </ChakraProvider>,
  );

describe("dashboard BadgeCase", () => {
  it("draws the whole catalog as the /account grid, locked badges included", () => {
    renderCase();
    const tiles = screen.getAllByTestId("account-badge");
    expect(tiles).toHaveLength(player.badges.badges.length);

    const veteran = tiles.find((t) => t.getAttribute("data-badge-id") === "veteran")!;
    expect(veteran).toHaveAttribute("data-locked", "true");
    expect(within(veteran).getByText("Finish 250 games. (241/250)")).toBeInTheDocument();

    const unlocked = player.badges.badges.filter((b) => b.unlocked).length;
    expect(screen.getByText(`${unlocked} of ${player.badges.badges.length} unlocked`)).toBeInTheDocument();
  });

  it("marks the worn badge with WEARING and its slot", () => {
    renderCase();
    const worn = screen
      .getAllByTestId("account-badge")
      .find((t) => t.getAttribute("data-badge-id") === "regular")!;
    expect(worn).toHaveAttribute("data-selected", "true");
    expect(within(worn).getByText("Wearing")).toBeInTheDocument();
    expect(within(worn).getByText("1")).toBeInTheDocument();
  });

  it("is read-only and draws no second heading or panel", () => {
    renderCase();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("account-worn-strip")).toBeNull();
    expect(screen.getAllByRole("heading", { name: "Badge case" })).toHaveLength(1);
  });

  it("keeps Within reach above the grid", () => {
    renderCase();
    const chase = screen.getAllByTestId("badge-chase");
    expect(chase.length).toBeGreaterThan(0);
    const grid = screen.getByTestId("account-badge-case");
    expect(chase[0].compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
