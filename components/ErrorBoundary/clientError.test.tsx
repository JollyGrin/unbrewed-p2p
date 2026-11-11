import { useLayoutEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameErrorBoundary } from "./GameErrorBoundary";
import { ProErrorBoundary } from "../Pro/ProErrorBoundary";
import { resetOncePerPageLoad } from "../../lib/analyticsErrors";

const mockTrack = jest.fn((_event: string, _props?: Record<string, unknown>) => true);
const mockCaptureException = jest.fn((_error: unknown, _props?: Record<string, unknown>) => true);
jest.mock("../../lib/analytics", () => ({
  track: (event: string, props?: Record<string, unknown>) => mockTrack(event, props),
  captureException: (error: unknown, props?: Record<string, unknown>) => mockCaptureException(error, props),
}));

const Boom = (): JSX.Element => {
  throw new TypeError("x".repeat(300));
};

const clientErrors = () => mockTrack.mock.calls.filter(([event]) => event === "client_error");

describe("client_error from error boundaries (issue #1514)", () => {
  beforeEach(() => {
    mockTrack.mockReset().mockImplementation(() => true);
    mockCaptureException.mockReset().mockImplementation(() => true);
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
    // Error Tracking (#1526): the original error, once per boundary per page load.
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][0]).toBeInstanceOf(TypeError);
    expect(mockCaptureException.mock.calls[0][1]).toEqual({ boundary });
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
    expect(mockCaptureException.mock.calls.map(([, p]) => p!.boundary)).toEqual(["sandbox", "irl"]);
  });
});

/** What Chrome throws when a translated page trips React's commit phase. */
const domError = (op: "insertBefore" | "removeChild") => {
  const e = new Error(
    op === "insertBefore"
      ? "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
      : "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
  );
  e.name = "NotFoundError";
  return e;
};

describe("GameErrorBoundary auto-recovers from DOM reconcile errors (#1528)", () => {
  beforeEach(() => {
    mockTrack.mockReset().mockImplementation(() => true);
    mockCaptureException.mockReset().mockImplementation(() => true);
    resetOncePerPageLoad();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(["insertBefore", "removeChild"] as const)("%s: one silent remount, reported as auto_recovered", (op) => {
    // Commit phase, like React's insertBefore against a translated DOM.
    let throwsLeft = 1;
    const Flaky = (): JSX.Element => {
      useLayoutEffect(() => {
        if (throwsLeft > 0) {
          throwsLeft--;
          throw domError(op);
        }
      }, []);
      return <p>board</p>;
    };
    render(
      <GameErrorBoundary boundary="sandbox">
        <Flaky />
      </GameErrorBoundary>
    );

    expect(screen.getByText("board")).toBeTruthy();
    expect(screen.queryByTestId("game-error-boundary-fallback")).toBeNull();
    expect(clientErrors()).toHaveLength(1);
    expect(clientErrors()[0][1]).toMatchObject({ boundary: "sandbox", error_name: "NotFoundError", auto_recovered: true });
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][1]).toEqual({ boundary: "sandbox", auto_recovered: true });
  });

  it("a repeat shows the panel instead of looping, and is still reported", () => {
    const AlwaysBroken = (): JSX.Element => {
      throw domError("insertBefore");
    };
    const catches = () =>
      [...(console.warn as jest.Mock).mock.calls, ...(console.error as jest.Mock).mock.calls].filter(
        ([msg]) => typeof msg === "string" && msg.startsWith("[sandbox]")
      ).length;
    render(
      <GameErrorBoundary boundary="sandbox">
        <AlwaysBroken />
      </GameErrorBoundary>
    );

    expect(screen.getByTestId("game-error-boundary-fallback")).toBeTruthy();
    // The remount is spent: Try again is a manual retry, never another silent one.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByTestId("game-error-boundary-fallback")).toBeTruthy();
    // auto-remount, panel, Try again → panel: three catches, then it rests.
    expect(catches()).toBe(3);

    expect(clientErrors().map(([, p]) => p!.auto_recovered)).toEqual([true, undefined]);
    expect(mockCaptureException.mock.calls.map(([, p]) => p)).toEqual([
      { boundary: "sandbox", auto_recovered: true },
      { boundary: "sandbox" },
    ]);
  });

  it("other errors, and NotFoundErrors from elsewhere, show the panel as before", () => {
    const notDom = new Error("The object can not be found here.");
    notDom.name = "NotFoundError";
    const Other = (): JSX.Element => {
      throw notDom;
    };
    render(
      <GameErrorBoundary boundary="sandbox">
        <Other />
      </GameErrorBoundary>
    );
    expect(screen.getByTestId("game-error-boundary-fallback")).toBeTruthy();
    expect(clientErrors()[0][1]!.auto_recovered).toBeUndefined();
  });
});

