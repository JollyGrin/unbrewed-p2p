/** The match page's data-carrying state, its helpers, and what the Play area shows for each state. */
import { FIXTURE_MATCH_YOU, FIXTURE_NOW, fixtureMatch } from "./fixtures";
import {
  isCancelled,
  isDecided,
  isLateOpen,
  isOpen,
  isPlayable,
  matchPageState,
  playButtonModel,
  type MatchPageState,
} from "./matchPage";
import type { LiveRoom } from "./types";

const NOW = Date.parse(FIXTURE_NOW);
const ROOM: LiveRoom = { gameIndex: 0, roomId: "r1", readyEntryId: "e2", expiresAt: "2026-10-05T12:10:00Z" };
const facts = { room: null, eventCancelled: false };
const S: Record<string, MatchPageState> = {
  waiting: { ...facts, kind: "waiting" },
  opponent_ready: { ...facts, room: ROOM, kind: "opponent_ready" },
  you_ready: { ...facts, room: ROOM, kind: "you_ready", holdingPastDeadline: false },
  in_play: { ...facts, kind: "in_play", startedAt: null },
  rule1: { ...facts, kind: "deadline_passed", outcome: { kind: "ready_check", winner: "e2" } },
  late: { ...facts, kind: "deadline_passed", outcome: { kind: "organizer" } },
  deadline_hold: { ...facts, kind: "deadline_hold", holder: "e3", until: "2026-10-05T12:10:00Z" },
  decided: { ...facts, kind: "decided" },
  decided_by_rule: { ...facts, kind: "decided_by_rule", rule: "deadline_higher_seed" },
  cancelled: { ...facts, eventCancelled: true, kind: "cancelled" },
};

describe("state helpers", () => {
  it.each([
    // name             decided open   cancelled late   playable
    ["waiting", false, true, false, false, true],
    ["opponent_ready", false, true, false, false, true],
    ["you_ready", false, true, false, false, true],
    ["in_play", false, true, false, false, false],
    ["rule1", false, true, false, false, false],
    ["late", false, true, false, true, true],
    ["deadline_hold", false, true, false, false, true],
    ["decided", true, false, false, false, false],
    ["decided_by_rule", true, false, false, false, false],
    ["cancelled", false, false, true, false, false],
  ] as const)("%s", (name, decided, open, cancelled, late, playable) => {
    const s = S[name];
    expect([isDecided(s), isOpen(s), isCancelled(s), isLateOpen(s), isPlayable(s)]).toEqual([decided, open, cancelled, late, playable]);
  });

  it("a decided match of a cancelled tournament keeps its result but reads cancelled around it", () => {
    const s: MatchPageState = { ...facts, eventCancelled: true, kind: "decided" };
    expect([isDecided(s), isCancelled(s)]).toEqual([true, true]);
  });
});

describe("matchPageState carries its data", () => {
  it("the in-play state carries the running game's start", () => {
    const f = fixtureMatch("in_play").detail;
    const s = matchPageState(f, FIXTURE_MATCH_YOU, NOW);
    expect(s.kind).toBe("in_play");
    expect(s.kind === "in_play" && s.startedAt).toBe(f.match.games.find((g) => g.startedAt && !g.finishedAt)!.startedAt);
  });

  it("the ready states carry the held room", () => {
    const f = fixtureMatch("you_ready").detail;
    const s = matchPageState(f, FIXTURE_MATCH_YOU, NOW);
    expect(s.kind).toBe("you_ready");
    expect(s.room).toEqual(f.liveRoom);
    expect(s.kind === "you_ready" && s.holdingPastDeadline).toBe(false);
  });

  it("past the deadline, a live pre-deadline hold carries its holder and when it runs out; the holder is still you_ready", () => {
    const base = fixtureMatch("opponent_ready").detail;
    const deadline = Date.parse(base.readyChecks[0].createdAt) + 5 * 60_000;
    const d = { ...base, match: { ...base.match, deadlineAt: new Date(deadline).toISOString() } };
    const after = deadline + 60_000;
    const holder = matchPageState(d, "u3", after);
    expect(holder.kind).toBe("you_ready");
    expect(holder.kind === "you_ready" && holder.holdingPastDeadline).toBe(true);
    const other = matchPageState(d, FIXTURE_MATCH_YOU, after);
    expect(other.kind).toBe("deadline_hold");
    if (other.kind !== "deadline_hold") return;
    expect(other.holder).toBe("e3");
    expect(other.until).toBe(d.liveRoom!.expiresAt);
    // Before the deadline the same hold is plain you_ready.
    const early = matchPageState(d, "u3", deadline - 60_000);
    expect(early.kind === "you_ready" && early.holdingPastDeadline).toBe(false);
  });

  it("a rule-decided match names its rule; deadline_passed names its outcome", () => {
    const f = fixtureMatch("decided_by_rule").detail;
    const s = matchPageState(f, null, NOW);
    expect(s.kind === "decided_by_rule" && s.rule).toBe(f.match.decidedBy);
    const late = matchPageState(fixtureMatch("deadline_passed").detail, null, NOW);
    expect(late.kind === "deadline_passed" && late.outcome).toEqual({ kind: "organizer" });
  });

  it("a decided match in a cancelled tournament is still decided, flagged eventCancelled", () => {
    const f = fixtureMatch("decided").detail;
    const s = matchPageState({ ...f, tournament: { ...f.tournament, status: "cancelled" } }, null, NOW);
    expect(s.kind).toBe("decided");
    expect(isCancelled(s)).toBe(true);
  });
});

