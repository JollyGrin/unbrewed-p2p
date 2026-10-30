import { act, render, screen } from "@testing-library/react";
import { AnalyticsNotice } from "./AnalyticsNotice";

let pathname = "/";
jest.mock("next/router", () => ({ useRouter: () => ({ pathname }) }));
jest.mock("../../lib/analytics", () => {
  const seen = () => window.localStorage.getItem("n") === "seen";
  return {
    isGameRoute: (p: string) => p === "/pro/game" || p.startsWith("/pro/game/"),
    shouldShowNotice: () => !seen(),
    acknowledgeNotice: () => window.localStorage.setItem("n", "seen"),
    startAnalytics: jest.fn(),
    declineAnalytics: jest.fn(),
  };
});

const flushFrame = () => act(async () => { jest.advanceTimersByTime(50); });

describe("AnalyticsNotice", () => {
  beforeEach(() => { jest.useFakeTimers(); window.localStorage.clear(); pathname = "/"; });
  afterEach(() => jest.useRealTimers());

  it("shows on a normal route, hides on a game route, is not re-shown once seen", async () => {
    const { rerender } = render(<AnalyticsNotice />);
    await flushFrame();
    expect(screen.queryByRole("region", { name: "Analytics notice" })).not.toBeNull();

    pathname = "/pro/game";
    rerender(<AnalyticsNotice />);
    expect(screen.queryByRole("region", { name: "Analytics notice" })).toBeNull();

    pathname = "/";
    rerender(<AnalyticsNotice />);
    await flushFrame();
    expect(screen.queryByRole("region", { name: "Analytics notice" })).toBeNull();
  });
});
