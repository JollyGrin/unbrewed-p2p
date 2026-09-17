import {
  buildFinishedGameSetup,
  FinishedGameSetup,
  parseRematchQuery,
  rematchCreateRoomArgs,
  rematchQuery,
} from "./rematch";

const duelSetup = (over: Partial<FinishedGameSetup> = {}): FinishedGameSetup => ({
  formatId: "duel",
  mapId: "mended-drum",
  turnTimerSeconds: 0,
  mulliganWasOn: true,
  yourHeroId: "GINGERBREAD",
  otherSeats: [{ player: "p2", heroId: "COUNT", bot: null }],
  ...over,
});

describe("buildFinishedGameSetup", () => {
  it("splits the roster into 'your seat' and everyone else", () => {
    const setup = buildFinishedGameSetup({
      roster: [
        { player: "p1", heroId: "GINGERBREAD", bot: null },
        { player: "p2", heroId: "COUNT", bot: null },
      ],
      you: "p1",
      formatId: "duel",
      turnTimerSeconds: undefined,
      mulliganWasOn: true,
      mapId: "mended-drum",
    });
    expect(setup?.yourHeroId).toBe("GINGERBREAD");
    expect(setup?.otherSeats).toEqual([{ player: "p2", heroId: "COUNT", bot: null }]);
    expect(setup?.turnTimerSeconds).toBe(0); // undefined → untimed
  });

  it("returns null when the presser's own seat is missing from the roster", () => {
    const setup = buildFinishedGameSetup({
      roster: [{ player: "p2", heroId: "COUNT", bot: null }],
      you: "p1",
      formatId: "duel",
      turnTimerSeconds: 60,
      mulliganWasOn: true,
      mapId: null,
    });
    expect(setup).toBeNull();
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

describe("parseRematchQuery — decoding", () => {
  it("round-trips a plain duel rematch link", () => {
    const q = rematchQuery(duelSetup());
    expect(parseRematchQuery(q)).toEqual({
      heroId: "GINGERBREAD",
      formatId: "duel",
      mapId: "mended-drum",
      turnTimerSeconds: 0,
      mulligan: true,
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
