import { act, render } from "@testing-library/react";
import { fmtCountdown, ForfeitCountdown } from "./ProHud";

describe("fmtCountdown", () => {
  it("formats seconds as mm:ss with a zero-padded seconds field", () => {
    expect(fmtCountdown(0)).toBe("0:00");
    expect(fmtCountdown(9)).toBe("0:09");
    expect(fmtCountdown(92)).toBe("1:32");
    expect(fmtCountdown(120)).toBe("2:00");
  });
});

describe("ForfeitCountdown — non-drifting server-deadline countdown (issue #222)", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("recomputes remaining from Date.now() each tick (server deadline, not a local counter)", () => {
    jest.useFakeTimers();
    let now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const deadline = now + 92_000; // 1:32 out

    const { container } = render(<ForfeitCountdown deadline={deadline} />);
    expect(container.textContent).toBe("auto-forfeit in 1:32");

    // Advance the WALL CLOCK by 30s but fire only one tick — a drifting local
    // counter would read 1:31; reading Date.now() gives the true 1:02.
    now += 30_000;
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(container.textContent).toBe("auto-forfeit in 1:02");
  });

  it("clamps at 0:00 once the deadline has passed", () => {
    jest.useFakeTimers();
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    const { container } = render(<ForfeitCountdown deadline={now + 1000} />);
    now += 10_000; // well past the deadline
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(container.textContent).toBe("auto-forfeit in 0:00");
  });
});
