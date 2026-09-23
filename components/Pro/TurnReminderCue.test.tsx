import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { TurnReminderCue } from "./TurnReminderCue";

const renderCue = (pulse: Parameters<typeof TurnReminderCue>[0]["pulse"]) =>
  render(
    <ChakraProvider>
      <TurnReminderCue pulse={pulse} />
    </ChakraProvider>
  );

describe("TurnReminderCue", () => {
  it("renders nothing before any nudge has fired", () => {
    renderCue(null);
    expect(screen.queryByTestId("turn-reminder-cue")).not.toBeInTheDocument();
  });

  it("shows the turn copy for a 'turn' nudge", () => {
    renderCue({ key: 1, reason: "turn" });
    expect(screen.getByText("YOUR TURN — waiting on you")).toBeInTheDocument();
  });

  it("shows the defend copy for a 'defense' nudge", () => {
    renderCue({ key: 1, reason: "defense" });
    expect(screen.getByText("DEFEND! — waiting on you")).toBeInTheDocument();
  });

  it("remounts (new key) on a later nudge so the pulse replays", () => {
    const { rerender } = render(
      <ChakraProvider>
        <TurnReminderCue pulse={{ key: 1, reason: "turn" }} />
      </ChakraProvider>
    );
    const first = screen.getByTestId("turn-reminder-cue");

    rerender(
      <ChakraProvider>
        <TurnReminderCue pulse={{ key: 2, reason: "turn" }} />
      </ChakraProvider>
    );
    const second = screen.getByTestId("turn-reminder-cue");
    expect(second).not.toBe(first);
  });
});
