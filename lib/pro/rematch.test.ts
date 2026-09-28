import {
  botsFromCreateRoom,
  buildFinishedGameSetup,
  FinishedGameSetup,
  parseRematchQuery,
  REMATCH_QUERY_KEYS,
  rematchCreateRoomArgs,
  rematchQuery,
  withoutRematchQuery,
} from "./rematch";

const duelSetup = (over: Partial<FinishedGameSetup> = {}): FinishedGameSetup => ({
  formatId: "duel",
  mapId: "mended-drum",
  turnTimerSeconds: 0,
  mulliganWasOn: true,
  itemsWereOff: false,
  yourHeroId: "GINGERBREAD",
  otherSeats: [{ player: "p2", heroId: "COUNT", bot: null }],
  ...over,
});

const buildInput = (over: Partial<Parameters<typeof buildFinishedGameSetup>[0]> = {}) => ({
  players: { p1: { heroId: "GINGERBREAD" }, p2: { heroId: "COUNT" } },
  bots: {},
  you: "p1" as const,
  formatId: "duel",
  turnTimerSeconds: undefined,
  mulliganWasOn: true,
  itemsWereOff: false,
  mapId: "mended-drum",
  ...over,
});

describe("buildFinishedGameSetup", () => {
  it("splits the bundle's seats into 'your seat' and everyone else", () => {
    const setup = buildFinishedGameSetup(buildInput());
    expect(setup?.yourHeroId).toBe("GINGERBREAD");
    expect(setup?.otherSeats).toEqual([{ player: "p2", heroId: "COUNT", bot: null }]);
    expect(setup?.turnTimerSeconds).toBe(0); // undefined → untimed
  });

  it("returns null when the presser's own seat is missing from the bundle", () => {
    expect(buildFinishedGameSetup(buildInput({ players: { p2: { heroId: "COUNT" } } }))).toBeNull();
  });

  // #876: a bot room never receives ROOM_STATUS, so the roster used to be the
  // gate that hid the Rematch button vs bot. The bundle + recorded bot seats is
  // enough on its own.
  it("vs bot: marks the recorded bot seat, with no ROOM_STATUS roster at all", () => {
    const setup = buildFinishedGameSetup(buildInput({ bots: { p2: "medium" } }));
    expect(setup?.otherSeats).toEqual([{ player: "p2", heroId: "COUNT", bot: "medium" }]);
    expect(rematchQuery(setup!)).toMatchObject({ bots: "p2:medium:COUNT" });
    expect(rematchQuery(setup!).joinHero).toBeUndefined();
  });

  it("works from any seat, ordering the others by seat id", () => {
    const setup = buildFinishedGameSetup(
      buildInput({
        you: "p2",
        players: { p3: { heroId: "C" }, p1: { heroId: "A" }, p2: { heroId: "B" } },
        bots: { p3: "easy" },
        formatId: "ffa3",
      }),
    );
    expect(setup?.yourHeroId).toBe("B");
    expect(setup?.otherSeats).toEqual([
      { player: "p1", heroId: "A", bot: null },
      { player: "p3", heroId: "C", bot: "easy" },
    ]);
  });

  it("carries the items opt-out through", () => {
    expect(buildFinishedGameSetup(buildInput({ itemsWereOff: true }))?.itemsWereOff).toBe(true);
    expect(buildFinishedGameSetup(buildInput())?.itemsWereOff).toBe(false);
  });
});

describe("botsFromCreateRoom", () => {
  it("duel's single bot always sits in p2", () => {
    expect(botsFromCreateRoom({ difficulty: "hard" }, undefined)).toEqual({ p2: "hard" });
  });
  it("botSeats name their own seats", () => {
    expect(
      botsFromCreateRoom(undefined, [
        { player: "p2", difficulty: "easy" },
        { player: "p4", difficulty: "expert", heroId: "X" },
      ]),
    ).toEqual({ p2: "easy", p4: "expert" });
  });
  it("a human-only room records no bots", () => {
    expect(botsFromCreateRoom(undefined, [])).toEqual({});
  });
});

