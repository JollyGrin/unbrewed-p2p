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
import { formatForfeitCopy } from "@/lib/pro/formatForfeit";
import type { PlayerView } from "@/lib/pro/protocol";

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}` }));
const DUEL = { players: seats(2) } as unknown as PlayerView;
const FFA = { players: seats(3) } as unknown as PlayerView;
const ADVENTURE = { players: seats(2), scenario: { id: "isla-nublar" } } as unknown as PlayerView;

const open = ({ formatId, view = DUEL, signedIn }: { formatId?: string; view?: PlayerView; signedIn?: boolean }) =>
  render(
    <ChakraProvider>
      <ForfeitDialog isOpen onClose={jest.fn()} onConfirm={jest.fn()} stakes={formatForfeitCopy(formatId, view)} signedIn={signedIn} />
    </ChakraProvider>,
  );

describe("ForfeitDialog — the cosmetic-points note", () => {
  it("tells a signed-in player that forfeiting earns nothing, alongside the stakes copy", () => {
    open({ formatId: "duel", signedIn: true });

    expect(screen.getByText("Your opponent wins. This cannot be undone.")).toBeInTheDocument();
    expect(screen.getByTestId("forfeit-points-note")).toHaveTextContent(FORFEIT_POINTS_NOTE);
  });

  it("keeps the multiplayer stakes copy and appends the same line", () => {
    open({ formatId: "ffa-3", view: FFA, signedIn: true });

    expect(screen.getByText(/You resign your seat and its fighters are removed/)).toBeInTheDocument();
    expect(screen.getByTestId("forfeit-points-note")).toHaveTextContent(FORFEIT_POINTS_NOTE);
  });

  it("leaves a signed-out player's dialog exactly as it was", () => {
    open({ formatId: "duel" });

    expect(screen.getByText("Your opponent wins. This cannot be undone.")).toBeInTheDocument();
    expect(screen.queryByTestId("forfeit-points-note")).not.toBeInTheDocument();
    expect(screen.queryByText(/cosmetic points/)).not.toBeInTheDocument();
  });
});

describe("ForfeitDialog — copy from the format registry (p2p #1474)", () => {
  it("duel: the dialog body is byte-identical to the pre-registry copy, with or without a format id", () => {
    const body = (formatId?: string) => {
      const { unmount } = open({ formatId });
      const text = screen.getByRole("alertdialog").textContent;
      unmount();
      return text;
    };
    expect(body("duel")).toBe("Forfeit the game?Your opponent wins. This cannot be undone.Keep playingForfeit");
    expect(body(undefined)).toBe(body("duel"));
  });

  it("adventure: says only what the client can know — no 'plays on', no 'last hero' prediction", () => {
    open({ formatId: "adventure", view: ADVENTURE });

    expect(
      screen.getByText(
        "Forfeiting removes your fighters from the table; the game continues if any other hero can still play. This cannot be undone.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Your opponent wins/)).not.toBeInTheDocument();
  });

  it("adventure: a teammate whose only figure is an unentered reserve no longer reads as 'the table plays on'", () => {
    // #1412's edge: the client saw a living, non-defeated teammate fighter and claimed the table
    // plays on, while the engine (never on the board → noLivingFighters) ends the adventure.
    const reserveTeammate = {
      ...ADVENTURE,
      you: "p1",
      fighters: [
        { id: "p1/alpha", owner: "p1", space: "A1", defeated: false },
        { id: "p2/reserve", owner: "p2", space: null, defeated: false },
      ],
    } as unknown as PlayerView;
    open({ formatId: "adventure", view: reserveTeammate });

    expect(screen.queryByText(/plays on/)).not.toBeInTheDocument();
    expect(screen.queryByText(/last hero in play/)).not.toBeInTheDocument();
    expect(screen.getByText(/the game continues if any other hero can still play/)).toBeInTheDocument();
  });

  it("defaults to Keep playing and keeps the points note", () => {
    open({ formatId: "adventure", view: ADVENTURE, signedIn: true });

    expect(screen.getByRole("button", { name: "Keep playing" })).toHaveFocus();
    expect(screen.getByTestId("forfeit-points-note")).toHaveTextContent(FORFEIT_POINTS_NOTE);
  });
});
