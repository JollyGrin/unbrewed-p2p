/**
 * The concede confirmation's cosmetic-points line (#636, telemetry #66).
 *
 * The rule it discloses costs a signed-in player real points, and the dialog
 * is the last moment it can change their mind — so it must be there when the
 * player has a balance, and absent when they have none (a guest earns nothing
 * either way, and a warning about points they cannot hold is noise).
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";

import { ForfeitDialog, FORFEIT_POINTS_NOTE } from "./ForfeitDialog";

const open = (props: { signedIn?: boolean; multiplayer?: boolean }) =>
  render(
    <ChakraProvider>
      <ForfeitDialog isOpen onClose={jest.fn()} onConfirm={jest.fn()} {...props} />
    </ChakraProvider>,
  );

describe("ForfeitDialog — the cosmetic-points note", () => {
  it("tells a signed-in player that forfeiting earns nothing, alongside the stakes copy", () => {
    open({ signedIn: true });

    expect(screen.getByText("Your opponent wins. This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByTestId("forfeit-points-note")).toHaveTextContent(FORFEIT_POINTS_NOTE);
  });

  it("keeps the multiplayer stakes copy and appends the same line", () => {
    open({ signedIn: true, multiplayer: true });

    expect(screen.getByText(/You resign your seat and its fighters are removed/)).toBeInTheDocument();
    expect(screen.getByTestId("forfeit-points-note")).toHaveTextContent(FORFEIT_POINTS_NOTE);
  });

  it("leaves a signed-out player's dialog exactly as it was", () => {
    open({});

    expect(screen.getByText("Your opponent wins. This cannot be undone.")).toBeInTheDocument();
    expect(screen.queryByTestId("forfeit-points-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/cosmetic points/)).not.toBeInTheDocument();
  });
});
