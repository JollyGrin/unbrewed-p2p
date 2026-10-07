/** Tournament ticket query + board handling for /pro/game (#1218). */
import { catalogEntry } from "./mapCatalog";
import {
  assignTicketHref,
  dropTicketFragment,
  parseTicketQuery,
  takeTicketFragment,
  ticketBoard,
  ticketGameHref,
  ticketRetryable,
  forgetTournamentRoom,
  tournamentRoomOf,
  rememberTournamentRoom,
  TOURNAMENT_ROOM_MAX_AGE_MS,
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

/** The link's query plus its fragment keys — what /pro/game reads (#1268). */
const queryOf = (href: string) => {
  const u = new URL(href, "http://x");
  return { ...Object.fromEntries(u.searchParams), ...Object.fromEntries(new URLSearchParams(u.hash.slice(1))) };
};

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

describe("the ticket rides in the fragment (F5, #1268)", () => {
  afterEach(() => {
    dropTicketFragment();
    window.history.replaceState(null, "", "/");
  });

  it("a granted link carries the ticket in #ticket=, never in the query", () => {
    const u = new URL(ticketGameHref({ ...LAUNCH, ticket: "a+b/c=" }), "http://x");
    expect(u.searchParams.has("ticket")).toBe(false);
    expect(u.search).not.toContain("a+b");
    expect(new URLSearchParams(u.hash.slice(1)).get("ticket")).toBe("a+b/c=");
  });

  it("an old ?ticket= link still parses (rollout)", () => {
    expect(parseTicketQuery({ ticket: "payload.sig", tour: "autumn-skirmish", match: "m2-1", lockHero: "kenshiro", lockMap: "catalog:counts-castle" })).toEqual(LAUNCH);
  });

  it("takeTicketFragment reads it once and takes it out of the address bar at once", () => {
    window.history.replaceState({ keep: 1 }, "", "/pro/game?tour=s&match=m#ticket=frag.sig&other=1");
    expect(takeTicketFragment()).toBe("frag.sig");
    expect(window.location.hash).toBe("#other=1");
    expect(window.location.search).toBe("?tour=s&match=m");
    expect(window.history.state).toEqual({ keep: 1 });
    // StrictMode's second render on the same location still has it…
    expect(takeTicketFragment()).toBe("frag.sig");
    // …another location (the launch keys stripped, a later visit) doesn't.
    window.history.replaceState(null, "", "/pro/game?room=R1");
    expect(takeTicketFragment()).toBeNull();
  });

  it("drops the whole fragment when the ticket was all of it; nothing held after dropTicketFragment", () => {
    window.history.replaceState(null, "", "/pro/game?tour=s&match=m#ticket=x");
    expect(takeTicketFragment()).toBe("x");
    expect(window.location.href).toBe("http://localhost/pro/game?tour=s&match=m");
    dropTicketFragment();
    expect(takeTicketFragment()).toBeNull();
  });

  it("no fragment ticket → null", () => {
    window.history.replaceState(null, "", "/pro/game?tour=s&match=m#ticket=");
    expect(takeTicketFragment()).toBeNull();
  });

  it("assignTicketHref reloads when only the fragment differs (a hash change would not load the page)", () => {
    const assign = jest.fn();
    const reload = jest.fn();
    const real = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { href: "http://localhost/pro/game?tour=s&match=m", pathname: "/pro/game", search: "?tour=s&match=m", assign, reload },
    });
    try {
      assignTicketHref("/pro/game?tour=s&match=m#ticket=t");
      expect(assign).toHaveBeenCalledWith("/pro/game?tour=s&match=m#ticket=t");
      expect(reload).toHaveBeenCalledTimes(1);
      assignTicketHref("/pro/game?tour=s&match=m&room=R#ticket=t");
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: real });
    }
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

describe("the tournament-room note expires (room codes get reused)", () => {
  afterEach(() => window.localStorage.clear());

  it("lasts 24h, then is gone", () => {
    const t0 = Date.parse("2026-10-05T12:00:00Z");
    rememberTournamentRoom("ROOM2", { slug: "s", matchId: "m" }, t0);
    expect(tournamentRoomOf("ROOM2", t0 + TOURNAMENT_ROOM_MAX_AGE_MS - 1)).toEqual({ slug: "s", matchId: "m" });
    expect(tournamentRoomOf("ROOM2", t0 + TOURNAMENT_ROOM_MAX_AGE_MS + 1)).toBeNull();
    // …and the expired note is removed, not just ignored
    expect(window.localStorage.getItem("unbrewed-pro-tournament-room-ROOM2")).toBeNull();
  });

  it("a note with no timestamp (written before expiry existed) counts as expired", () => {
    window.localStorage.setItem("unbrewed-pro-tournament-room-OLD", JSON.stringify({ slug: "s", matchId: "m" }));
    expect(tournamentRoomOf("OLD")).toBeNull();
  });

  it("can be forgotten", () => {
    rememberTournamentRoom("ROOM3", { slug: "s", matchId: "m" });
    forgetTournamentRoom("ROOM3");
    expect(tournamentRoomOf("ROOM3")).toBeNull();
  });
});
