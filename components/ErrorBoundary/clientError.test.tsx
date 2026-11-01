import { fireEvent, render, screen } from "@testing-library/react";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { ProErrorBoundary } from "../Pro/ProErrorBoundary";
import { resetOncePerPageLoad } from "../../lib/analyticsErrors";

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>) => true);
jest.mock("../../lib/analytics", () => ({
  track: (event: string, props?: Record<string, unknown>) => mockTrack(event, props),
}));

const Boom = (): JSX.Element => {
  throw new TypeError("x".repeat(300));
};

const clientErrors = () => mockTrack.mock.calls.filter(([event]) => event === "client_error");

describe("client_error from error boundaries (issue #1514)", () => {
  beforeEach(() => {
    mockTrack.mockReset().mockImplementation(() => true);
    resetOncePerPageLoad();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(["sandbox", "table", "irl"] as const)("%s: one event per page load, even across retries", (boundary) => {
    render(
      <GameErrorBoundary boundary={boundary}>
        <Boom />
      </GameErrorBoundary>
    );
    expect(screen.getByTestId("game-error-boundary-fallback")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" })); // throws again
    expect(screen.getByTestId("game-error-boundary-fallback")).toBeTruthy();

    expect(clientErrors()).toHaveLength(1);
    const props = clientErrors()[0][1];
    expect(props).toMatchObject({ boundary, route: "/", error_name: "TypeError" });
    expect(props!.message).toHaveLength(200);
  });

  it("pro: one event carrying the room identifiers", () => {
    render(
      <ProErrorBoundary roomId="R1" seat="p2" stateHash="abc">
        <Boom />
      </ProErrorBoundary>
    );
    fireEvent.click(screen.getByRole("button", { name: "Try re-render" }));

    expect(clientErrors()).toHaveLength(1);
    expect(clientErrors()[0][1]).toMatchObject({ boundary: "pro", room_id: "R1", seat: "p2", state_hash: "abc" });
  });

  it("each boundary reports independently", () => {
    render(
      <>
        <GameErrorBoundary boundary="sandbox">
          <Boom />
        </GameErrorBoundary>
        <GameErrorBoundary boundary="irl">
          <Boom />
        </GameErrorBoundary>
      </>
    );
    expect(clientErrors().map(([, p]) => p!.boundary)).toEqual(["sandbox", "irl"]);
  });
});