describe("ProErrorBoundary auto-recovers from DOM reconcile errors, guarded by time (#1608)", () => {
  // Throws once per `throwsLeft` in the commit phase, like React's
  // insertBefore/removeChild against a translated DOM. Re-keying it from the
  // test remounts it, so a later crash can be staged on demand.
  let throwsLeft = 0;
  let op: "insertBefore" | "removeChild" = "removeChild";
  const Flaky = (): JSX.Element => {
    useLayoutEffect(() => {
      if (throwsLeft > 0) {
        throwsLeft--;
        throw domError(op);
      }
    }, []);
    return <p>board</p>;
  };
  const onCaught = jest.fn();
  const ui = (key: number) => (
    <ProErrorBoundary roomId="ROOM1" seat="p2" stateHash="cafe" onCaught={onCaught}>
      <Flaky key={key} />
    </ProErrorBoundary>
  );
  const panel = () => screen.queryByTestId("pro-error-boundary-fallback");

  beforeEach(() => {
    mockTrack.mockReset().mockImplementation(() => true);
    mockCaptureException.mockReset().mockImplementation(() => true);
    resetOncePerPageLoad();
    onCaught.mockReset();
    throwsLeft = 0;
    op = "removeChild";
    jest.useFakeTimers();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(["insertBefore", "removeChild"] as const)(
    "%s: remounts with no panel, reports auto_recovered with the room ids, fires onCaught",
    (which) => {
      op = which;
      throwsLeft = 1;
      render(ui(0));

      expect(screen.getByText("board")).toBeTruthy();
      expect(panel()).toBeNull();
      expect(clientErrors()).toHaveLength(1);
      expect(clientErrors()[0][1]).toMatchObject({
        boundary: "pro",
        error_name: "NotFoundError",
        auto_recovered: true,
        room_id: "ROOM1",
        seat: "p2",
        state_hash: "cafe",
      });
      expect(mockCaptureException.mock.calls[0][1]).toEqual({ boundary: "pro", auto_recovered: true });
      expect(onCaught).toHaveBeenCalledTimes(1);
      expect(onCaught).toHaveBeenCalledWith(
        expect.objectContaining({ name: "NotFoundError" }),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    }
  );

  it("a second one within 10 seconds shows the panel", () => {
    throwsLeft = 1;
    const { rerender } = render(ui(0));
    expect(panel()).toBeNull();

    jest.advanceTimersByTime(9_999);
    throwsLeft = 1;
    rerender(ui(1));

    expect(panel()).toBeTruthy();
    expect(onCaught).toHaveBeenCalledTimes(2);
    expect(clientErrors().map(([, p]) => p!.auto_recovered)).toEqual([true, undefined]);
  });

  it("one after 10 seconds is recovered silently again", () => {
    throwsLeft = 1;
    const { rerender } = render(ui(0));

    jest.advanceTimersByTime(10_000);
    throwsLeft = 1;
    rerender(ui(1));

    expect(panel()).toBeNull();
    expect(screen.getByText("board")).toBeTruthy();
    expect(onCaught).toHaveBeenCalledTimes(2);
  });

  it("one that keeps failing on remount lands on the panel instead of looping", () => {
    throwsLeft = Infinity;
    render(ui(0));
    expect(panel()).toBeTruthy();
    // silent remount, then the panel: two catches, then it rests.
    expect(onCaught).toHaveBeenCalledTimes(2);
  });

  it("any other error shows the panel with no silent remount", () => {
    const Other = (): JSX.Element => {
      throw new Error("bad view");
    };
    render(
      <ProErrorBoundary onCaught={onCaught}>
        <Other />
      </ProErrorBoundary>
    );
    expect(panel()).toBeTruthy();
    expect(onCaught).toHaveBeenCalledTimes(1);
    expect(clientErrors()[0][1]!.auto_recovered).toBeUndefined();
  });
});
