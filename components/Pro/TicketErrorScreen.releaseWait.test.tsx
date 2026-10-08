/**
 * The dead-room auto-retry against an api with its OWN clock (journeys DF1).
 * The fake api below runs the room-gone age gate the way the real one does:
 * `too_soon` until the gate has run from BOTH the caller's ticket (issued with
 * the create check) and the moment the room was reported open — which comes a
 * few seconds after the check and is not on the match detail. Every response
 * carries the api's `Date`, and the browser's clock is skewed from it, so a
 * retry only lands after the gate when it is timed on the api's clock.
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { __resetAccountStoreForTests } from "../../lib/account/useAccount";
import { __resetServerClockForTests } from "../../lib/tournaments/serverClock";
import {
  MAX_ROOM_RELEASE_RETRIES,
  releasingText,
  ROOM_GONE_MIN_AGE_MS,
  ROOM_RELEASE_MARGIN_MS,
  ROOM_STILL_GONE,
  roomReleaseRetryWaitMs,
  roomReleaseWaitMs,
} from "../../lib/tournaments/usePlayMatch";

import { TicketErrorScreen } from "./TicketErrorScreen";

const GATE = ROOM_GONE_MIN_AGE_MS;
/** The api's clock when the player presses Try again (whole second: the `Date` header's resolution). */
const PRESS = Date.parse("2026-10-07T12:00:00Z");
const realFetch = global.fetch;

type World = {
  /** Browser clock minus api clock. */
  skewMs: number;
  /** How old the room's create check (and its ticket) is at the press, api clock. */
  checkAgeMs: number;
  /** How long after the check the room was reported open. */
  openedAfterMs?: number;
  /** Overrides the gate's answer: one body per ask (the last repeats). */
  answers?: Record<string, unknown>[];
};

const setup = (w: World) => {
  const serverNow = () => Date.now() - w.skewMs;
  const created = PRESS - w.checkAgeMs;
  const openedAt = created + (w.openedAfterMs ?? 0);
  /** The api-clock time of every room-gone ask. */
  const asks: number[] = [];
  let navigated: string | null = null;
  global.fetch = jest.fn(async (url: string) => {
    const path = String(url).replace(/^.*\/tournaments\/s\/matches\/m/, "");
    const headers = new Headers({ Date: new Date(serverNow()).toUTCString() });
    const json = (b: unknown) => ({ ok: true, status: 200, headers, json: async () => b });
    if (String(url).endsWith("/me")) return { ok: false, status: 401, headers, json: async () => ({}) };
    if (path === "/room-gone") {
      const now = serverNow();
      asks.push(now);
      if (w.answers) return json(w.answers[Math.min(asks.length - 1, w.answers.length - 1)]);
      const oldEnough = now - GATE;
      return json(created <= oldEnough && openedAt <= oldEnough ? { cleared: true } : { cleared: false, reason: "too_soon" });
    }
    if (path === "/ticket" || path === "/ready") {
      const cleared = asks.length > 0 && !w.answers && serverNow() - GATE >= Math.max(created, openedAt);
      return json({ action: cleared ? "create" : "join", ticket: "t.sig", gameIndex: 0, slot: "a", heroId: null, map: null, ticketExpiresAt: "x", roomId: cleared ? null : "GONE" });
    }
    if (path === "")
      return json({
        match: { id: "m", status: "open", slotA: "e1", slotB: "e2", games: [] },
        tournament: { slug: "s", status: "running", roomGoneMinAgeMs: GATE },
        players: {},
        readyChecks: [
          { id: "rc", gameIndex: 0, entryId: "e1", createdAt: new Date(created).toISOString(), expiresAt: new Date(created + 900_000).toISOString(), roomId: "GONE", outcome: "pending", role: "create" },
        ],
        liveRoom: null,
      });
    return { ok: false, status: 404, headers, json: async () => ({}) };
  }) as never;
  jest.setSystemTime(PRESS + w.skewMs);
  render(
    <ChakraProvider>
      <TicketErrorScreen code="ROOM_NOT_FOUND" at={{ slug: "s", matchId: "m" }} roomId="GONE" navigate={(h) => (navigated = h)} />
    </ChakraProvider>,
  );
  return { asks, gateEndsAt: Math.max(created, openedAt) + GATE, navigated: () => navigated };
};

const tick = (ms: number) => act(async () => void (await jest.advanceTimersByTimeAsync(ms)));
/** Mount settles (the screen's own match fetch teaches it the api's clock), then the press. */
const press = async () => {
  await tick(0);
  fireEvent.click(screen.getByText("Try again"));
  await tick(0);
};
const releasing = () => screen.queryByTestId("room-releasing")?.textContent ?? null;

beforeEach(() => {
  jest.useFakeTimers();
  __resetAccountStoreForTests();
  __resetServerClockForTests();
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
  global.fetch = realFetch;
});

