/**
 * Tournament fixtures for tests and screenshots (#1217) — never shipped data.
 *
 * `fixtureBracket` builds a bracket the way unbrewed-api `buildSingleElim`
 * does (standard seed order, byes decided at once and advanced), then the named
 * fixtures play it forward into every cell state. `scripts/tournaments/
 * fixture-api.mts` serves these over HTTP for a local dev server.
 */
import { roundCount, seedOrder } from "./bracket";
import type { AttentionItem } from "./api";
import { assignment } from "./matchup";
import type { MatchPageState } from "./matchPage";
import type {
  DecidedBy,
  Entry,
  Game,
  Match,
  MatchDetail,
  MatchupRule,
  MyTournaments,
  ReadyCheck,
  Tournament,
} from "./types";

const NAMES = [
  "RavenDefeatsAll",
  "hokuto_shin",
  "bountyhuntr",
  "xenoqueen",
  "crystal_lake_jay",
  "tofu.knight",
  "sky_bison_fan",
  "maple_syrup",
  "mulan_main",
  "cecil.fm",
  "leon_s",
  "momo_steals",
  "skullkid64",
  "squatchwatch",
  "lab_rat_7",
  "baba_fan",
];

export const FIXTURE_ORGANIZER = {
  userId: "u-org",
  username: "RavenDefeatsAll",
  avatarUrl: "",
};
export const FIXTURE_NOW = "2026-10-05T12:00:00Z";
const hoursFrom = (iso: string, h: number) =>
  new Date(Date.parse(iso) + h * 3_600_000).toISOString();

