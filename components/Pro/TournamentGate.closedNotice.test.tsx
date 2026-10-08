/**
 * The closed-room screen's lifetime, straight through the game's hook: an
 * expiry notice is our clock's guess and gives way to a game that starts
 * anyway; being moved out of the match is final, whatever arrives later.
 */
import "@testing-library/jest-dom";
import { act, renderHook } from "@testing-library/react";

import type { UseProSocketReturn } from "@/lib/pro/useProSocket";

import { useTournamentGame, type GateTournament } from "./TournamentGate";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn(async () => ({ ok: false, reason: "unavailable" })) }));

const AT = { slug: "autumn-skirmish", matchId: "m2-1" };
const GATE: GateTournament = { kind: "tagged", ref: AT, launch: null };

const socketWith = (snapshot: unknown, closeForGood = jest.fn()) =>
  ({
    roomId: "SF2ROOM",
    error: null,
    identitySettled: true,
    seatReleasedRoom: null,
    seatReplaced: false,
    takeSeatBack: jest.fn(),
    snapshot,
    joinRoom: jest.fn(),
    createRoom: jest.fn(),
    seatPresence: {},
    opponentConnected: true,
    closeForGood,
  }) as unknown as UseProSocketReturn;

const run = (closeForGood = jest.fn()) =>
  renderHook(({ snapshot }: { snapshot: unknown }) =>
    useTournamentGame(GATE, {
      socket: socketWith(snapshot, closeForGood),
      room: "SF2ROOM",
      joined: true,
      setJoined: jest.fn(),
      reconnectedRef: { current: false },
      setSelectedHeroId: jest.fn(),
      setSelectedMapId: jest.fn(),
      setSelectedFormat: jest.fn(),
      setRolledHero: jest.fn(),
    }), { initialProps: { snapshot: null as unknown } });

beforeEach(() => window.localStorage.setItem("unbrewed-pro-tournament-room-SF2ROOM", JSON.stringify({ ...AT, ts: Date.now() })));
afterEach(() => window.localStorage.clear());

it("an expiry notice gives way to a game snapshot", () => {
  const h = run();
  act(() => h.result.current.onNotice("expired"));
  expect(h.result.current.closedScreen).not.toBeNull();
  h.rerender({ snapshot: { view: { turn: 1 } } });
  expect(h.result.current.closedScreen).toBeNull();
});

it("being moved out stays final: a snapshot after it never brings the board back, and the socket closes", () => {
  const closeForGood = jest.fn();
  const h = run(closeForGood);
  act(() => h.result.current.onNotice("removed"));
  expect(closeForGood).toHaveBeenCalledTimes(1);
  h.rerender({ snapshot: { view: { turn: 1 } } });
  h.rerender({ snapshot: { view: { turn: 2 } } });
  expect(h.result.current.closedScreen).not.toBeNull();
});
