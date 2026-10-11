import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { RulebookViewer } from "./RulebookViewer";
import { AdventureBriefing } from "./AdventureBriefing";
import { rulebookFor } from "@/lib/pro/adventureRulebook";

// jsdom's selector engine rejects Chakra's focus-trap probe (see AdventureBriefing.test.tsx).
jest.mock("react-focus-lock", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const book = rulebookFor("isla-nublar")!;
const wrap = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>);

describe("RulebookViewer (#1371)", () => {
  it("pages with buttons and arrow keys, stops at both ends, preloads only the next page", () => {
    wrap(<RulebookViewer book={book} isOpen onClose={() => undefined} />);
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("1 / 14");
    expect(screen.getByTestId("rulebook-prev")).toBeDisabled();
    expect(screen.getByAltText("Rulebook cover")).toHaveAttribute("src", expect.stringMatching(/\/cover\.webp$/));
    expect(document.querySelectorAll("img")).toHaveLength(2); // current + next only
    expect(screen.getByTestId("rulebook-credit")).toHaveTextContent("Scenario and rulebook by AndSushi and JBGeorgeLouie");

    fireEvent.click(screen.getByTestId("rulebook-next"));
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("2 / 14");
    expect(screen.getByAltText("Rulebook page 1")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("3 / 14");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("1 / 14");

    for (let i = 0; i < 20; i++) fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("14 / 14");
    expect(screen.getByTestId("rulebook-next")).toBeDisabled();
    expect(screen.getByAltText("Rulebook page 13")).toBeInTheDocument();
    expect(document.querySelectorAll("img")).toHaveLength(1); // no next after the last page
  });

  it("swipes between pages", () => {
    wrap(<RulebookViewer book={book} isOpen onClose={() => undefined} />);
    const page = screen.getByTestId("rulebook-page");
    fireEvent.touchStart(page, { touches: [{ clientX: 300, clientY: 0 }], changedTouches: [{ clientX: 300, clientY: 0 }] });
    fireEvent.touchEnd(page, { changedTouches: [{ clientX: 100, clientY: 0 }] });
    expect(screen.getByTestId("rulebook-counter")).toHaveTextContent("2 / 14");
  });

  it("shows the link only for the Jurassic scenario and opens the viewer", () => {
    const { unmount } = wrap(<AdventureBriefing label="X" scenarioId="clockwork-heist" />);
    expect(screen.queryByTestId("adventure-rulebook-link")).not.toBeInTheDocument();
    unmount();
    wrap(<AdventureBriefing label="Isla Nublar" scenarioId="isla-nublar" />);
    expect(screen.queryByTestId("rulebook-viewer")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("adventure-rulebook-link"));
    expect(screen.getByTestId("rulebook-viewer")).toBeInTheDocument();
  });
});
