import { renderHook } from "@testing-library/react";
import { labsDeckId } from "@/lib/labs";
import {
  deckSourceOf,
  MAX_JOINED_SEATS,
  useGameSession,
  useIrlSession,
} from "./gameAnalytics";

const track = jest.fn();
jest.mock("./analytics", () => ({
  track: (...a: unknown[]) => track(...a),
}));

const names = () => track.mock.calls.map((c) => c[0]);
const ended = () => track.mock.calls.filter((c) => c[0] === "game_ended");

const pageEvent = (type: "pagehide" | "pageshow", persisted = false) => {
  const e = new Event(type) as PageTransitionEvent;
  Object.defineProperty(e, "persisted", { value: persisted });
  window.dispatchEvent(e);
};

type Props = Parameters<typeof useGameSession>[0];
const session = (initial: Props) =>
  renderHook((p: Props) => useGameSession(p), { initialProps: initial });

beforeEach(() => {
  track.mockClear();
  window.history.pushState({}, "", "/game");
});

describe("useGameSession (#1511)", () => {
  it("waits for active, then start → end on unmount as `left`", () => {
    jest.useFakeTimers().setSystemTime(0);
    const base: Props = {
      mode: "sandbox",
      active: false,
      players: 0,
      isHost: false,
    };
    const h = session(base);
    expect(track).not.toHaveBeenCalled();

    h.rerender({ ...base, active: true, players: 1, isHost: true });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("game_started", {
      mode: "sandbox",
      players: 1,
      is_host: true,
    });

    // A second seat joins, then the socket drops: neither restarts nor ends it.
    h.rerender({ ...base, active: true, players: 2, isHost: true });
    h.rerender({ ...base, active: false, players: 2, isHost: true });
    expect(names()).toEqual(["game_started", "game_players_joined"]);

    jest.setSystemTime(95_400);
    h.unmount();
    expect(track).toHaveBeenLastCalledWith(
      "game_ended",
      {
        mode: "sandbox",
        duration_s: 95,
        players: 2,
        is_host: true,
        end_reason: "left",
      },
      undefined,
    );
    expect(names()).toEqual([
      "game_started",
      "game_players_joined",
      "game_ended",
    ]);
    jest.useRealTimers();
  });

  it("pagehide sends one beaconed `closed`; the later unmount sends nothing", () => {
    const h = session({ mode: "irl", active: true, players: 1, isHost: true });
    pageEvent("pagehide");
    pageEvent("pagehide");
    h.unmount();
    expect(ended()).toHaveLength(1);
    expect(ended()[0][1]).toMatchObject({ mode: "irl", end_reason: "closed" });
    expect(ended()[0][2]).toEqual({ beacon: true });
  });

  it("a double unmount ends the game once", () => {
    const h = session({
      mode: "sandbox",
      active: true,
      players: 1,
      isHost: false,
    });
    h.unmount();
    h.unmount();
    expect(ended()).toHaveLength(1);
  });

  it("a back/forward-cache restore starts a new game (the room is not re-counted)", () => {
    const h = session({
      mode: "sandbox",
      active: true,
      players: 2,
      isHost: true,
    });
    pageEvent("pagehide");
    pageEvent("pageshow", true);
    pageEvent("pageshow", true);
    h.unmount();
    expect(names()).toEqual([
      "game_started",
      "game_players_joined",
      "game_ended",
      "game_started",
      "game_ended",
    ]);
  });

  it("never emits on /pro/*", () => {
    window.history.pushState({}, "", "/pro/game");
    const h = session({
      mode: "sandbox",
      active: true,
      players: 2,
      isHost: true,
    });
    pageEvent("pagehide");
    h.unmount();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("game_players_joined (#1547)", () => {
  const joined = () =>
    track.mock.calls.filter((c) => c[0] === "game_players_joined");
  const base: Props = {
    mode: "sandbox",
    active: true,
    players: 1,
    isHost: true,
  };

  it("solo game: none", () => {
    const h = session(base);
    h.rerender({ ...base });
    h.unmount();
    expect(names()).toEqual(["game_started", "game_ended"]);
  });

  it("host: once when the second seat appears; a drop and rejoin sends nothing", () => {
    const h = session(base);
    h.rerender({ ...base, players: 2 });
    h.rerender({ ...base, players: 1 });
    h.rerender({ ...base, players: 2 });
    h.unmount();
    expect(names()).toEqual([
      "game_started",
      "game_players_joined",
      "game_ended",
    ]);
    expect(joined()[0][1]).toEqual({
      mode: "sandbox",
      players: 2,
      is_host: true,
    });
  });

  it("joiner: the first room state already has 2 seats, sent right after game_started", () => {
    const h = session({ ...base, active: false, players: 0, isHost: false });
    h.rerender({ ...base, players: 2, isHost: false });
    expect(names()).toEqual(["game_started", "game_players_joined"]);
    expect(joined()[0][1]).toEqual({
      mode: "sandbox",
      players: 2,
      is_host: false,
    });
    h.unmount();
  });

  it("2 → 3 players: once per threshold", () => {
    const h = session(base);
    h.rerender({ ...base, players: 2 });
    h.rerender({ ...base, players: 3 });
    h.rerender({ ...base, players: 2 });
    h.rerender({ ...base, players: 3 });
    h.unmount();
    expect(joined().map((c) => c[1].players)).toEqual([2, 3]);
  });

  it("1 → 3 jump (two guests at once): sends 2, then 3", () => {
    const h = session(base);
    h.rerender({ ...base, players: 3 });
    h.unmount();
    expect(names()).toEqual([
      "game_started",
      "game_players_joined",
      "game_players_joined",
      "game_ended",
    ]);
    expect(joined().map((c) => c[1])).toEqual([
      { mode: "sandbox", players: 2, is_host: true },
      { mode: "sandbox", players: 3, is_host: true },
    ]);
  });

  it(`caps at ${MAX_JOINED_SEATS} seats: ≤ 4 events per player`, () => {
    const h = session(base);
    h.rerender({ ...base, players: 4 });
    h.rerender({ ...base, players: 6 });
    h.unmount();
    expect(joined().map((c) => c[1].players)).toEqual([2, 3]);
    expect(track).toHaveBeenCalledTimes(4);
  });

  it("joiner into a 3-seat room: sends 2 and 3, once", () => {
    const h = session({ ...base, active: false, players: 0, isHost: false });
    h.rerender({ ...base, players: 3, isHost: false });
    h.rerender({ ...base, players: 3, isHost: false });
    h.unmount();
    expect(joined().map((c) => c[1].players)).toEqual([2, 3]);
  });

  it("reload: the host's room is counted once (is_host true, players 2)", () => {
    // Host page: alone, then a friend joins.
    const host = session(base);
    host.rerender({ ...base, players: 2 });
    pageEvent("pagehide");
    host.unmount();
    // Reloaded page: the relay replays both seats, so it is not the host.
    const reloaded = session({
      ...base,
      active: false,
      players: 0,
      isHost: false,
    });
    reloaded.rerender({ ...base, players: 2, isHost: false });
    reloaded.rerender({ ...base, players: 2, isHost: false });
    reloaded.unmount();
    expect(joined().map((c) => c[1])).toEqual([
      { mode: "sandbox", players: 2, is_host: true },
      { mode: "sandbox", players: 2, is_host: false },
    ]);
    const roomCount = joined().filter(
      (c) => c[1].is_host === true && c[1].players === 2,
    );
    expect(roomCount).toHaveLength(1);
    expect(names().filter((n) => n === "game_started")).toHaveLength(2);
  });

  it("a back/forward-cache restore starts a new game but does not count the room again", () => {
    const h = session(base);
    h.rerender({ ...base, players: 2 });
    pageEvent("pagehide");
    pageEvent("pageshow", true);
    expect(names()).toEqual([
      "game_started",
      "game_players_joined",
      "game_ended",
      "game_started",
    ]);
    // A new threshold after the restore still sends.
    h.rerender({ ...base, players: 3 });
    h.unmount();
    expect(joined().map((c) => c[1].players)).toEqual([2, 3]);
  });

  it("never emits on /pro/*", () => {
    window.history.pushState({}, "", "/pro/game");
    const h = session(base);
    h.rerender({ ...base, players: 2 });
    h.unmount();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("useIrlSession (#1511)", () => {
  type IrlProps = Parameters<typeof useIrlSession>[0];
  const irl = (initial: IrlProps) =>
    renderHook((p: IrlProps) => useIrlSession(p), { initialProps: initial });

  it("one irl_session_started with the deck, plus a single-seat host game", () => {
    window.history.pushState({}, "", "/irl");
    const h = irl({ offline: false, hasDeck: false, settled: false });
    expect(track).not.toHaveBeenCalled();
    h.rerender({ offline: false, hasDeck: true, settled: false });
    h.rerender({ offline: false, hasDeck: true, settled: true });
    expect(track.mock.calls.slice(0, 2)).toEqual([
      ["irl_session_started", { offline: false, has_deck: true }],
      ["game_started", { mode: "irl", players: 1, is_host: true }],
    ]);
    h.unmount();
    expect(names()).toEqual([
      "irl_session_started",
      "game_started",
      "game_ended",
    ]);
  });

  it("no deck: the session is reported, no game starts", () => {
    window.history.pushState({}, "", "/offline");
    const h = irl({ offline: true, hasDeck: false, settled: true });
    h.unmount();
    expect(track.mock.calls).toEqual([
      ["irl_session_started", { offline: true, has_deck: false }],
    ]);
  });
});

describe("deckSourceOf", () => {
  it("names only a Labs deck, from its id", () => {
    expect(deckSourceOf(undefined)).toBeUndefined();
    expect(deckSourceOf({ id: "abc123" })).toBeUndefined();
    expect(
      deckSourceOf({
        id: labsDeckId("char_0b1f6a3c-6f2e-4b7c-9a51-2d1e6f0c9a77"),
      }),
    ).toBe("unmatched-labs");
    // A curated popular deck carries a club sourceUrl however it was added.
    const curated = {
      id: "1",
      sourceUrl: "https://www.the-unmatched.club/c/heroes/x.1",
    };
    expect(deckSourceOf(curated)).toBeUndefined();
  });

  it("prefers the add source the bag stored, ignoring one it didn't mint", () => {
    expect(deckSourceOf({ id: "abc123", addSource: "popular" })).toBe(
      "popular",
    );
    expect(
      deckSourceOf({ id: "abc123", addSource: "typed" as never }),
    ).toBeUndefined();
  });
});
