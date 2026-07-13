/**
 * Create-screen seats panel (#228, #264). The 2v2 trap was a FLAT P1/P2 // P3/P4
 * grid that reads as adjacent pairs, so a creator arms a bot OPPONENT when they
 * meant a bot TEAMMATE. The panel now groups seats by their team — but the team
 * split is DERIVED FROM THE SELECTED MAP (mirroring the engine), not hard-coded:
 * the default 2v2 board (Island of Despair, seats A1,A2,B1,B2) pairs A={p1,p2}
 * vs B={p3,p4}, while the interleaved Playtest Arena (A1,B1,A2,B2) pairs
 * A={p1,p3} vs B={p2,p4}. These tests pin that map-awareness, the teammate being
 * identifiable before any click, and duel/ffa-3 staying flat.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { assignableSeats, BotSlotPlan, CreateSeats, SlotOccupant } from "./CreateSeats";
import { MULTIPLAYER_PLAYTEST_MAP, TeamSeatSource } from "@/lib/pro/multiplayerPlaytest";
import { PlayerId } from "@/lib/pro/protocol";

const renderPanel = (
  format: "duel" | "ffa-3" | "team-2v2",
  {
    onChange = () => {},
    plan = {},
    map,
  }: {
    onChange?: (player: PlayerId, occupant: SlotOccupant) => void;
    plan?: BotSlotPlan;
    map?: TeamSeatSource | null;
  } = {},
) =>
  render(
    <ChakraProvider>
      <CreateSeats selectedFormat={format} selectedMap={map} botSlotPlan={plan} onChangeBotSlot={onChange} />
    </ChakraProvider>,
  );

describe("CreateSeats — team-2v2 grouping (#228, #264)", () => {
  it("default board: Team A (You + P2 teammate) vs Team B (P3 + P4 opponents)", () => {
    renderPanel("team-2v2"); // no map → default board order (Island of Despair)

    const teamA = screen.getByTestId("team-box-A");
    const teamB = screen.getByTestId("team-box-B");

    // The creator's team owns P1 (You) and P2 — the default board's teammate.
    expect(within(teamA).getByTestId("seat-card-p1")).toBeInTheDocument();
    expect(within(teamA).getByTestId("seat-card-p2")).toBeInTheDocument();
    expect(within(teamA).getByText("Team A")).toBeInTheDocument();
    expect(within(teamA).getByText("You + your teammate")).toBeInTheDocument();

    // The opponents own P3 and P4.
    expect(within(teamB).getByTestId("seat-card-p3")).toBeInTheDocument();
    expect(within(teamB).getByTestId("seat-card-p4")).toBeInTheDocument();
    expect(within(teamB).getByText("Team B")).toBeInTheDocument();
    expect(within(teamB).getByText("Opponents")).toBeInTheDocument();
  });

  it("interleaved arena map: Team A (You + P3) vs Team B (P2 + P4)", () => {
    renderPanel("team-2v2", { map: MULTIPLAYER_PLAYTEST_MAP });

    const teamA = screen.getByTestId("team-box-A");
    const teamB = screen.getByTestId("team-box-B");

    // Arena seats A1,B1,A2,B2 → runtime split A={p1,p3}, B={p2,p4}.
    expect(within(teamA).getByTestId("seat-card-p1")).toBeInTheDocument();
    expect(within(teamA).getByTestId("seat-card-p3")).toBeInTheDocument();
    expect(within(teamB).getByTestId("seat-card-p2")).toBeInTheDocument();
    expect(within(teamB).getByTestId("seat-card-p4")).toBeInTheDocument();
  });

  it("identifies the teammate slot (P2 on the default board) before any interaction", () => {
    renderPanel("team-2v2");
    const p2 = screen.getByTestId("seat-card-p2");
    expect(within(p2).getByText("P2")).toBeInTheDocument();
    expect(within(p2).getByText("your teammate")).toBeInTheDocument();
    // P1 is the creator; P3/P4 are opponents.
    expect(within(screen.getByTestId("seat-card-p1")).getByText("You")).toBeInTheDocument();
    expect(within(screen.getByTestId("seat-card-p3")).getByText("opponent")).toBeInTheDocument();
    expect(within(screen.getByTestId("seat-card-p4")).getByText("opponent")).toBeInTheDocument();
  });

  it("keeps P1..P4 seat ids visible (ROOM_STATUS / waiting-room reference them)", () => {
    renderPanel("team-2v2");
    for (const id of ["P1", "P2", "P3", "P4"]) {
      expect(screen.getByText(id)).toBeInTheDocument();
    }
  });

  it("P1 (You) has no bot controls; teammate P2 can pick every bot difficulty", () => {
    renderPanel("team-2v2");
    expect(within(screen.getByTestId("seat-card-p1")).queryByText("Easy bot")).not.toBeInTheDocument();
    const p2 = within(screen.getByTestId("seat-card-p2"));
    expect(p2.getByText("Easy bot")).toBeInTheDocument();
    expect(p2.getByText("Medium bot")).toBeInTheDocument();
    expect(p2.getByText("Hard bot")).toBeInTheDocument();
  });

  it("setting the teammate (P2) = Medium bot arms a bot TEAMMATE, not an opponent", () => {
    const onChange = jest.fn();
    renderPanel("team-2v2", { onChange });
    const p2 = screen.getByTestId("seat-card-p2");
    fireEvent.click(within(p2).getByText("Medium bot"));
    expect(onChange).toHaveBeenCalledWith("p2", "medium");
    // and it is NOT p3 (an opponent on the default board)
    expect(onChange).not.toHaveBeenCalledWith("p3", "medium");
  });
});

describe("CreateSeats — non-team formats", () => {
  it("duel renders no seats panel", () => {
    renderPanel("duel");
    expect(screen.queryByText("Seats")).not.toBeInTheDocument();
    expect(screen.queryByTestId("seat-card-p1")).not.toBeInTheDocument();
  });

  it("ffa-3 stays flat: no team boxes, seats P1/P2/P3 only", () => {
    renderPanel("ffa-3");
    expect(screen.queryByTestId("team-box-A")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-box-B")).not.toBeInTheDocument();
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("P2")).toBeInTheDocument();
    expect(screen.getByText("P3")).toBeInTheDocument();
    expect(screen.queryByText("P4")).not.toBeInTheDocument();
    // no team language leaks into ffa, but FFA bot slots can still pick every difficulty.
    expect(screen.queryByText(/your teammate/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Easy bot")).toHaveLength(2);
    expect(screen.getAllByText("Medium bot")).toHaveLength(2);
    expect(screen.getAllByText("Hard bot")).toHaveLength(2);
  });
});

describe("assignableSeats — bot-eligible seats per format", () => {
  it("team-2v2 exposes P2/P3/P4 (every seat but the creator's P1)", () => {
    expect(assignableSeats("team-2v2")).toEqual(["p2", "p3", "p4"]);
  });
  it("ffa-3 exposes P2/P3", () => {
    expect(assignableSeats("ffa-3")).toEqual(["p2", "p3"]);
  });
  it("duel exposes none", () => {
    expect(assignableSeats("duel")).toEqual([]);
  });
});