export const fixtureEntries = (n: number, seeded: boolean): Entry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i + 1}`,
    userId: i === 0 ? FIXTURE_ORGANIZER.userId : `u${i + 1}`,
    username: NAMES[i],
    avatarUrl: "",
    seed: seeded ? i + 1 : null,
    joinedAt: hoursFrom("2026-10-01T00:00:00Z", i),
    leftAt: null,
  }));

export const fixtureTournament = (
  over: Partial<Tournament> = {},
): Tournament => ({
  id: "t-fixture",
  slug: "autumn-skirmish",
  name: "Autumn Skirmish #3",
  organizer: FIXTURE_ORGANIZER,
  format: "single_elim",
  size: 8,
  firstTo: 1,
  matchWindowHours: 72,
  matchupRule: { mode: "free" },
  roundMaps: null,
  status: "running",
  signupClosesAt: "2026-10-02T18:00:00Z",
  startsAt: "2026-10-02T18:00:00Z",
  createdAt: "2026-09-30T00:00:00Z",
  settings: {},
  entryCount: 8,
  signupOpen: false,
  latestPossibleFinal: "2026-10-14T18:00:00Z",
  ...over,
});

const game = (
  m: Match,
  winnerEntry: string | null,
  opts: Partial<Game> = {},
): Game => ({
  gameIndex: m.games.length,
  roomId: `room-${m.id}-${m.games.length}`,
  gameId: winnerEntry ? `${10500 + m.round * 10 + m.position}` : null,
  startedAt: hoursFrom(FIXTURE_NOW, -30),
  finishedAt: winnerEntry ? hoursFrom(FIXTURE_NOW, -29) : null,
  winnerEntry,
  source: "tagged",
  verified: !!winnerEntry,
  assignment: assignment(m.matchupRule, m.games.length),
  ...opts,
});

/** A built bracket plus helpers to play it forward. */
export const fixtureBracket = (
  size: number,
  entrants: number,
  rule: MatchupRule = { mode: "free" },
) => {
  const entries = fixtureEntries(entrants, true);
  const rounds = roundCount(size);
  const matches: Match[] = [];
  for (let r = 1; r <= rounds; r++)
    for (let p = 0; p < size >> r; p++)
      matches.push({
        id: `m${r}-${p}`,
        round: r,
        position: p,
        slotA: null,
        slotB: null,
        winner: null,
        firstTo: 1,
        status: "pending",
        decidedBy: null,
        inPlay: false,
        opensAt: null,
        deadlineAt: null,
        nextMatchId: r < rounds ? `m${r + 1}-${p >> 1}` : null,
        nextSlot: r < rounds ? (p % 2 === 0 ? "a" : "b") : null,
        matchupRule: rule,
        matchupOverride: false,
        matchup: assignment(rule, 0),
        games: [],
      });
  const at = (r: number, p: number) =>
    matches.find((m) => m.round === r && m.position === p)!;
  const open = (m: Match) => {
    if (m.slotA && m.slotB && m.status === "pending") {
      m.status = "open";
      m.opensAt = hoursFrom(FIXTURE_NOW, -40);
      m.deadlineAt = hoursFrom(FIXTURE_NOW, 32);
    }
  };
  const advance = (m: Match) => {
    if (!m.nextMatchId || !m.winner) return;
    const next = matches.find((x) => x.id === m.nextMatchId)!;
    if (m.nextSlot === "a") next.slotA = m.winner;
    else next.slotB = m.winner;
    open(next);
  };
  const decide = (m: Match, side: "a" | "b", by: DecidedBy) => {
    m.winner = side === "a" ? m.slotA : m.slotB;
    m.status = "decided";
    m.decidedBy = by;
    m.inPlay = false;
    if (by === "result" || by === "unverified_confirmed")
      m.games.push(game(m, m.winner));
    advance(m);
  };

  const order = seedOrder(size);
  for (const m of matches.filter((x) => x.round === 1)) {
    const seedA = order[m.position * 2];
    const seedB = order[m.position * 2 + 1];
    m.slotA = seedA <= entrants ? `e${seedA}` : null;
    m.slotB = seedB <= entrants ? `e${seedB}` : null;
    open(m);
  }
  for (const m of matches.filter((x) => x.round === 1))
    if (!(m.slotA && m.slotB) && (m.slotA || m.slotB))
      decide(m, m.slotA ? "a" : "b", "bye");

  return {
    entries,
    matches,
    at,
    decide,
    /** A started, unfinished game: "in play now". */
    play: (m: Match) => {
      m.status = "in_play";
      m.inPlay = true;
      m.games.push(game(m, null, { startedAt: hoursFrom(FIXTURE_NOW, -1) }));
    },
    /** A finished game played outside the match's room, not yet confirmed. */
    unverified: (m: Match, side: "a" | "b") => {
      m.games.push(
        game(m, side === "a" ? m.slotA : m.slotB, {
          source: "untagged",
          verified: false,
        }),
      );
    },
    setMatchup: (m: Match, r: MatchupRule) => {
      m.matchupRule = r;
      m.matchupOverride = true;
      m.matchup = assignment(r, 0);
    },
  };
};

export interface FixturePayload {
  tournament: Tournament;
  entries: Entry[];
  matches: Match[];
}

/** 4 seats, 4 players, played out: champion state. */
export const fixtureComplete4 = (): FixturePayload => {
  const b = fixtureBracket(4, 4);
  b.decide(b.at(1, 0), "a", "result");
  b.decide(b.at(1, 1), "b", "deadline_higher_seed");
  b.decide(b.at(2, 0), "a", "result");
  return {
    tournament: fixtureTournament({
      slug: "fixture-4",
      name: "Tuesday Quickfire",
      size: 4,
      entryCount: 4,
      status: "complete",
    }),
    entries: b.entries,
    matches: b.matches,
  };
};

/**
 * 8 seats, 6 players (two byes), mid-tournament: every cell state — bye,
 * deadline rule 1, unverified, played result, in play now, ready, waiting.
 */
export const fixtureRunning8 = (): FixturePayload => {
  const rule: MatchupRule = {
    mode: "map",
    map: { kind: "catalog", id: "weathertop" },
  };
  const b = fixtureBracket(8, 6, rule);
  // QF1 (1 v bye) and QF3 (2 v bye) are byes.
  b.unverified(b.at(1, 1), "b"); // QF2 4 v 5
  b.setMatchup(b.at(1, 3), {
    mode: "fixed",
    heroes: { a: "kenshiro", b: "boba-fett" },
    map: { kind: "catalog", id: "weathertop" },
  });
  b.decide(b.at(1, 3), "a", "result"); // QF4 3 v 6
  b.play(b.at(2, 1)); // SF2 2 v 3
  return {
    tournament: fixtureTournament({
      slug: "fixture-8",
      entryCount: 6,
      matchupRule: rule,
      settings: { matchupSetBy: "organizer" },
    }),
    entries: b.entries,
    matches: b.matches,
  };
};

/** 16 seats, 13 players (three byes), round 1 mostly decided incl. deadline rule 1 and an organizer call. */
export const fixtureRunning16 = (): FixturePayload => {
  const b = fixtureBracket(16, 13);
  const r1 = (p: number) => b.at(1, p);
  // positions with two players: those whose pair has seeds ≤ 11.
  const real = [0, 1, 2, 3, 4, 5, 6, 7].filter(
    (p) => r1(p).decidedBy !== "bye",
  );
  b.decide(r1(real[0]), "a", "deadline_ready_check");
  b.decide(r1(real[1]), "b", "result");
  b.play(r1(real[2]));
  b.decide(r1(real[3]), "a", "organizer");
  b.decide(b.at(2, 0), "a", "result");
  return {
    tournament: fixtureTournament({
      slug: "fixture-16",
      name: "Serious Bracket",
      size: 16,
      entryCount: 13,
      matchWindowHours: 168,
    }),
    entries: b.entries,
    matches: b.matches,
  };
};

/** Signup still open, organizer view: seeding + Start. */
export const fixtureSignup8 = (): FixturePayload => ({
  tournament: fixtureTournament({
    slug: "fixture-signup",
    name: "Lab Rats Open",
    status: "signup",
    entryCount: 6,
    signupOpen: true,
    startsAt: null,
    signupClosesAt: "2026-10-09T18:00:00Z",
    latestPossibleFinal: null,
  }),
  entries: fixtureEntries(6, false),
  matches: [],
});

/** The match page's fixture match: SF2 of an 8-seat bracket, seed 2 v seed 3. */
export const FIXTURE_MATCH_ID = "m2-1";
/** Seed 2 (hokuto_shin) — the match page's "you" in screenshots (`--as=u2`). */
export const FIXTURE_MATCH_YOU = "u2";

/**
 * SF2 in each of the match page's six states, timed against `now` (so seat
 * clocks tick in a dev server). Mockup v2's matchup: Kenshiro vs Boba Fett on
 * Count's Castle, set by the organizer.
 */
export const fixtureMatch = (
  state: MatchPageState,
  now: string = FIXTURE_NOW,
): FixturePayload & { detail: MatchDetail } => {
  const rule: MatchupRule = { mode: "map", map: { kind: "catalog", id: "counts-castle" } };
  const b = fixtureBracket(8, 6, rule);
  b.decide(b.at(1, 1), "b", "unverified_confirmed");
  b.decide(b.at(1, 3), "a", "result");
  const sf2 = b.at(2, 1);
  b.setMatchup(sf2, { mode: "fixed", heroes: { a: "kenshiro", b: "boba-fett" }, map: { kind: "catalog", id: "counts-castle" } });
  sf2.opensAt = hoursFrom(now, -46);
  sf2.deadlineAt = hoursFrom(now, 26);
  const at = (h: number) => hoursFrom(now, h);
  const check = (entryId: string, h: number, outcome: ReadyCheck["outcome"], role: ReadyCheck["role"] = "create"): ReadyCheck => ({
    id: `rc-${entryId}-${h}`,
    gameIndex: 0,
    entryId,
    createdAt: at(h),
    expiresAt: at(h + 0.25),
    roomId: "SF2ROOM",
    outcome,
    role,
  });
  let readyChecks: ReadyCheck[] = [];
  let liveRoom: MatchDetail["liveRoom"] = null;
  // Hours ago that a seat-held clock started: 3m12s → 11:48 left of 15:00.
  const pressed = -(3 * 60 + 12) / 3600;
  switch (state) {
    case "opponent_ready":
      readyChecks = [check("e3", pressed, "pending")];
      liveRoom = { gameIndex: 0, roomId: "SF2ROOM", readyEntryId: "e3", expiresAt: at(pressed + 0.25) };
      break;
    case "you_ready":
      readyChecks = [check("e2", -28 / 3600, "pending")];
      liveRoom = { gameIndex: 0, roomId: "SF2ROOM", readyEntryId: "e2", expiresAt: at(-28 / 3600 + 0.25) };
      break;
    case "in_play":
      b.play(sf2);
      sf2.games[0].startedAt = at(-0.4);
      readyChecks = [check("e2", -0.45, "answered"), check("e3", -0.4, "answered", "join")];
      break;
    case "decided":
      readyChecks = [check("e3", -3, "answered"), check("e2", -2.9, "answered", "join")];
      b.decide(sf2, "a", "result");
      sf2.games[0] = { ...sf2.games[0], startedAt: at(-2.8), finishedAt: at(-2.4), gameId: "10571", replayAvailable: true };
      break;
    case "decided_by_rule":
      sf2.opensAt = hoursFrom(now, -73);
      sf2.deadlineAt = hoursFrom(now, -1);
      readyChecks = [check("e2", -42, "unanswered"), check("e2", -18, "unanswered")];
      b.decide(sf2, "a", "deadline_ready_check");
      break;
  }
  const entries = b.entries;
  const player = (id: string | null, lastActiveH: number) => {
    const e = entries.find((x) => x.id === id);
    return e ? { ...e, lastActiveAt: at(lastActiveH) } : null;
  };
  const opponentSeen = state === "opponent_ready" || state === "in_play" ? -0.01 : state === "decided_by_rule" ? -30 : -0.2;
  const tournament = fixtureTournament({
    slug: `fixture-match-${state.replace(/_/g, "-")}`,
    entryCount: 6,
    matchupRule: rule,
    settings: { matchupSetBy: "organizer" },
  });
  return {
    tournament,
    entries,
    matches: b.matches,
    detail: {
      match: sf2,
      tournament: { id: tournament.id, slug: tournament.slug, name: tournament.name, status: tournament.status },
      players: { a: player(sf2.slotA, -0.01), b: player(sf2.slotB, opponentSeen) },
      readyChecks,
      liveRoom,
    },
  };
};

/**
 * `GET /me/tournaments` for hokuto_shin (u2, entry e2) with SF2 as the next
 * match, in one of the match page's open-match states (#1220).
 */
export const fixtureMyTournaments = (
  state: "waiting" | "opponent_ready" | "you_ready" | "in_play",
  now: string = FIXTURE_NOW,
): MyTournaments => {
  const f = fixtureMatch(state, now);
  const d = f.detail;
  return {
    tournaments: [{ ...f.tournament, isOrganizer: false, myEntryId: "e2" }],
    nextMatch: {
      tournament: { id: f.tournament.id, slug: f.tournament.slug, name: f.tournament.name, size: f.tournament.size },
      match: d.match,
      myEntryId: "e2",
      opponent: d.players.b ? { ...d.players.b } : null,
    },
  };
};

export const MATCH_FIXTURE_STATES: MatchPageState[] = [
  "waiting",
  "opponent_ready",
  "you_ready",
  "in_play",
  "decided",
  "decided_by_rule",
];

/** Every queue item type, against `fixture-8` (screenshots + tests). */
export const FIXTURE_ATTENTION: Record<string, AttentionItem[]> = {
  "fixture-8": [
    {
      kind: "unverified_game",
      matchId: "m1-1",
      round: 1,
      position: 1,
      gameIndex: 0,
      winnerEntry: "e5",
    },
    {
      kind: "awaiting_organizer",
      matchId: "m1-1",
      round: 1,
      position: 1,
      deadlineAt: "2026-10-04T18:00:00Z",
      until: "2026-10-06T06:00:00Z",
    },
    {
      kind: "deadline_passed",
      matchId: "m1-3",
      round: 1,
      position: 3,
      deadlineAt: "2026-10-05T09:00:00Z",
      winner: "e3",
      decidedBy: "deadline_ready_check",
    },
    {
      kind: "entrant_left",
      matchId: "m2-1",
      round: 2,
      position: 1,
      entryId: "e3",
    },
    { kind: "no_matchup", matchId: "m2-1", round: 2, position: 1 },
  ],
};

export const FIXTURES: Record<string, () => FixturePayload> = {
  "fixture-4": fixtureComplete4,
  "fixture-8": fixtureRunning8,
  "fixture-16": fixtureRunning16,
  "fixture-signup": fixtureSignup8,
  ...Object.fromEntries(
    MATCH_FIXTURE_STATES.map((st) => [`fixture-match-${st.replace(/_/g, "-")}`, () => fixtureMatch(st)]),
  ),
};
