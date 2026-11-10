import type { LobbyListing } from "./protocol";
import type { PresenceEntry } from "./lobbyProtocol";
import {
  activeBonus,
  avatarInitial,
  effectiveLobbies,
  elapsedLabel,
  foundOpponent,
  heroPips,
  lookingCount,
  multiplierLabel,
  presencePillModel,
  presenceStateLabel,
  presentCount,
  hereLabel,
  lookingLabel,
  quickMatchSubline,
  ribbonItems,
  searchProgressLine,
  waitAgeLabel,
} from "./quickPlayLobby";

const lobby = (roomId: string, ageMs: number, extra: Partial<LobbyListing> = {}): LobbyListing => ({
  roomId,
  heroId: "king-kong",
  heroName: "King Kong",
  ageMs,
  turnTimerSeconds: 60, // a Quick Play room (QUICK_PLAY_TIMER_SECONDS)
  ...extra,
});
const player = (id: string, extra: Partial<PresenceEntry> = {}): PresenceEntry => ({
  id,
  state: "picking",
  sinceMs: 30_000,
  ...extra,
});

const NOW = Date.parse("2026-11-08T12:00:00Z");

describe("activeBonus", () => {
  it("is an open-ended promotion when there is no endsAt", () => {
    const b = { multiplier: 2 };
    expect(activeBonus(b, NOW)).toBe(b);
  });
  it("is the bonus while it runs", () => {
    const b = { multiplier: 2, endsAt: "2026-11-09T00:00:00Z" };
    expect(activeBonus(b, NOW)).toBe(b);
  });
  it("is null when absent, expired, unparseable or not above 1", () => {
    expect(activeBonus(undefined, NOW)).toBeNull();
    expect(activeBonus({ multiplier: 2, endsAt: "2026-11-08T11:00:00Z" }, NOW)).toBeNull();
    expect(activeBonus({ multiplier: 2, endsAt: "soon" }, NOW)).toBeNull();
    expect(activeBonus({ multiplier: 1, endsAt: "2026-11-09T00:00:00Z" }, NOW)).toBeNull();
  });
});

describe("labels", () => {
  it("prints multipliers", () => {
    expect(multiplierLabel(2)).toBe("2×");
    expect(multiplierLabel(1.5)).toBe("1.5×");
  });
  it("formats waits and elapsed time", () => {
    expect(waitAgeLabel(102_000)).toBe("1m 42s");
    expect(waitAgeLabel(8_000)).toBe("0m 08s");
    expect(elapsedLabel(12_400)).toBe("0:12");
    expect(elapsedLabel(185_000)).toBe("3:05");
  });
  it("describes on-page players", () => {
    expect(presenceStateLabel("picking", 0)).toBe("picking a fighter…");
    expect(presenceStateLabel("idle", 240_000)).toBe("idle · 4 min");
    expect(presenceStateLabel("searching", 0)).toBe("searching…");
  });
  it("initials an avatar, with ? for an anonymous one", () => {
    expect(avatarInitial("moritz")).toBe("M");
    expect(avatarInitial("  _kay")).toBe("K");
    expect(avatarInitial(null)).toBe("?");
  });
  it("labels Quick Match with the live count", () => {
    expect(quickMatchSubline(3)).toBe("3 waiting right now");
    expect(quickMatchSubline(0)).toMatch(/no one waiting/);
  });
});

describe("ribbonItems", () => {
  it("orders open lobbies oldest-first, then players, then the tail; drops our room and our presence", () => {
    const items = ribbonItems({
      lobbies: [lobby("young", 5_000), lobby("MINE", 90_000), lobby("old", 60_000)],
      players: [player("me"), player("sam", { displayName: "Sam_B" })],
      you: "me",
      ownRoomId: "MINE",
      tablesInPlay: 2,
    });
    expect(items.map((i) => i.key)).toEqual(["lobby-old", "lobby-young", "player-sam", "tail"]);
  });

  it("renders a bare listing (today's engine) as Anonymous with no timer", () => {
    const [chip] = ribbonItems({ lobbies: [lobby("a", 31_000, { turnTimerSeconds: undefined })] });
    expect(chip).toMatchObject({ kind: "lobby", name: "Anonymous", heroName: "King Kong", age: "0m 31s", timer: null, badge: null });
    if (chip.kind === "lobby") expect(chip.avatar.initial).toBe("?");
  });

  it("uses the enrichments when present", () => {
    const [chip] = ribbonItems({
      lobbies: [lobby("a", 102_000, { turnTimerSeconds: 45, host: { displayName: "Kay", badges: ["regular"], badge: "old" } })],
    });
    expect(chip).toMatchObject({ name: "Kay", age: "1m 42s", timer: "⏱ 45s", badge: "regular" });
  });

  it("leaves a Quick Match searcher to its lobby chip (no second player chip)", () => {
    const items = ribbonItems({
      lobbies: [lobby("theirs", 10_000)],
      players: [player("sam", { state: "searching" }), player("kay")],
    });
    expect(items.map((i) => i.key)).toEqual(["lobby-theirs", "player-kay"]);
  });

  it("omits the tail with no tables in play, and players with no presence", () => {
    expect(ribbonItems({ lobbies: [], tablesInPlay: 0 })).toEqual([]);
  });

  it("marks a paired player 'matched' (#1556), still a chip", () => {
    const [chip] = ribbonItems({ lobbies: [], players: [player("sam", { paired: true })] });
    expect(chip).toMatchObject({ kind: "player", id: "sam", paired: true, stateLine: "matched" });
    const [plain] = ribbonItems({ lobbies: [], players: [player("kay")] });
    expect(plain).toMatchObject({ paired: false });
  });
});