describe("the first re-ask is timed on the api's clock, at or after its gate", () => {
  it("a room at the gate's last second: one re-ask, just past the gate, and the room is released", async () => {
    const w = setup({ skewMs: 0, checkAgeMs: GATE - 1000 });
    await press();
    expect(w.asks).toHaveLength(1);
    await tick(GATE + ROOM_RELEASE_MARGIN_MS);
    expect(w.asks).toHaveLength(2);
    expect(w.asks[1]).toBeGreaterThanOrEqual(w.gateEndsAt);
    expect(w.asks[1]).toBeLessThanOrEqual(w.gateEndsAt + ROOM_RELEASE_MARGIN_MS + 1000);
    expect(w.navigated()).toContain("#ticket=t.sig");
  });

  it.each([
    ["5 s ahead", 5000, GATE - 1000],
    ["5 s behind", -5000, GATE - 1000],
    ["5 s ahead, 4 s left", 5000, GATE - 4000],
    ["5 s behind, 4 s left", -5000, GATE - 4000],
  ])("a browser clock %s: still ONE re-ask, landing just past the gate", async (_, skewMs, checkAgeMs) => {
    const w = setup({ skewMs, checkAgeMs });
    await press();
    await tick(GATE + ROOM_RELEASE_MARGIN_MS);
    expect(w.asks).toHaveLength(2);
    expect(w.asks[1]).toBeGreaterThanOrEqual(w.gateEndsAt);
    expect(w.asks[1]).toBeLessThanOrEqual(w.gateEndsAt + ROOM_RELEASE_MARGIN_MS + 1000);
    expect(w.navigated()).toContain("#ticket=t.sig");
  });
});

describe("a room reported open after its create check (DF1)", () => {
  it("the first re-ask is early; the second waits the gate from the first ask and gets the room released", async () => {
    // Pressed ~20 s after the check; the room only opened 7 s after the check.
    const w = setup({ skewMs: 0, checkAgeMs: 20_000, openedAfterMs: 7000 });
    await press();
    await tick(10_000 + ROOM_RELEASE_MARGIN_MS);
    expect(w.asks).toHaveLength(2); // still too_soon: the gate runs from the open
    expect(releasing()).toMatch(/Releasing it in \d+ s…/);
    await tick(GATE);
    expect(w.asks).toHaveLength(3);
    expect(w.asks[2]).toBeGreaterThanOrEqual(w.gateEndsAt);
    expect(w.asks[2]).toBeLessThanOrEqual(w.asks[0] + GATE + ROOM_RELEASE_MARGIN_MS + 1000);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(w.navigated()).toContain("#ticket=t.sig");
  });

  it("an api that says how long is left is honoured for the second wait", async () => {
    const w = setup({
      skewMs: 0,
      checkAgeMs: 20_000,
      answers: [
        { cleared: false, reason: "too_soon" },
        { cleared: false, reason: "too_soon", retryAfterMs: 4000 },
        { cleared: true },
      ],
    });
    await press();
    while (w.asks.length < 2) await tick(100);
    expect(releasing()).toBe(releasingText(6));
    await tick(4000 + ROOM_RELEASE_MARGIN_MS - 1);
    expect(w.asks).toHaveLength(2);
    await tick(1);
    expect(w.asks).toHaveLength(3);
    expect(w.asks[2] - w.asks[1]).toBe(4000 + ROOM_RELEASE_MARGIN_MS);
  });
});

describe("bounded: two automatic re-asks, then the player's own press", () => {
  it("an api that never lets go: three asks in all, the still-gone copy, and no more on its own", async () => {
    const w = setup({ skewMs: 0, checkAgeMs: GATE - 1000, answers: [{ cleared: false, reason: "too_soon" }] });
    await press();
    expect(releasing()).toBe(releasingText(3));
    await tick(1000 + ROOM_RELEASE_MARGIN_MS);
    expect(w.asks).toHaveLength(2);
    expect(releasing()).toMatch(/^This match's room closed\. Releasing it in \d+ s…$/);
    await tick(GATE + ROOM_RELEASE_MARGIN_MS);
    expect(w.asks).toHaveLength(1 + MAX_ROOM_RELEASE_RETRIES);
    expect(MAX_ROOM_RELEASE_RETRIES).toBe(2);
    expect(releasing()).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(ROOM_STILL_GONE);
    expect(ROOM_STILL_GONE).toBe(
      "This match's room closed and the server hasn't released it yet. Go back to the match and press Play again in a minute; if it keeps happening, ask the organizer.",
    );
    await tick(5 * GATE);
    expect(w.asks).toHaveLength(3);
    expect(w.navigated()).toBeNull();
  });
});

describe("the waits themselves", () => {
  const now = PRESS;
  const detail = (agoMs: number) =>
    ({
      match: { slotA: "e1", slotB: "e2" },
      tournament: { roomGoneMinAgeMs: GATE },
      readyChecks: [{ entryId: "e1", roomId: "GONE", role: "create", createdAt: new Date(now - agoMs).toISOString() }],
    }) as never;

  it("a check exactly the gate old waits only the margin; one past it, the same", () => {
    expect(ROOM_RELEASE_MARGIN_MS).toBe(2000);
    expect(roomReleaseWaitMs(detail(GATE), "GONE", now)).toBe(2000);
    expect(roomReleaseWaitMs(detail(GATE - 1000), "GONE", now)).toBe(3000);
  });

  it("the second wait: the api's remaining time, else the gate from the first ask; never past gate + margin", () => {
    expect(roomReleaseRetryWaitMs(GATE, 4000, now - 12_000, now)).toBe(6000);
    expect(roomReleaseRetryWaitMs(GATE, 0, now - 12_000, now)).toBe(2000);
    expect(roomReleaseRetryWaitMs(GATE, null, now - 12_000, now)).toBe(20_000);
    expect(roomReleaseRetryWaitMs(GATE, null, now - 60_000, now)).toBe(2000);
    expect(roomReleaseRetryWaitMs(GATE, 999_999, now, now)).toBe(GATE + 2000);
    expect(roomReleaseRetryWaitMs(GATE, -5, now, now)).toBe(2000);
  });
});
