/**
 * Create-screen seats panel (#228). The 2v2 trap was a FLAT P1/P2 // P3/P4 grid
 * that reads as adjacent pairs, so a creator arms a bot OPPONENT (P2) when they
 * meant a bot TEAMMATE. These tests pin the fix: seats are grouped by their
 * fixed team (A={p1,p3} vs B={p2,p4}), the teammate is identifiable before any
 * click, and duel/ffa-3 stay flat.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { assignableSeats, BotSlotPlan, CreateSeats, SlotOccupant } from "./CreateSeats";
import { PlayerId } from "@/lib/pro/protocol";

const renderPanel = (
  format: "duel" | "ffa-3" | "team-2v2",
  onChange: (player: PlayerId, occupant: SlotOccupant) => void = () => {},
  plan: BotSlotPlan = {},
) =>
  render(
    <ChakraProvider>
      <CreateSeats selectedFormat={format} botSlotPlan={plan} onChangeBotSlot={onChange} />
    </ChakraProvider>,
  );

describe("CreateSeats — team-2v2 grouping (#228)", () => {
  it("groups seats into Team A (You + P3 teammate) vs Team B (P2 + P4 opponents)", () => {
    renderPanel("team-2v2");

    const teamA = screen.getByTestId("team-box-A");
    const teamB = screen.getByTestId("team-box-B");

    // The creator's team owns P1 (You) and P3 — the interleaved teammate.
    expect(within(teamA).getByTestId("seat-card-p1")).toBeInTheDocument();
    expect(within(teamA).getByTestId("seat-card-p3")).toBeInTheDocument();
    expect(within(teamA).getByText("Team A")).toBeInTheDocument();
    expect(within(teamA).getByText("You + your teammate")).toBeInTheDocument();

    // The opponents own P2 and P4 — NOT the adjacent P2 the flat layout implied.
    expect(within(teamB).getByTestId("seat-card-p2")).toBeInTheDocument();
    expect(within(teamB).getByTestId("seat-card-p4")).toBeInTheDocument();
    expect(within(teamB).getByText("Team B")).toBeInTheDocument();
    expect(within(teamB).getByText("Opponents")).toBeInTheDocument();
  });

  it("identifies the teammate slot (P3) before any interaction", () => {
    renderPanel("team-2v2");
    const p3 = screen.getByTestId("seat-card-p3");
    expect(within(p3).getByText("P3")).toBeInTheDocument();
    expect(within(p3).getByText("your teammate")).toBeInTheDocument();
    // P1 is the creator; P2/P4 are opponents.
    expect(within(screen.getByTestId("seat-card-p1")).getByText("You")).toBeInTheDocument();
    expect(within(screen.getByTestId("seat-card-p2")).getByText("opponent")).toBeInTheDocument();
    expect(within(screen.getByTestId("seat-card-p4")).getByText("opponent")).toBeInTheDocument();
  });

  it("keeps P1..P4 seat ids visible (ROOM_STATUS / waiting-room reference them)", () => {
    renderPanel("team-2v2");
    for (const id of ["P1", "P2", "P3", "P4"]) {
      expect(screen.getByText(id)).toBeInTheDocument();
    }
  });

  it("P1 (You) has no bot controls; teammate P3 can pick every bot difficulty", () => {
    renderPanel("team-2v2");
    expect(within(screen.getByTestId("seat-card-p1")).queryByText("Easy bot")).not.toBeInTheDocument();
    const p3 = within(screen.getByTestId("seat-card-p3"));
    expect(p3.getByText("Easy bot")).toBeInTheDocument();
    expect(p3.getByText("Medium bot")).toBeInTheDocument();
    expect(p3.getByText("Hard bot")).toBeInTheDocument();
  });

  it("setting P3 = Medium bot arms a bot TEAMMATE (fires onChangeBotSlot for p3)", () => {
    const onChange = jest.fn();
    renderPanel("team-2v2", onChange);
    const p3 = screen.getByTestId("seat-card-p3");
    fireEvent.click(within(p3).getByText("Medium bot"));
    expect(onChange).toHaveBeenCalledWith("p3", "medium");
    // and it is NOT p2 (the opponent slot the flat layout used to trap into)
    expect(onChange).not.toHaveBeenCalledWith("p2", "medium");
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
    // no team language leaks into ffa, and non-team bot slots stay easy-only.
    expect(screen.queryByText(/your teammate/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Easy bot")).toHaveLength(2);
    expect(screen.queryByText("Medium bot")).not.toBeInTheDocument();
    expect(screen.queryByText("Hard bot")).not.toBeInTheDocument();
  });
});

describe("assignableSeats — bot-eligible seats per format", () => {
  it("team-2v2 exposes P2/P3/P4 (every seat but the creator's P1)", () => {
    expect(assignableSeats("team-2v2")).toEqual(["p3", "p2", "p4"]);
  });
  it("ffa-3 exposes P2/P3", () => {
    expect(assignableSeats("ffa-3")).toEqual(["p2", "p3"]);
  });
  it("duel exposes none", () => {
    expect(assignableSeats("duel")).toEqual([]);
  });
});