describe("rematchQuery — encoding", () => {
  it("produces the shortest link for a plain untimed duel with mulligan on", () => {
    expect(rematchQuery(duelSetup())).toEqual({
      rematch: "1",
      hero: "GINGERBREAD",
      map: "mended-drum",
      joinHero: "COUNT", // the one other human seat pre-fills
    });
  });

  it("omits format only for duel", () => {
    expect(rematchQuery(duelSetup()).format).toBeUndefined();
    expect(rematchQuery(duelSetup({ formatId: "team-2v2" })).format).toBe("team-2v2");
  });

  it("omits the map when there is no catalog id (a pasted custom board)", () => {
    expect(rematchQuery(duelSetup({ mapId: null })).map).toBeUndefined();
  });

  it("carries the timer only when it is on", () => {
    expect(rematchQuery(duelSetup()).timer).toBeUndefined();
    expect(rematchQuery(duelSetup({ turnTimerSeconds: 45 })).timer).toBe("45");
  });

  it("marks mulligan only as an opt-OUT, matching CREATE_ROOM's own idiom", () => {
    expect(rematchQuery(duelSetup({ mulliganWasOn: true })).mulligan).toBeUndefined();
    expect(rematchQuery(duelSetup({ mulliganWasOn: false })).mulligan).toBe("0");
  });

  it("encodes a bot seat as player:difficulty:hero", () => {
    const q = rematchQuery(
      duelSetup({ otherSeats: [{ player: "p2", heroId: "COUNT", bot: "hard" }] }),
    );
    expect(q.bots).toBe("p2:hard:COUNT");
    expect(q.joinHero).toBeUndefined(); // no human opponent to pre-fill
  });

  it("percent-encodes a hero id that collides with the bots delimiters", () => {
    const q = rematchQuery(
      duelSetup({ otherSeats: [{ player: "p2", heroId: "A,WEIRD:ID", bot: "easy" }] }),
    );
    expect(q.bots).toBe(`p2:easy:${encodeURIComponent("A,WEIRD:ID")}`);
  });

  it("joins several bot seats with commas", () => {
    const q = rematchQuery(
      duelSetup({
        formatId: "team-2v2",
        otherSeats: [
          { player: "p2", heroId: "COUNT", bot: "easy" },
          { player: "p3", heroId: "MUMMY", bot: null },
          { player: "p4", heroId: "GHOST", bot: "medium" },
        ],
      }),
    );
    expect(q.bots).toBe("p2:easy:COUNT,p4:medium:GHOST");
    // exactly one human opponent (p3) still pre-fills, bots aside
    expect(q.joinHero).toBe("MUMMY");
  });

  it("omits joinHero when there is more than one other human seat", () => {
    const q = rematchQuery(
      duelSetup({
        formatId: "team-2v2",
        otherSeats: [
          { player: "p2", heroId: "COUNT", bot: null },
          { player: "p3", heroId: "MUMMY", bot: null },
        ],
      }),
    );
    expect(q.joinHero).toBeUndefined();
  });

  it("omits joinHero when there are no other seats at all", () => {
    expect(rematchQuery(duelSetup({ otherSeats: [] })).joinHero).toBeUndefined();
  });
});

describe("items opt-out (#876)", () => {
  it("encodes an items-off game as items=0 and omits it otherwise", () => {
    expect(rematchQuery(duelSetup({ itemsWereOff: true })).items).toBe("0");
    expect(rematchQuery(duelSetup()).items).toBeUndefined();
  });
  it("round-trips to CREATE_ROOM's itemsEnabled:false, and omits it when on", () => {
    const off = parseRematchQuery(rematchQuery(duelSetup({ itemsWereOff: true })))!;
    expect(off.itemsEnabled).toBe(false);
    expect(rematchCreateRoomArgs(off).itemsEnabled).toBe(false);
    const on = parseRematchQuery(rematchQuery(duelSetup()))!;
    expect(on.itemsEnabled).toBe(true);
    expect(rematchCreateRoomArgs(on).itemsEnabled).toBeUndefined();
  });
});

describe("refresh safety (#876)", () => {
  it("a URL that already names a room is never read as a rematch", () => {
    expect(parseRematchQuery({ rematch: "1", hero: "GINGERBREAD", room: "ABCD" })).toBeNull();
  });

  it("withoutRematchQuery drops every key rematchQuery can produce, keeping the rest", () => {
    const link = rematchQuery(
      duelSetup({
        formatId: "ffa3",
        turnTimerSeconds: 60,
        mulliganWasOn: false,
        itemsWereOff: true,
        otherSeats: [
          { player: "p2", heroId: "COUNT", bot: null },
          { player: "p3", heroId: "X", bot: "easy" },
        ],
      }),
    );
    // every key this link carries is one the stripper knows about
    for (const key of Object.keys(link)) expect(REMATCH_QUERY_KEYS).toContain(key);
    expect(withoutRematchQuery({ ...link, debug: "", room: "ABCD" })).toEqual({ debug: "", room: "ABCD" });
  });

  it("leaves an ordinary (non-rematch) query alone, incl. an invite's ?hero=", () => {
    const q = { room: "ABCD", hero: "COUNT" };
    expect(withoutRematchQuery(q)).toEqual(q);
  });
});

