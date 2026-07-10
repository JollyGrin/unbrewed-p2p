import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { useState } from "react";
import { ProErrorBoundary } from "./ProErrorBoundary";

/** A component that throws on render while `bomb` is true — stands in for a
 * ProBoard render crash (valid server state, client render throw). */
const Boom = ({ bomb, message }: { bomb: boolean; message: string }) => {
  if (bomb) throw new Error(message);
  return <div>board rendered ok</div>;
};

const renderBoundary = (ui: React.ReactNode) =>
  render(<ChakraProvider>{ui}</ChakraProvider>);

describe("ProErrorBoundary", () => {
  // The boundary logs the crash on purpose (componentDidCatch); React also logs
  // the caught error. Silence both so the test output stays readable, but assert
  // the boundary's own diagnostic fired.
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errSpy.mockRestore());

  it("renders a recoverable panel (error text + state hash + room/seat), not a white screen", () => {
    renderBoundary(
      <ProErrorBoundary roomId="ABCD" seat="p1" stateHash="deadbeef">
        <Boom bomb message="render exploded" />
      </ProErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("render exploded")).toBeInTheDocument();
    // room + seat + hash are all quoted for bug reports
    expect(screen.getByText(/room ABCD · seat p1 · state deadbeef/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try re-render/i })).toBeInTheDocument();
  });

  it("logs the error and component stack to the console (never swallows silently)", () => {
    renderBoundary(
      <ProErrorBoundary>
        <Boom bomb message="diagnostic please" />
      </ProErrorBoundary>
    );
    // our componentDidCatch prefixes the message; the component stack rides along
    expect(errSpy).toHaveBeenCalledWith(
      "[pro] game view render crashed:",
      expect.objectContaining({ message: "diagnostic please" }),
      expect.any(String)
    );
  });

  it("keeps the surrounding app shell alive when a child crashes", () => {
    renderBoundary(
      <div>
        <div>app shell header</div>
        <ProErrorBoundary>
          <Boom bomb message="boom" />
        </ProErrorBoundary>
      </div>
    );
    // sibling outside the boundary is untouched
    expect(screen.getByText("app shell header")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("'try re-render' recovers once the underlying throw is gone", () => {
    const Harness = () => {
      const [bomb, setBomb] = useState(true);
      return (
        <>
          <button onClick={() => setBomb(false)}>defuse</button>
          <ProErrorBoundary>
            <Boom bomb={bomb} message="temporary" />
          </ProErrorBoundary>
        </>
      );
    };
    renderBoundary(<Harness />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // clear the underlying cause, then retry
    fireEvent.click(screen.getByText("defuse"));
    fireEvent.click(screen.getByRole("button", { name: /try re-render/i }));
    expect(screen.getByText("board rendered ok")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pins the throw-time state hash even as live props drift to a newer view", () => {
    const { rerender } = renderBoundary(
      <ProErrorBoundary roomId="R1" seat="p1" stateHash="threw-at-this">
        <Boom bomb message="crash" />
      </ProErrorBoundary>
    );
    expect(screen.getByText(/state threw-at-this/)).toBeInTheDocument();

    // The socket delivers a newer view while the panel is latched: props drift,
    // but the panel must keep reporting the state that actually crashed.
    rerender(
      <ChakraProvider>
        <ProErrorBoundary roomId="R1" seat="p1" stateHash="newer-view-hash">
          <Boom bomb message="crash" />
        </ProErrorBoundary>
      </ChakraProvider>
    );
    expect(screen.getByText(/state threw-at-this/)).toBeInTheDocument();
    expect(screen.queryByText(/newer-view-hash/)).not.toBeInTheDocument();
  });

  it("on a reconnect that re-sends the same throwing view, re-catches and shows the panel again (no infinite crash loop)", () => {
    // resetKeys models the reconnect: a new view arrives (key changes), the
    // boundary re-attempts the render, the child throws again, and the boundary
    // must catch it and show the panel — not escape and white-screen the tab.
    const { rerender } = renderBoundary(
      <ProErrorBoundary resetKeys={["view-1"]}>
        <Boom bomb message="still broken" />
      </ProErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(
      <ChakraProvider>
        <ProErrorBoundary resetKeys={["view-2"]}>
          <Boom bomb message="still broken" />
        </ProErrorBoundary>
      </ChakraProvider>
    );

    // panel is still up (re-caught), the app didn't crash out of the boundary
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("still broken")).toBeInTheDocument();
  });
});