describe("presentCount", () => {
  it("counts a searcher once — the server has it as a watcher AND a lobby", () => {
    expect(
      presentCount({ here: 4, players: [player("me", { state: "searching" }), player("kay")], lobbies: [lobby("MINE", 1), lobby("x", 2)] }),
    ).toBe(3);
  });
  it("caps the correction at the listed lobbies (a searcher between rooms is listed nowhere)", () => {
    expect(presentCount({ here: 2, players: [player("a", { state: "searching" }), player("b", { state: "searching" })], lobbies: [] })).toBe(2);
  });
  it("keeps a paired searcher (a matched Go — private room, no listing)", () => {
    expect(
      presentCount({ here: 3, players: [player("a", { state: "searching", paired: true }), player("b")], lobbies: [lobby("x", 1)] }),
    ).toBe(3);
  });
  it("is the server number when nobody is searching", () => {
    expect(presentCount({ here: 5, players: [player("a"), player("b", { state: "idle" })], lobbies: [lobby("x", 1)] })).toBe(5);
  });
});

describe("pill labels tell you apart", () => {
  it("here includes you", () => {
    expect(hereLabel(1)).toBe("just you here");
    expect(hereLabel(3)).toBe("you + 2 here");
  });
  it("waiting never counts you, and says so when you're searching", () => {
    expect(lookingLabel(2, false)).toBe("2 waiting");
    expect(lookingLabel(0, true)).toBe("you're waiting");
    expect(lookingLabel(1, true)).toBe("you + 1 waiting");
  });
});

describe("presencePillModel", () => {
  it("is hidden while disconnected", () => {
    expect(presencePillModel({ connected: false, here: null, lobbies: [lobby("a", 1)] })).toBeNull();
  });
  it("reads 'N looking' alone without presence", () => {
    expect(presencePillModel({ connected: true, here: null, lobbies: [lobby("a", 1)] })).toMatchObject({ here: null, looking: 1 });
  });
  it("stacks avatars with a +N overflow", () => {
    const m = presencePillModel({
      connected: true,
      here: 9,
      lobbies: [lobby("a", 1), lobby("b", 2)],
      players: ["p1", "p2", "p3", "p4", "p5", "me"].map((id) => player(id)),
      you: "me",
    });
    expect(m).toMatchObject({ here: 9, looking: 2, overflow: 2 });
    expect(m?.avatars).toHaveLength(5);
  });
});

describe("lobby list helpers", () => {
  it("prefers the pushed snapshot list over the poll", () => {
    const pushed = [lobby("a", 1)];
    const polled = [lobby("b", 1)];
    expect(effectiveLobbies(pushed, polled)).toBe(pushed);
    expect(effectiveLobbies(undefined, polled)).toBe(polled);
    expect(effectiveLobbies(undefined, null)).toBeNull();
  });
  it("counts only other duel lobbies as looking", () => {
    expect(lookingCount([lobby("a", 1), lobby("b", 1, { formatId: "ffa-3" }), lobby("MINE", 1)], "MINE")).toBe(1);
  });
  it("pips each hero with its oldest host", () => {
    const pips = heroPips([
      lobby("young", 1_000, { host: { displayName: "Young" } }),
      lobby("old", 9_000, { host: { displayName: "Old" } }),
      lobby("other", 5_000, { heroId: "nancy-drew", heroName: "Nancy Drew" }),
    ]);
    expect(pips.get("king-kong")?.title).toBe("Old");
    expect(pips.get("nancy-drew")?.initial).toBe("?");
  });
});

describe("searchProgressLine", () => {
  const lobbies = [lobby("k", 9_000, { host: { displayName: "Kay" } }), lobby("m", 5_000, { host: { displayName: "Moritz" } })];
  it("names who it is trying, and who just filled", () => {
    expect(searchProgressLine({ candidates: ["k", "m"], index: 0, waiting: false, lobbies })).toBe(
      "Trying Kay's table… otherwise your table goes public and the next searcher lands here.",
    );
    expect(searchProgressLine({ candidates: ["k", "m"], index: 1, waiting: false, lobbies })).toMatch(
      /^Kay's table filled a second ago\. Trying Moritz's table…/,
    );
  });
  it("stops saying 'trying' once a join lands in a table that is still waiting", () => {
    expect(searchProgressLine({ candidates: ["k"], index: 0, waiting: false, seated: true, lobbies })).toBe(
      "Seated at Kay's table — the game starts the moment it fills.",
    );
  });
  it("reports our own public table once the list is spent", () => {
    expect(searchProgressLine({ candidates: [], index: 0, waiting: true, lobbies: [], ownRoomId: null })).toBe("Opening your table…");
    expect(searchProgressLine({ candidates: [], index: 0, waiting: true, lobbies: [lobby("x", 1)], ownRoomId: "MINE" })).toMatch(
      /Your table is public.*1 other is waiting too\./,
    );
  });
});

describe("foundOpponent", () => {
  it("is the first other human seat", () => {
    const seats = [
      { player: "p1", heroId: "a", connected: true, bot: null },
      { player: "p2", heroId: "b", connected: true, bot: null, displayName: "Moritz" },
    ] as const;
    expect(foundOpponent([...seats], "p1")?.displayName).toBe("Moritz");
    expect(foundOpponent([seats[0]], "p1")).toBeNull();
    expect(foundOpponent(undefined, "p1")).toBeNull();
  });
});
