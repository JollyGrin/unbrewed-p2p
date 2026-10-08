/** Round-4 review (p2p #1278): the pure parts — formatter, page model, error copy, organizer queue, /pro banner. */
import { rateLimitText, retryAfterSeconds, type AttentionItem } from "./api";
import { buildBracket, countsGame } from "./bracket";
import { fixtureMatch, fixtureMyTournaments, fixtureRunning8 } from "./fixtures";
import { reseatCooldownText } from "./copy";
import { gameRows, matchPageState } from "./matchPage";
import { nextMatchView, sizeOf } from "./nextMatch";
import { attentionRows, dueText, organizerErrorText, ticketsOutstandingText } from "./organizer";
import type { Game, MatchDetail } from "./types";
import { playErrorMessage } from "./usePlayMatch";
import { dayText, minSecSpoken, minSecText, spanText, timeText, whenText } from "./when";

const NOW = Date.parse("2026-10-05T12:00:00Z");
const MIN = 60_000;
const H = 60 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

describe("when (UX S2, P1, P2, B2)", () => {
  it("one locale-aware format: the date and the clock join into whenText", () => {
    const t = "2026-10-06T14:00:00Z";
    expect(whenText(t)).toBe(`${dayText(t)}, ${timeText(t)}`);
    expect(timeText(t)).toBe(new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    expect(whenText(null)).toBe("");
    expect(whenText("nope")).toBe("");
  });

  it("spans drop zero units and roll hours into days", () => {
    expect(spanText(25 * H)).toBe("1d 1h");
    expect(spanText(24 * H + 5 * MIN)).toBe("1d");
    expect(spanText(3 * H + 5 * MIN)).toBe("3h 5m");
    expect(spanText(12 * MIN + 30_000)).toBe("12m");
    expect(spanText(10_000)).toBe("1m");
    expect(spanText(0)).toBeNull();
  });

  it("seat-hold time in words, and spoken", () => {
    expect(minSecText(14 * MIN + 32_000)).toBe("14 min 32 s");
    expect(minSecText(11 * MIN)).toBe("11 min");
    expect(minSecText(32_000)).toBe("32 s");
    expect(minSecSpoken(MIN + 1000)).toBe("1 minute 1 second");
  });

  it("the organizer queue's countdown rolls into days (P2)", () => {
    expect(dueText(iso(NOW + 25 * H), NOW)).toBe("1d 1h left");
    expect(dueText(iso(NOW + 40 * MIN), NOW)).toBe("40m left");
  });
});

describe("matchPageState after the deadline (UX B1)", () => {
  it("a press after the deadline opens a hold the opponent can join", () => {
    const f = fixtureMatch("deadline_passed");
    const room = { gameIndex: 0, roomId: "LATE", readyEntryId: "e2", expiresAt: iso(NOW + 10 * MIN) };
    const d: MatchDetail = {
      ...f.detail,
      liveRoom: room,
      readyChecks: [{ id: "rc", gameIndex: 0, entryId: "e2", createdAt: iso(NOW - 5 * MIN), expiresAt: room.expiresAt, roomId: "LATE", outcome: "pending", role: "create" }],
    };
    expect(matchPageState(d, "u3", NOW).kind).toBe("opponent_ready");
    expect(matchPageState(d, "u2", NOW).kind).toBe("you_ready");
    expect(matchPageState(f.detail, "u2", NOW).kind).toBe("deadline_passed");
  });
});

describe("gameRows / countsGame (interactions S1, journeys B2 + S8)", () => {
  const base = fixtureMatch("waiting").detail;
  const game = (extra: Partial<Game>): Game => ({
    gameIndex: 0,
    roomId: "R",
    gameId: null,
    startedAt: iso(NOW - H),
    finishedAt: iso(NOW - 30 * MIN),
    winnerEntry: null,
    source: "tagged",
    verified: false,
    assignment: base.match.matchup,
    ...extra,
  });

  it("finished with no winner is no_result, never unverified, open or decided", () => {
    expect(gameRows({ ...base, match: { ...base.match, games: [game({})] } })[0].state).toBe("no_result");
    const decided = { ...base.match, status: "decided" as const, winner: base.match.slotA, decidedBy: "organizer" as const, games: [game({})] };
    expect(gameRows({ ...base, match: decided })[0].state).toBe("no_result");
    // Truly late (api flag) stays "after decision".
    expect(gameRows({ ...base, match: { ...decided, games: [game({ recordedAfterDecision: true })] } })[0].state).toBe("after_decision");
  });

  it("a no-winner game is not a game played", () => {
    expect(countsGame(game({}))).toBe(false);
    expect(countsGame(game({ winnerEntry: "e2" }))).toBe(true);
    const r = fixtureRunning8();
    const m = r.matches.find((x) => x.status === "open")!;
    m.games = [game({})];
    const before = buildBracket(r.tournament, r.entries, r.matches).stats.gamesPlayed;
    m.games = [game({}), game({ gameIndex: 1, winnerEntry: m.slotA })];
    expect(buildBracket(r.tournament, r.entries, r.matches).stats.gamesPlayed).toBe(before + 1);
  });
});

describe("playErrorMessage (UX S1, S19, rate limits)", () => {
  it("a re-seat cooldown in local time, never UTC", () => {
    const until = iso(NOW + 30 * MIN);
    const msg = playErrorMessage({ ok: false, reason: "conflict", code: "reseat_cooldown", message: "play opens at 12:30 UTC", ticketsExpireAt: until });
    expect(msg).toBe(reseatCooldownText(until));
    expect(msg).toContain(timeText(until));
    expect(msg).not.toContain("UTC");
  });

  it("a stale tab after a decision, and a pending match, in plain words", () => {
    expect(playErrorMessage({ ok: false, reason: "conflict", code: "match_not_open", message: "the match is decided" })).toBe(
      "This match has already been decided. Reload the page to see the result.",
    );
    expect(playErrorMessage({ ok: false, reason: "conflict", code: "match_not_open", message: "the match is pending" })).toBe(
      "This match isn't open yet: your opponent isn't known.",
    );
    expect(playErrorMessage({ ok: false, reason: "conflict", code: "whatever", message: "raw api text 14:05 UTC" })).not.toMatch(/UTC|raw api/);
  });

  it("uses Retry-After when the api sends one", () => {
    expect(playErrorMessage({ ok: false, reason: "rate_limited", retryAfter: 12 })).toBe("Too many tries. Try again in 12 s.");
    expect(playErrorMessage({ ok: false, reason: "rate_limited" })).toBe("Too many tries at once. Wait a moment, then try again.");
    expect(rateLimitText({ retryAfter: 3 })).toBe("Too many tries. Try again in 3 s.");
  });

  it("reads Retry-After as seconds or an HTTP date", () => {
    expect(retryAfterSeconds("12")).toBe(12);
    expect(retryAfterSeconds(new Date(NOW + 5000).toUTCString(), NOW)).toBe(5);
    expect(retryAfterSeconds(null)).toBeNull();
    expect(retryAfterSeconds("soon")).toBeNull();
    expect(retryAfterSeconds("0")).toBeNull();
  });
});

describe("organizer copy (interactions S2, UX S1/S6/S22)", () => {
  const r = fixtureRunning8();
  const m = r.matches.find((x) => x.slotA && x.slotB && x.status !== "decided")!;
  const name = (id: string | null) => r.entries.find((e) => e.id === id)?.username;
  const rows = (items: AttentionItem[]) => attentionRows(items, r.entries, r.matches, 3, NOW);
  const at = { matchId: m.id, round: m.round, position: m.position };

  it("a stalled game still open, and one closed with no result: override, never 'Not valid'", () => {
    const [open] = rows([{ ...at, kind: "stalled_game", gameIndex: 0, startedAt: iso(NOW - 3 * H), closedAt: null }]);
    expect(open.title).toMatch(/^Stalled game · /);
    expect(open.body).toMatch(/closes with no result within a minute, and the match reopens/);
    expect(open.actions.map((a) => a.type)).toEqual(["override", "open"]);
    const [closed] = rows([{ ...at, kind: "stalled_game", gameIndex: 0, startedAt: iso(NOW - 3 * H), closedAt: iso(NOW - 10 * MIN) }]);
    expect(closed.title).toMatch(/^Stalled game closed · /);
    expect(closed.body).toMatch(/closed with no result/);
    expect(closed.body).toMatch(/The match is open again/);
  });

  it("a room-recovery item names what the history suggests and only offers an override", () => {
    const [row] = rows([
      { ...at, kind: "unverified_game", source: "room_recovery", gameIndex: 0, roomId: "R", candidates: [{ gameId: "g", endedAt: iso(NOW), a: true, b: null }] },
    ]);
    expect(row.title).toMatch(/^Result unclear · /);
    expect(row.body).toContain(`The players' game history suggests ${name(m.slotA)} won.`);
    expect(row.actions.map((a) => a.type)).toEqual(["override", "open"]);
    expect(row.body).not.toMatch(/a player won|Unknown|a player won, but/);
    const [both] = rows([
      { ...at, kind: "unverified_game", source: "room_recovery", gameIndex: 0, candidates: [{ gameId: "g", endedAt: iso(NOW), a: true, b: true }] },
    ]);
    expect(both.body).toContain("Both players' game history claims the win.");
  });

  it("the organizer's deadline row names the date, not 'the grace period', and says play stays open", () => {
    const until = iso(NOW + 18 * H);
    const [row] = rows([{ ...at, kind: "awaiting_organizer", deadlineAt: iso(NOW - 6 * H), until }]);
    expect(row.body).toContain(`You have until ${whenText(until)}; then the higher seed`);
    expect(row.body).not.toMatch(/grace period/);
    expect(row.body).toContain("The players can still play until you decide.");
  });

  it("tickets_outstanding and reseat_cooldown refusals in local time; a holder is named", () => {
    const until = iso(NOW + 10 * MIN);
    const text = organizerErrorText({ reason: "conflict", code: "tickets_outstanding", message: "until 12:10 UTC", ticketsExpireAt: until });
    expect(text).toBe(ticketsOutstandingText(until));
    expect(text).not.toMatch(/UTC|ticket/);
    expect(organizerErrorText({ reason: "conflict", code: "reseat_cooldown", message: "x UTC", ticketsExpireAt: until })).toBe(
      `This match was re-seated. Play opens at ${timeText(until)} (local time).`,
    );
    expect(ticketsOutstandingText(until, "bountyhuntr")).toMatch(/^bountyhuntr still has a reserved seat in the next match until /);
    expect(organizerErrorText({ reason: "rate_limited", retryAfter: 7 })).toBe("Too many tries. Try again in 7 s.");
  });
});

describe("/pro banner model (UX B1/B2/S3, interactions F4)", () => {
  const view = (state: Parameters<typeof fixtureMyTournaments>[0], tweak?: (n: ReturnType<typeof fixtureMyTournaments>) => void, now = NOW) => {
    const my = fixtureMyTournaments(state, iso(NOW));
    tweak?.(my);
    const detail = fixtureMatch(state, iso(NOW)).detail;
    detail.match = my.nextMatch!.match;
    return nextMatchView(my.nextMatch!, detail, sizeOf(my.nextMatch!, my.tournaments), now);
  };

  it("a re-seat cooldown: 'Play opens at' in local time, and the view knows when", () => {
    const until = iso(NOW + 20 * MIN);
    const v = view("waiting", (my) => void (my.nextMatch!.match.reseatCooldownUntil = until));
    expect(v.playOpensAt).toBe(until);
    expect(v.notice).toBe(reseatCooldownText(until));
    expect(v.notice).not.toContain("UTC");
    const after = view("waiting", (my) => void (my.nextMatch!.match.reseatCooldownUntil = until), NOW + 21 * MIN);
    expect(after.playOpensAt).toBeNull();
    expect(after.notice).toBeNull();
  });

  it("past the deadline with the opponent's pre-deadline hold: Join, and what happens if you don't", () => {
    const v = view("opponent_ready", (my) => void (my.nextMatch!.match.deadlineAt = iso(NOW - MIN)));
    expect(v.state).toBe("opponent_ready");
    expect(v.primary).toBe("join");
    expect(v.notice).toMatch(/^bountyhuntr is waiting in your room until .+\. If you don't join, bountyhuntr advances\.$/);
  });
});
