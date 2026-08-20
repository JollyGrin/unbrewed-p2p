/**
 * The mulligan modal's contract (issue #622 ↔ engine #395): it shows YOUR five
 * cards, offers the server's two options while it is your turn to answer, and —
 * the part that matters for fairness — never says anything about the opponent's
 * choice, only that they are still deciding.
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { MulliganDialog, MulliganDialogProps } from "./MulliganDialog";
import { LegalOption } from "@/lib/pro/protocol";

const OPTIONS: LegalOption[] = [
  { id: "KEEP", label: "Keep" },
  { id: "MULLIGAN", label: "Mulligan" },
];

const props = (over: Partial<MulliganDialogProps> = {}): MulliganDialogProps => ({
  isOpen: true,
  hand: ["c1", "c2", "c3", "c4", "c5"],
  resolveCard: () => null,
  labelFor: (c) => `card ${c}`,
  options: OPTIONS,
  awaitingYou: true,
  decided: null,
  onChoose: jest.fn(),
  ...over,
});

describe("MulliganDialog", () => {
  it("shows the whole hand and both offered answers while it is your decision", () => {
    render(<MulliganDialog {...props()} />);
    for (const c of ["c1", "c2", "c3", "c4", "c5"]) {
      expect(screen.getByText(`card ${c}`)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mulligan" })).toBeInTheDocument();
  });

  it("answers with the option id the server offered", () => {
    const onChoose = jest.fn();
    render(<MulliganDialog {...props({ onChoose })} />);
    fireEvent.click(screen.getByRole("button", { name: "Mulligan" }));
    expect(onChoose).toHaveBeenCalledWith("MULLIGAN");
  });

  it("renders an option the client cannot classify under the server's own label", () => {
    render(<MulliganDialog {...props({ options: [{ id: "opt-9", label: "Something new" }] })} />);
    expect(screen.getByRole("button", { name: "Something new" })).toBeInTheDocument();
  });

  it("waits, naming only YOUR choice, once you have answered", () => {
    render(<MulliganDialog {...props({ awaitingYou: false, options: [], decided: "KEEP" })} />);
    expect(screen.getByText(/You kept your opening hand · waiting for your opponent/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mulligan" })).not.toBeInTheDocument();
  });

  it("says the opponent is deciding — and nothing about WHAT they decided — before your turn", () => {
    render(<MulliganDialog {...props({ awaitingYou: false, options: [], decided: null })} />);
    expect(screen.getByText("Your opponent is deciding…")).toBeInTheDocument();
    expect(screen.queryByText(/kept/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/mulliganed/i)).not.toBeInTheDocument();
  });

  it("renders nothing when the window is not open", () => {
    render(<MulliganDialog {...props({ isOpen: false })} />);
    expect(screen.queryByText("Your opening hand")).not.toBeInTheDocument();
  });
});

describe("MulliganDialog — the move clock (issue #223)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("carries this seat's countdown inside the modal, which covers the HUD's own bar", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
    render(<MulliganDialog {...props({ timer: { deadline: 1_030_000, totalSeconds: 60 } })} />);
    expect(screen.getByLabelText("move timer")).toBeInTheDocument();
  });

  it("shows no clock in an untimed room", () => {
    render(<MulliganDialog {...props()} />);
    expect(screen.queryByLabelText("move timer")).not.toBeInTheDocument();
  });
});

describe("MulliganDialog — multiplayer rooms", () => {
  it("drops the duel noun when three seats are at the table", () => {
    render(<MulliganDialog {...props({ awaitingYou: false, options: [], decided: null, multiplayer: true })} />);
    expect(screen.getByText("The other players are deciding…")).toBeInTheDocument();
    expect(screen.queryByText(/Your opponent is deciding/)).not.toBeInTheDocument();
  });

  it("waits on the other players, not 'your opponent', after you answer", () => {
    render(<MulliganDialog {...props({ awaitingYou: false, options: [], decided: "MULLIGAN", multiplayer: true })} />);
    expect(
      screen.getByText("You mulliganed your opening hand · waiting for the other players…")
    ).toBeInTheDocument();
  });
});
