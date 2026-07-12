import { act, render } from "@testing-library/react";
import { fmtCountdown, ForfeitCountdown, FORFEIT_AT_NEXT_TURN } from "./ProHud";

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

  it("swaps the ticking clock for 'next turn' copy once the deadline passes (issue #226)", () => {
    // The engine only lands the forfeit at the seat's next clock edge, so 0:00
    // can sit for a while. Show what actually happens next instead of a frozen
    // clock that over-promises exactness.
    jest.useFakeTimers();
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    const { container } = render(<ForfeitCountdown deadline={now + 1000} />);
    now += 10_000; // well past the deadline
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(container.textContent).toBe(FORFEIT_AT_NEXT_TURN);
    expect(container.textContent).toBe("auto-forfeits on their next turn");
    expect(container.textContent).not.toContain("0:00");
  });

  it("shows 'next turn' copy immediately when the deadline is already in the past", () => {
    // A late mount (e.g. a plate that just hydrated) must not flash a 0:00 clock.
    jest.useFakeTimers();
    const now = 500_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    const { container } = render(<ForfeitCountdown deadline={now - 3000} />);
    expect(container.textContent).toBe(FORFEIT_AT_NEXT_TURN);
  });

  it("keeps the 'next turn' copy on every subsequent tick until the badge is cleared", () => {
    // The forfeit STATE that unmounts the badge can arrive many seconds after the
    // deadline; the copy must stay put across ticks rather than reverting.
    jest.useFakeTimers();
    let now = 5_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);

    const { container } = render(<ForfeitCountdown deadline={now + 1000} />);
    now += 20_000;
    for (let i = 0; i < 5; i++) {
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(container.textContent).toBe(FORFEIT_AT_NEXT_TURN);
    }
  });
});