describe("playButtonModel", () => {
  const ctx = { phase: "idle" as const, cooldown: null, backHref: null, seatClock: "11:48", canReplay: false, standings: false };
  type Viewer = { side: "a" | "b" | null; seated: boolean };
  const player: Viewer = { side: "a", seated: true };
  const spectator: Viewer = { side: null, seated: true };
  const sticky = (s: MatchPageState, v = player, c = {}) => playButtonModel(s, v, { ...ctx, ...c }).sticky;
  const panel = (s: MatchPageState, v = player, c = {}) => playButtonModel(s, v, { ...ctx, ...c }).panel;

  it.each([
    ["waiting", "ready", "I'm ready to play"],
    ["late", "ready", "I'm ready to play"],
    ["opponent_ready", "join", "Join now"],
    ["deadline_hold", "join", "Join now"],
    ["you_ready", "seated", "Take your seat here"],
  ] as const)("a seated player in %s gets the %s panel and a %s press", (name, look, label) => {
    expect(panel(S[name])).toMatchObject({ look, action: { kind: "press", label } });
  });

  it("the in-play panel offers the way back only with this browser's seat token", () => {
    expect(panel(S.in_play)).toMatchObject({ look: "running", action: null });
    expect(panel(S.in_play, player, { backHref: "/pro/game?room=r1" })).toMatchObject({ action: { kind: "back_to_game", label: "Back to game" } });
  });

  it("you_ready goes back to the room when the browser holds its seat", () => {
    expect(panel(S.you_ready, player, { backHref: "/pro/game?room=r1" })?.action).toEqual({ kind: "back_to_room", label: "Back to your room" });
    expect(sticky(S.you_ready, player, { backHref: "/pro/game?room=r1" })).toEqual({ kind: "back_to_room", label: "Back to room · 11:48 left" });
    expect(sticky(S.you_ready)).toEqual({ kind: "press", label: "Take your seat here · 11:48 left" });
  });

  it("late play says so; the deadline hold carries who holds it", () => {
    expect(panel(S.late)?.late).toBe(true);
    expect(panel(S.waiting)?.late).toBe(false);
    expect(panel(S.deadline_hold)?.hold).toEqual({ holder: "e3", until: "2026-10-05T12:10:00Z" });
    expect(panel(S.opponent_ready)?.hold).toBeNull();
  });

  it.each(["rule1", "decided", "decided_by_rule", "cancelled"] as const)("nothing to play in %s: no panel", (name) => {
    expect(panel(S[name])).toBeNull();
  });

  it("no panel for a spectator, or a player whose opponent isn't seated yet", () => {
    expect(panel(S.waiting, spectator)).toBeNull();
    expect(panel(S.waiting, { side: "a", seated: false })).toBeNull();
    expect(sticky(S.waiting, { side: "a", seated: false })).toBeNull();
  });

  it("the sticky Join shows the seat clock only when there is one", () => {
    expect(sticky(S.opponent_ready)).toEqual({ kind: "press", label: "Join now · 11:48 left" });
    expect(sticky(S.deadline_hold, player, { seatClock: null })).toEqual({ kind: "press", label: "Join now" });
  });

  it("a held seat shows its note on the phone, whatever the state", () => {
    expect(sticky(S.waiting, player, { phase: "seat_held" })).toEqual({ kind: "seat_held_note" });
    expect(sticky(S.waiting, spectator, { phase: "seat_held" })).toBeNull();
  });

  it("in play, a seat token alone brings the phone back to the game (lapsed session)", () => {
    expect(sticky(S.in_play, spectator, { backHref: "/pro/game?room=r1" })).toEqual({ kind: "back_to_game", label: "Back to game" });
    expect(sticky(S.in_play, spectator)).toBeNull();
  });

  it("closed states point the phone at the replay or the results", () => {
    expect(sticky(S.decided, spectator, { canReplay: true })).toEqual({ kind: "replay", label: "Watch the replay" });
    expect(sticky(S.decided, spectator)).toEqual({ kind: "results", label: "See the bracket" });
    expect(sticky(S.decided_by_rule, spectator, { canReplay: true })).toEqual({ kind: "results", label: "See the bracket" });
    expect(sticky(S.cancelled, spectator, { standings: true })).toEqual({ kind: "results", label: "See the standings" });
    expect(sticky(S.rule1, player)).toEqual({ kind: "results", label: "See the bracket" });
    expect(sticky(S.deadline_hold, spectator)).toEqual({ kind: "results", label: "See the bracket" });
    // Late play is still open: a spectator has nothing to press and nowhere new to go.
    expect(sticky(S.late, spectator)).toBeNull();
    expect(sticky(S.waiting, spectator)).toBeNull();
  });

  it("disabled: a cooldown first, then a press in flight", () => {
    const m = (c: object) => playButtonModel(S.waiting, player, { ...ctx, ...c });
    expect(m({}).disabled).toBeNull();
    expect(m({ phase: "busy" }).disabled).toBe("busy");
    expect(m({ phase: "opening" }).disabled).toBe("busy");
    expect(m({ phase: "busy", cooldown: "2026-10-05T12:30:00Z" }).disabled).toBe("cooldown");
  });

  it("notice: the cooldown wins over the play hook's phase", () => {
    const m = (c: object) => playButtonModel(S.waiting, player, { ...ctx, ...c });
    expect(m({}).notice).toBeNull();
    expect(m({ phase: "busy" }).notice).toBeNull();
    expect(m({ phase: "opening" }).notice).toBe("opening");
    expect(m({ phase: "seat_held" }).notice).toBe("seat_held");
    expect(m({ phase: "error" }).notice).toBe("error");
    expect(m({ phase: "error", cooldown: "2026-10-05T12:30:00Z" }).notice).toBe("cooldown");
  });
});
