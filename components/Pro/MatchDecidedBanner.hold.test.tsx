/** The creator's waiting room learns its seat hold ran out (p2p #1279, UX B4). */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, render, screen } from "@testing-library/react";

import { getMatch } from "../../lib/tournaments/api";

import { HOLD_RAN_OUT, holdLeftText, MatchDecidedBanner, roomHold } from "./MatchDecidedBanner";

jest.mock("../../lib/tournaments/api", () => ({ getMatch: jest.fn() }));
jest.mock("../../lib/account/useAccount", () => ({ useAccount: () => ({ status: "signed-in", account: { id: "u-me" } }) }));
const get = getMatch as jest.Mock;

const T0 = Date.parse("2026-10-07T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const check = (roomId: string | null, expiresAt: number, outcome: "pending" | "answered" | "unanswered" = "pending") => ({
  id: `rc-${roomId}`,
  gameIndex: 0,
  entryId: "e-me",
  createdAt: iso(expiresAt - 15 * 60_000),
  expiresAt: iso(expiresAt),
  roomId,
  outcome,
  role: "create" as const,
});
const detail = (o: { liveRoom?: unknown; readyChecks?: unknown[]; status?: string } = {}) => ({
  match: { status: o.status ?? "open", inPlay: o.status === "in_play", winner: null, decidedBy: null },
  tournament: { status: "running" },
  players: { a: { userId: "u-me" }, b: { userId: "u-them" } },
  readyChecks: o.readyChecks ?? [],
  liveRoom: o.liveRoom ?? null,
});
const live = (roomId: string | null, expiresAt: number) => ({ gameIndex: 0, roomId, readyEntryId: "e-me", expiresAt: iso(expiresAt) });

describe("roomHold", () => {
  it("counts down from this room's live hold", () => {
    const h = roomHold(detail({ liveRoom: live("ROOM", T0 + 600_000) }) as never, "ROOM", T0);
    expect(h).toEqual({ endsAt: T0 + 600_000, live: true, gone: false });
  });
  it("falls back to this room's pending ready check", () => {
    const h = roomHold(detail({ readyChecks: [check("ROOM", T0 + 60_000)] }) as never, "ROOM", T0);
    expect(h).toMatchObject({ endsAt: T0 + 60_000, gone: false });
  });
  it("gone: the pending check expired", () => {
    expect(roomHold(detail({ readyChecks: [check("ROOM", T0 - 1)] }) as never, "ROOM", T0).gone).toBe(true);
  });
  it("gone: the check was swept as unanswered", () => {
    expect(roomHold(detail({ readyChecks: [check("ROOM", T0 - 1, "unanswered")] }) as never, "ROOM", T0).gone).toBe(true);
  });
  it("gone: the match's live room is another room", () => {
    expect(roomHold(detail({ liveRoom: live("OTHER", T0 + 600_000) }) as never, "ROOM", T0).gone).toBe(true);
  });
  it("gone: it was live before and no live room is left (not in play)", () => {
    expect(roomHold(detail() as never, "ROOM", T0, true).gone).toBe(true);
    expect(roomHold(detail({ status: "in_play" }) as never, "ROOM", T0, true).gone).toBe(false);
  });
  it("not gone: nothing known about this room yet, or the other room is still opening", () => {
    expect(roomHold(detail() as never, "ROOM", T0).gone).toBe(false);
    expect(roomHold(detail({ liveRoom: live(null, T0 + 600_000) }) as never, "ROOM", T0).gone).toBe(false);
  });
});

it("holdLeftText never reads like a clock time", () => {
  expect(holdLeftText(14 * 60_000 + 59_000)).toBe("14 min 59 s left");
  expect(holdLeftText(45_000)).toBe("45 s left");
  expect(holdLeftText(-5)).toBe("0 s left");
});

describe("the waiting room's copy", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
    get.mockReset();
  });
  afterEach(() => jest.useRealTimers());
  const tick = async (ms: number) => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(ms);
    });
  };
  const mount = (roomId: string | null = "ROOM") =>
    render(
      <ChakraProvider>
        <MatchDecidedBanner at={{ slug: "s", matchId: "m" }} roomId={roomId}>
          {(left) => <p data-testid="hold">{left === null ? "held" : holdLeftText(left)}</p>}
        </MatchDecidedBanner>
      </ChakraProvider>,
    );

  it("shows the live countdown from the api's expiresAt", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ liveRoom: live("ROOM", T0 + 10 * 60_000) }) });
    mount();
    await tick(0);
    expect(screen.getByTestId("hold")).toHaveTextContent("10 min 0 s left");
    await tick(61_000);
    expect(screen.getByTestId("hold")).toHaveTextContent("8 min 59 s left");
  });

  it("says the hold ran out once the countdown reaches zero, with the way back", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ liveRoom: live("ROOM", T0 + 5_000) }) });
    mount();
    await tick(0);
    expect(screen.getByTestId("hold")).toHaveTextContent("5 s left");
    await tick(6_000);
    expect(screen.queryByTestId("hold")).not.toBeInTheDocument();
    expect(screen.getByTestId("hold-expired-banner")).toHaveTextContent(HOLD_RAN_OUT);
    expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=s&m=m");
  });

  it("says so when the poll finds another live room for the match", async () => {
    get.mockResolvedValueOnce({ ok: true, value: detail({ liveRoom: live("ROOM", T0 + 10 * 60_000) }) });
    get.mockResolvedValue({ ok: true, value: detail({ liveRoom: live("NEWROOM", T0 + 30 * 60_000) }) });
    mount();
    await tick(0);
    expect(screen.getByTestId("hold")).toBeInTheDocument();
    await tick(15_000);
    expect(screen.getByTestId("hold-expired-banner")).toHaveTextContent("Your 15-minute hold ran out and this room closed.");
  });

  it("without a roomId (the in-game strip, older callers) the hold is never read", async () => {
    get.mockResolvedValue({ ok: true, value: detail({ liveRoom: live("OTHER", T0 + 1_000) }) });
    mount(null);
    await tick(20_000);
    expect(screen.getByTestId("hold")).toHaveTextContent("held");
    expect(screen.queryByTestId("hold-expired-banner")).not.toBeInTheDocument();
  });
});

it("a tournament cancelled mid-game says the game no longer counts, with the way to the tournament", async () => {
  get.mockResolvedValue({ ok: true, value: { ...detail(), tournament: { status: "cancelled" } } });
  render(
    <ChakraProvider>
      <MatchDecidedBanner at={{ slug: "s", matchId: "m" }} strip />
    </ChakraProvider>,
  );
  expect(await screen.findByTestId("tournament-cancelled-banner")).toHaveTextContent(
    "This tournament was cancelled. This game no longer counts.",
  );
  expect(screen.getByText("Back to the tournament").closest("a")).toHaveAttribute("href", "/tournaments?t=s");
});