describe("parseRematchQuery — decoding", () => {
  it("round-trips a plain duel rematch link", () => {
    const q = rematchQuery(duelSetup());
    expect(parseRematchQuery(q)).toEqual({
      heroId: "GINGERBREAD",
      formatId: "duel",
      mapId: "mended-drum",
      turnTimerSeconds: 0,
      mulligan: true,
      itemsEnabled: true,
      botSeats: [],
      joinHeroId: "COUNT",
    });
  });

  it("round-trips timer, mulligan-off, format, and a bot seat", () => {
    const q = rematchQuery(
      duelSetup({
        formatId: "team-2v2",
        turnTimerSeconds: 45,
        mulliganWasOn: false,
        otherSeats: [{ player: "p2", heroId: "COUNT", bot: "hard" }],
      }),
    );
    expect(parseRematchQuery(q)).toEqual({
      heroId: "GINGERBREAD",
      formatId: "team-2v2",
      mapId: "mended-drum",
      turnTimerSeconds: 45,
      mulligan: false,
      itemsEnabled: true,
      botSeats: [{ player: "p2", difficulty: "hard", heroId: "COUNT" }],
      joinHeroId: null,
    });
  });

  it("decodes a percent-encoded hero id inside bots", () => {
    const q = rematchQuery(
      duelSetup({ otherSeats: [{ player: "p2", heroId: "A,WEIRD:ID", bot: "easy" }] }),
    );
    expect(parseRematchQuery(q)?.botSeats).toEqual([
      { player: "p2", difficulty: "easy", heroId: "A,WEIRD:ID" },
    ]);
  });

  it("returns null without rematch=1", () => {
    expect(parseRematchQuery({ hero: "GINGERBREAD" })).toBeNull();
  });

  it("returns null without a hero, even with rematch=1", () => {
    expect(parseRematchQuery({ rematch: "1" })).toBeNull();
  });

  it("defaults format to duel and timer to untimed when absent", () => {
    const parsed = parseRematchQuery({ rematch: "1", hero: "GINGERBREAD" });
    expect(parsed?.formatId).toBe("duel");
    expect(parsed?.turnTimerSeconds).toBe(0);
    expect(parsed?.mulligan).toBe(true);
    expect(parsed?.botSeats).toEqual([]);
  });

  it("ignores a garbage timer value rather than producing NaN/negative", () => {
    const parsed = parseRematchQuery({ rematch: "1", hero: "GINGERBREAD", timer: "not-a-number" });
    expect(parsed?.turnTimerSeconds).toBe(0);
  });
});

describe("rematchCreateRoomArgs", () => {
  it("plain duel: only heroId, everything else omitted", () => {
    const parsed = parseRematchQuery(rematchQuery(duelSetup()))!;
    expect(rematchCreateRoomArgs(parsed)).toEqual({
      heroId: "GINGERBREAD",
      bot: undefined,
      botSeats: [],
      formatId: undefined,
      turnTimerSeconds: undefined,
      mulligan: undefined,
    });
  });

  it("a duel bot rematch puts the seat on CREATE_ROOM.bot, not botSeats", () => {
    const parsed = parseRematchQuery(
      rematchQuery(duelSetup({ otherSeats: [{ player: "p2", heroId: "COUNT", bot: "hard" }] })),
    )!;
    const args = rematchCreateRoomArgs(parsed);
    expect(args.bot).toEqual({ difficulty: "hard", heroId: "COUNT" });
    expect(args.botSeats).toEqual([]);
  });

  it("a non-duel bot rematch puts every AI seat on botSeats, not bot", () => {
    const parsed = parseRematchQuery(
      rematchQuery(
        duelSetup({
          formatId: "team-2v2",
          otherSeats: [
            { player: "p2", heroId: "COUNT", bot: "hard" },
            { player: "p4", heroId: "GHOST", bot: "medium" },
          ],
        }),
      ),
    )!;
    const args = rematchCreateRoomArgs(parsed);
    expect(args.bot).toBeUndefined();
    expect(args.botSeats).toEqual([
      { player: "p2", difficulty: "hard", heroId: "COUNT" },
      { player: "p4", difficulty: "medium", heroId: "GHOST" },
    ]);
    expect(args.formatId).toBe("team-2v2");
  });

  it("carries a timer and a mulligan opt-out through to the wire shape", () => {
    const parsed = parseRematchQuery(
      rematchQuery(duelSetup({ turnTimerSeconds: 30, mulliganWasOn: false })),
    )!;
    const args = rematchCreateRoomArgs(parsed);
    expect(args.turnTimerSeconds).toBe(30);
    expect(args.mulligan).toBe(false);
  });
});
