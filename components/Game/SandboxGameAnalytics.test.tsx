import { render } from "@testing-library/react";
import { SandboxGameAnalytics } from "./SandboxGameAnalytics";

/** is_host on /game (#1511): decided once, from the first room state. */

const track = jest.fn();
jest.mock("../../lib/analytics", () => ({
  track: (...a: unknown[]) => track(...a),
}));
jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "ann" } }),
}));
let mockPlayers: Record<string, object> | undefined;
jest.mock("../../lib/contexts/WebGameProvider", () => ({
  useWebGame: () => ({
    gameState: mockPlayers
      ? { msgtype: "gamestate", content: { players: mockPlayers } }
      : undefined,
  }),
}));

const started = () => track.mock.calls.filter((c) => c[0] === "game_started");

beforeEach(() => {
  track.mockClear();
  mockPlayers = undefined;
  window.history.pushState({}, "", "/game");
});

describe("SandboxGameAnalytics", () => {
  it("waits for the first room state", () => {
    render(<SandboxGameAnalytics />);
    expect(track).not.toHaveBeenCalled();
  });

  it("alone in the room: host, and stays host when a friend joins", () => {
    mockPlayers = { ann: {} };
    const h = render(<SandboxGameAnalytics />);
    mockPlayers = { ann: {}, bob: {} };
    h.rerender(<SandboxGameAnalytics />);
    h.unmount();
    expect(started()).toEqual([
      ["game_started", { mode: "sandbox", players: 1, is_host: true }],
    ]);
    expect(track.mock.calls[1][1]).toMatchObject({ players: 2, is_host: true });
  });

  it("someone already in the room: not the host", () => {
    mockPlayers = { bob: {}, ann: {} };
    render(<SandboxGameAnalytics />);
    expect(started()).toEqual([
      ["game_started", { mode: "sandbox", players: 2, is_host: false }],
    ]);
  });
});
