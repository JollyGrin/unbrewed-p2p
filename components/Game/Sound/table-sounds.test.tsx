import { act, render } from "@testing-library/react";

import { RECONNECT_QUIET_MS, TableSounds } from "./table-sounds";

/**
 * The quiet window after the socket opens: whatever the join replay brings
 * is a catch-up, not something happening now.
 */

const mockPlay = jest.fn();
let mockGame: Record<string, unknown> = {};

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { name: "me" } }),
}));
jest.mock("../../../lib/sound", () => ({
  REMOTE_GAIN: 0.45,
  armSoundEngine: () => () => {},
  playSound: (...args: unknown[]) => mockPlay(...args),
}));
jest.mock("../../../lib/sound/settings", () => ({
  getSoundPrefs: () => ({ others: true }),
}));
jest.mock("../../../lib/contexts/WebGameProvider", () => ({
  JOIN_REPLAY_GRACE_MS: jest.requireActual("../../../lib/contexts/WebGameProvider")
    .JOIN_REPLAY_GRACE_MS,
  useWebGame: () => mockGame,
}));

const { JOIN_REPLAY_GRACE_MS } = jest.requireActual(
  "../../../lib/contexts/WebGameProvider",
);

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `c${i}` }));
/** A fresh game state in which `ann` holds `hand` cards. */
const state = (hand: number) => ({
  content: {
    players: {
      me: { pool: { hand: cards(5), deck: cards(20), discard: [] } },
      ann: { pool: { hand: cards(hand), deck: cards(25 - hand), discard: [] } },
    },
  },
});

describe("TableSounds after the socket opens", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPlay.mockClear();
  });
  afterEach(() => jest.useRealTimers());

  it("stays quiet past the join replay grace, then is live", () => {
    expect(RECONNECT_QUIET_MS).toBeGreaterThan(JOIN_REPLAY_GRACE_MS);

    mockGame = { connectionStatus: "connecting", gameState: state(5) };
    const view = render(<TableSounds />);
    mockGame = { connectionStatus: "open", gameState: state(5) };
    view.rerender(<TableSounds />);
    const update = (hand: number) => {
      mockGame = { connectionStatus: "open", gameState: state(hand) };
      view.rerender(<TableSounds />);
    };

    // a replay that lands just after the grace ran out is still a catch-up
    act(() => {
      jest.advanceTimersByTime(JOIN_REPLAY_GRACE_MS + 200);
    });
    update(6);
    expect(mockPlay).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(RECONNECT_QUIET_MS);
    });
    update(7);
    expect(mockPlay.mock.calls).toEqual([["draw", { count: 1, gain: 0.45 }]]);
  });
});
