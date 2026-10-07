/**
 * Dead rooms on the ticket card (p2p #1279, journeys S1/S2):
 *  - the joiner of the OPPONENT's dead room is told who must press Play again
 *    and until when their hold lasts — no retry that loops into the dead room;
 *  - the api's room-gone answer is kept per room, so a second dead room on the
 *    same screen is reported afresh (and gets its own too_soon wait).
 */
import "@testing-library/jest-dom";
import { ChakraProvider } from "@chakra-ui/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { fixtureMatch } from "../../lib/tournaments/fixtures";
import { clockOf } from "../../lib/tournaments/organizer";
import { __resetAccountStoreForTests } from "../../lib/account/useAccount";
import { OWN_ROOM_GONE, ROOM_STILL_GONE } from "../../lib/tournaments/usePlayMatch";

import { TicketErrorScreen } from "./TicketErrorScreen";

const AT = { slug: "s", matchId: "m" };
const realFetch = global.fetch;

type Calls = { path: string; method: string; body: unknown }[];
const api = (a: {
  roomGone: (roomId: string) => { cleared: boolean; reason?: string };
  ticket: () => Record<string, unknown>;
  detail?: () => unknown;
  /** The signed-in viewer's user id (`GET /me`); absent = a guest. */
  me?: string;
}) => {
  const calls: Calls = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const path = String(url).replace(/^.*\/tournaments\/s\/matches\/m/, "");
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, method: init?.method ?? "GET", body });
    const json = (b: unknown) => ({ ok: true, status: 200, headers: new Headers(), json: async () => b });
    if (String(url).endsWith("/me"))
      return a.me ? json({ user: { id: a.me, username: "me" } }) : { ok: false, status: 401, headers: new Headers(), json: async () => ({}) };
    if (path === "/room-gone") return json(a.roomGone(body.roomId));
    if (path === "/ticket" || path === "/ready")
      return json({ action: "join", ticket: "t.sig", gameIndex: 0, slot: "b", heroId: null, map: null, ticketExpiresAt: "x", roomId: null, ...a.ticket() });
    if (path === "" && a.detail) return json(a.detail());
    return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
  }) as never;
  return calls;
};

const flush = async () => {
  for (let i = 0; i < 6; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
};

/** The joiner's view of a match whose live room `GONE` carol opened. */
const carolsRoom = (notifications?: string) => {
  const d = JSON.parse(JSON.stringify(fixtureMatch("waiting").detail));
  d.players.a = { ...d.players.a, id: "e-carol", username: "carol" };
  d.players.b = { ...d.players.b, id: "e-bob", username: "bob" };
  d.liveRoom = { gameIndex: 0, roomId: "GONE", readyEntryId: "e-carol", expiresAt: "2026-10-07T14:29:00Z" };
  d.match.status = "open";
  if (notifications) d.tournament = { ...d.tournament, notifications };
  return d;
};

beforeEach(() => __resetAccountStoreForTests());
afterEach(() => {
  cleanup();
  global.fetch = realFetch;
});

const mount = (roomId: string, navigate = jest.fn()) => {
  const ui = (id: string) => (
    <ChakraProvider>
      <TicketErrorScreen code="ROOM_NOT_FOUND" at={AT} roomId={id} navigate={navigate} />
    </ChakraProvider>
  );
  const r = render(ui(roomId));
  return { navigate, rerender: (id: string) => r.rerender(ui(id)) };
};

describe("the opponent's dead room (journeys S1)", () => {
  it.each(["not_room_creator", "ambiguous_creator", "room_not_live"])(
    "%s: names who must press Play again and when their hold ends; no retry, the way back stays",
    async (reason) => {
      api({ roomGone: () => ({ cleared: false, reason }), ticket: () => ({ roomId: "GONE" }), detail: () => carolsRoom() });
      const { navigate } = mount("GONE");
      await flush();
      fireEvent.click(screen.getByText("Try again"));
      await flush();
      const card = screen.getByTestId("ticket-error");
      const until = clockOf("2026-10-07T14:29:00Z"); // the feature's one time formatter
      expect(card).toHaveTextContent(
        `The room carol opened is gone (the server restarted). carol needs to press Play again to open a new one; check the match page in a minute. Their hold runs out at ${until}.`,
      );
      expect(card).not.toHaveTextContent(ROOM_STILL_GONE);
      expect(screen.queryByText("Try again")).not.toBeInTheDocument();
      expect(screen.getByText("Back to the match").closest("a")).toHaveAttribute("href", "/tournaments?t=s&m=m");
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("promises a ping only when the tournament's Discord bot is live", async () => {
    api({ roomGone: () => ({ cleared: false, reason: "not_room_creator" }), ticket: () => ({ roomId: "GONE" }), detail: () => carolsRoom("discord") });
    mount("GONE");
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("carol needs to press Play again to open a new one; you'll get a ping.");
  });

  it("the opponent already opened a new room: the joiner just goes there", async () => {
    api({ roomGone: () => ({ cleared: false, reason: "room_not_live" }), ticket: () => ({ roomId: "NEW1" }), detail: () => carolsRoom() });
    const { navigate } = mount("GONE");
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining("room=NEW1"));
  });
});

describe("the viewer's OWN dead room (ambiguous_creator, #1279 review)", () => {
  it("never tells the room's creator to wait for themself", async () => {
    const d = carolsRoom();
    api({ roomGone: () => ({ cleared: false, reason: "ambiguous_creator" }), ticket: () => ({ roomId: "GONE" }), detail: () => d, me: d.players.a.userId });
    mount("GONE");
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    const card = screen.getByTestId("ticket-error");
    expect(card).toHaveTextContent(OWN_ROOM_GONE);
    expect(OWN_ROOM_GONE).toBe("Your room is gone (the server restarted). Go back to the match and press Play again to open a new one.");
    expect(card).not.toHaveTextContent("carol needs to press Play again");
    expect(screen.queryByText("Try again")).not.toBeInTheDocument();
    expect(screen.getByText("Back to the match")).toBeInTheDocument();
  });

  it("(control) signed in as the OTHER player: the opponent's copy", async () => {
    const d = carolsRoom();
    api({ roomGone: () => ({ cleared: false, reason: "ambiguous_creator" }), ticket: () => ({ roomId: "GONE" }), detail: () => d, me: d.players.b.userId });
    mount("GONE");
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    expect(screen.getByTestId("ticket-error")).toHaveTextContent("carol needs to press Play again");
  });
});

describe("two dead rooms on one screen (journeys S2)", () => {
  it("the second room is reported afresh and gets its own too_soon wait", async () => {
    const calls = api({
      roomGone: (room) => (room === "A" ? { cleared: true } : { cleared: false, reason: "too_soon" }),
      ticket: () => ({ roomId: "B" }),
    });
    const { rerender } = mount("A");
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    expect(calls.filter((c) => c.path === "/room-gone").map((c) => (c.body as { roomId: string }).roomId)).toEqual(["A"]);

    rerender("B"); // the room it sent us to died too
    await flush();
    fireEvent.click(screen.getByText("Try again"));
    await flush();
    expect(calls.filter((c) => c.path === "/room-gone").map((c) => (c.body as { roomId: string }).roomId)).toEqual(["A", "B"]);
    expect(screen.getByTestId("room-releasing")).toHaveTextContent(/Releasing it in \d+ s/);
  });
});
