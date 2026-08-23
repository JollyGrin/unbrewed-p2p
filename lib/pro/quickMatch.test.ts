import type { LobbyListing } from "./protocol";
import {
  advanceQuickMatch,
  botFallbackHref,
  isQuickMatchCandidate,
  isQuickMatchRetryable,
  isQuickMatchWaiting,
  lobbyHostName,
  lobbyTimerLabel,
  openLobbyCount,
  quickMatchCandidates,
  quickMatchStep,
  startQuickMatch,
  waitingCountLabel,
} from "./quickMatch";

/** A listing exactly as today's engine sends it — none of the #391 enrichments. */
const bare = (roomId: string, ageMs: number): LobbyListing => ({
  roomId,
  heroId: "king-kong",
  heroName: "King Kong",
  ageMs,
});

describe("quickMatchCandidates", () => {
  it("orders longest-waiting first regardless of the server's order", () => {
    const lobbies = [bare("aaa", 5_000), bare("bbb", 90_000), bare("ccc", 30_000)];
    expect(quickMatchCandidates(lobbies)).toEqual(["bbb", "ccc", "aaa"]);
  });

  it("treats a listing with no formatId as a duel (today's engine)", () => {
    expect(isQuickMatchCandidate(bare("aaa", 1))).toBe(true);
    expect(quickMatchCandidates([bare("aaa", 1)])).toEqual(["aaa"]);
  });

  it("skips non-duel formats — v1 matches duels only", () => {
    const lobbies = [
      { ...bare("duel", 10), formatId: "duel" },
      { ...bare("ffa", 99_000), formatId: "ffa-3" },
      { ...bare("teams", 99_000), formatId: "team-2v2" },
    ];
    expect(quickMatchCandidates(lobbies)).toEqual(["duel"]);
  });

  it("excludes rooms we ask it to (our own, once we're listed)", () => {
    const lobbies = [bare("mine", 90_000), bare("theirs", 10_000)];
    expect(quickMatchCandidates(lobbies, ["mine"])).toEqual(["theirs"]);
  });

  it("survives a null/absent lobby list", () => {
    expect(quickMatchCandidates(null)).toEqual([]);
    expect(quickMatchCandidates(undefined)).toEqual([]);
  });

  it("dedupes a room the server listed twice", () => {
    expect(quickMatchCandidates([bare("aaa", 10), bare("aaa", 10)])).toEqual(["aaa"]);
  });
});

describe("the join → next-lobby → create walk", () => {
  it("joins the longest-waiting lobby first", () => {
    const search = startQuickMatch("king-kong", [bare("young", 1_000), bare("old", 60_000)]);
    expect(quickMatchStep(search)).toEqual({ type: "join", roomId: "old" });
    expect(isQuickMatchWaiting(search)).toBe(false);
  });

  it("falls through to the next lobby when one races away, then creates", () => {
    let search = startQuickMatch("king-kong", [bare("a", 30_000), bare("b", 20_000)]);
    expect(quickMatchStep(search)).toEqual({ type: "join", roomId: "a" });

    search = advanceQuickMatch(search); // "a" answered ROOM_FULL
    expect(quickMatchStep(search)).toEqual({ type: "join", roomId: "b" });

    search = advanceQuickMatch(search); // "b" answered ROOM_NOT_FOUND
    expect(quickMatchStep(search)).toEqual({ type: "create" });
    expect(isQuickMatchWaiting(search)).toBe(true);
    expect(search.heroId).toBe("king-kong"); // the hero survives the whole walk
  });

  it("creates straight away when nobody is waiting", () => {
    const search = startQuickMatch("king-kong", []);
    expect(quickMatchStep(search)).toEqual({ type: "create" });
    expect(isQuickMatchWaiting(search)).toBe(true);
  });

  it("keeps creating past the end of the list (an extra advance is harmless)", () => {
    const search = advanceQuickMatch(advanceQuickMatch(startQuickMatch("kk", [bare("a", 1)])));
    expect(quickMatchStep(search)).toEqual({ type: "create" });
  });
});

describe("isQuickMatchRetryable", () => {
  it("treats a filled or vanished lobby as an ordinary race", () => {
    expect(isQuickMatchRetryable("ROOM_FULL")).toBe(true);
    expect(isQuickMatchRetryable("ROOM_NOT_FOUND")).toBe(true);
  });

  it("stops the search on anything else", () => {
    // These are real errors the player must see — never silently retried.
    expect(isQuickMatchRetryable("UNKNOWN_HERO")).toBe(false);
    expect(isQuickMatchRetryable("ROOM_LIMIT")).toBe(false);
    expect(isQuickMatchRetryable("BAD_MESSAGE")).toBe(false);
    expect(isQuickMatchRetryable(null)).toBe(false);
    expect(isQuickMatchRetryable(undefined)).toBe(false);
  });
});

describe("openLobbyCount / waitingCountLabel", () => {
  it("never counts our own room", () => {
    expect(openLobbyCount([bare("mine", 10), bare("theirs", 20)], "mine")).toBe(1);
  });

  it("counts duels only and tolerates an empty list", () => {
    expect(openLobbyCount([{ ...bare("ffa", 10), formatId: "ffa-3" }], null)).toBe(0);
    expect(openLobbyCount(null, "mine")).toBe(0);
  });

  it("reads as reassurance, not an error, when nobody else is searching", () => {
    expect(waitingCountLabel(0)).toMatch(/first in line/);
    expect(waitingCountLabel(1)).toBe("1 other player is waiting for a match");
    expect(waitingCountLabel(4)).toBe("4 other players are waiting for a match");
  });
});

describe("botFallbackHref", () => {
  it("re-enters the existing ?vs=ai-* create flow with the hero kept", () => {
    expect(botFallbackHref("king-kong", "medium")).toBe("/pro/game?vs=ai-medium&hero=king-kong");
    expect(botFallbackHref("king-kong", "easy")).toBe("/pro/game?vs=ai-easy&hero=king-kong");
  });

  it("keeps a debug session alive and never carries ?quick along", () => {
    const href = botFallbackHref("king-kong", "hard", { debug: true });
    expect(href).toBe("/pro/game?vs=ai-hard&hero=king-kong&debug=1");
    expect(href).not.toMatch(/quick/);
  });

  it("escapes the hero id", () => {
    expect(botFallbackHref("a b&c", "medium")).toContain("hero=a%20b%26c");
  });
});

describe("enriched-listing helpers (all fields optional)", () => {
  it("returns nothing for a listing from today's engine", () => {
    const l = bare("aaa", 10);
    expect(lobbyHostName(l)).toBeNull();
    expect(lobbyTimerLabel(l)).toBeNull();
  });

  it("renders host name and timer when the server sends them", () => {
    const l: LobbyListing = { ...bare("aaa", 10), host: { displayName: "Dean" }, turnTimerSeconds: 60 };
    expect(lobbyHostName(l)).toBe("Dean");
    expect(lobbyTimerLabel(l)).toBe("⏱ 60s");
  });

  it("ignores a blank name and an off (0) timer", () => {
    const l: LobbyListing = { ...bare("aaa", 10), host: { displayName: "   " }, turnTimerSeconds: 0 };
    expect(lobbyHostName(l)).toBeNull();
    expect(lobbyTimerLabel(l)).toBeNull();
  });
});
