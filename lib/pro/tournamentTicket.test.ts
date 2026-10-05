/** Tournament ticket query + board handling for /pro/game (#1218). */
import { catalogEntry } from "./mapCatalog";
import {
  parseTicketQuery,
  ticketBoard,
  ticketGameHref,
  ticketRetryable,
  tournamentRoomOf,
  rememberTournamentRoom,
  withoutTicketQuery,
  type TicketLaunch,
} from "./tournamentTicket";

const LAUNCH: TicketLaunch = {
  ticket: "payload.sig",
  slug: "autumn-skirmish",
  matchId: "m2-1",
  room: null,
  heroId: "kenshiro",
  map: { kind: "catalog", id: "counts-castle" },
};

const queryOf = (href: string) => Object.fromEntries(new URL(href, "http://x").searchParams);

describe("ticket links", () => {
  it("round-trips a create launch through the URL", () => {
    expect(parseTicketQuery(queryOf(ticketGameHref(LAUNCH)))).toEqual(LAUNCH);
  });

  it("a room in the link makes it a join", () => {
    const join = { ...LAUNCH, room: "ABCD", heroId: null, map: null };
    expect(parseTicketQuery(queryOf(ticketGameHref(join)))).toEqual(join);
  });

  it("ignores every ordinary /pro/game query", () => {
    expect(parseTicketQuery({})).toBeNull();
    expect(parseTicketQuery({ room: "ABCD", hero: "kenshiro" })).toBeNull();
    expect(parseTicketQuery({ ticket: "x", tour: "s" })).toBeNull(); // no match id
  });

  it("drops a malformed map lock instead of guessing", () => {
    expect(parseTicketQuery({ ticket: "t", tour: "s", match: "m", lockMap: "weird" })?.map).toBeNull();
    expect(parseTicketQuery({ ticket: "t", tour: "s", match: "m", lockMap: "planet:x" })?.map).toBeNull();
  });

  it("strips only the ticket's keys", () => {
    expect(withoutTicketQuery({ ...queryOf(ticketGameHref({ ...LAUNCH, room: "ABCD" })), debug: "" })).toEqual({
      room: "ABCD",
      debug: "",
    });
  });
});

describe("ticketBoard — engine #755 map identity", () => {
  it("an engine board (Mended Drum) sends no customMap", () => {
    expect(ticketBoard({ kind: "catalog", id: "mended-drum" })).toEqual({ ok: true, mapId: "mended-drum", customMap: undefined });
  });

  it("any other catalog board sends its full ProMapDef, id = the slug", () => {
    const r = ticketBoard({ kind: "catalog", id: "counts-castle" });
    expect(r.ok && r.customMap?.id).toBe("counts-castle");
    expect(r.ok && r.customMap).toBe(catalogEntry("counts-castle")!.map);
  });

  it("no lock rolls a board, like the lobby's Random", () => {
    const entry = catalogEntry("weathertop")!;
    expect(ticketBoard(null, () => entry)).toEqual({ ok: true, mapId: "weathertop", customMap: entry.map });
  });

  it("refuses a board it can't send, with a reason", () => {
    const custom = ticketBoard({ kind: "custom", id: "my-board" });
    expect(custom.ok).toBe(false);
    expect(!custom.ok && custom.message).toMatch(/custom board/);
    expect(ticketBoard({ kind: "catalog", id: "no-such-board" }).ok).toBe(false);
  });
});

it("retries what a fresh ticket can fix", () => {
  expect(ticketRetryable("TICKET_EXPIRED")).toBe(true);
  expect(ticketRetryable("TICKET_MISMATCH")).toBe(true);
  expect(ticketRetryable("ROOM_NOT_FOUND")).toBe(true);
  expect(ticketRetryable("MATCHUP_LOCKED")).toBe(false);
  expect(ticketRetryable("TOURNAMENTS_DISABLED")).toBe(false);
});

it("remembers which rooms are tournament rooms", () => {
  expect(tournamentRoomOf("ROOM1")).toBeNull();
  rememberTournamentRoom("ROOM1", { slug: "s", matchId: "m" });
  expect(tournamentRoomOf("ROOM1")).toEqual({ slug: "s", matchId: "m" });
  expect(tournamentRoomOf(null)).toBeNull();
});
