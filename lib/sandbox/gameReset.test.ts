import { PoolType } from "@/components/DeckPool/PoolFns";
import { PlayerState } from "@/lib/gamesocket/message";
import {
  RESET_REQUEST_TTL_MS,
  ResetPlayers,
  evaluateResetRequest,
  incomingResetRequest,
  isRequestExpired,
  maxResetEpoch,
  nextEpoch,
  pruneResetVotes,
  requiredVoters,
  resolveResetEpoch,
} from "./gameReset";

// The reset logic only ever asks "does this player have a pool?", so a stub is
// enough — building a real one would need a whole deck fixture.
const POOL = {} as unknown as PoolType;

const player = (over: Partial<PlayerState> = {}): PlayerState => ({
  pool: POOL,
  ...over,
});

const req = (id: string, by: string, at = 1_000) => ({ id, by, at });

describe("the adopt rule", () => {
  // The whole correctness of the reset is `maxEpoch > myEpoch`, so the cases
  // that used to need bespoke seed-suppression are just table rows here.
  const cases: {
    name: string;
    players: ResetPlayers;
    myEpoch: number;
    hasPool: boolean;
    expected: { epoch: number; action: string };
  }[] = [
    {
      name: "steady state — nobody has ever reset",
      players: { alice: player(), bob: player() },
      myEpoch: 0,
      hasPool: true,
      expected: { epoch: 0, action: "none" },
    },
    {
      name: "refresh right after a reset — my replayed blob carries the epoch",
      players: {
        alice: player({ resetEpoch: 3 }),
        bob: player({ resetEpoch: 3 }),
      },
      myEpoch: 3,
      hasPool: true,
      expected: { epoch: 3, action: "none" },
    },
    {
      name: "refresh before my own echo lands — local ref still wins",
      players: { alice: player(), bob: player({ resetEpoch: 3 }) },
      myEpoch: 3,
      hasPool: true,
      expected: { epoch: 3, action: "none" },
    },
    {
      name: "stale rejoin — I was offline for the reset, so I re-seed",
      players: {
        alice: player({ resetEpoch: 1 }),
        bob: player({ resetEpoch: 4 }),
      },
      myEpoch: 1,
      hasPool: true,
      expected: { epoch: 4, action: "wipe" },
    },
    {
      name: "brand-new joiner — adopt the epoch, but there is nothing to wipe",
      players: { alice: player({ pool: undefined }), bob: player({ resetEpoch: 2 }) },
      myEpoch: 0,
      hasPool: false,
      expected: { epoch: 2, action: "adopt" },
    },
    {
      name: "someone reset while I was watching — wipe",
      players: { alice: player(), bob: player({ resetEpoch: 1 }) },
      myEpoch: 0,
      hasPool: true,
      expected: { epoch: 1, action: "wipe" },
    },
  ];

  it.each(cases)("$name", ({ players, myEpoch, hasPool, expected }) => {
    expect(
      resolveResetEpoch({ players, self: "alice", myEpoch, hasPool }),
    ).toMatchObject(expected);
  });

  it("names the committer so every client logs the same person", () => {
    const players = {
      alice: player(),
      bob: player({ resetEpoch: 2 }),
      carol: player({ resetEpoch: 2 }),
    };
    expect(
      resolveResetEpoch({ players, self: "alice", myEpoch: 0, hasPool: true }).by,
    ).toBe("bob");
  });
});

describe("concurrent proposals", () => {
  // Both players propose, both accept, and both commit locally. The commits
  // must land on ONE epoch, and each client must wipe exactly once.
  it("converge on a single epoch", () => {
    const players: ResetPlayers = {
      alice: player({ resetRequest: req("a1", "alice") }),
      bob: player({ resetRequest: req("b1", "bob") }),
    };
    expect(nextEpoch(players, 0)).toBe(1); // alice commits
    expect(nextEpoch(players, 0)).toBe(1); // bob commits, independently
  });

  it("do not cause a second wipe once both have applied", () => {
    const applied: ResetPlayers = {
      alice: player({ resetEpoch: 1 }),
      bob: player({ resetEpoch: 1 }),
    };
    expect(
      resolveResetEpoch({
        players: applied,
        self: "alice",
        myEpoch: 1,
        hasPool: true,
      }).action,
    ).toBe("none");
  });

  it("pull the slower proposer along instead of double-bumping", () => {
    // Alice committed first; bob hasn't tallied his own request yet. The epoch
    // check runs before the tally, so bob adopts alice's epoch and drops his
    // request rather than committing epoch 2.
    const players: ResetPlayers = {
      alice: player({ resetEpoch: 1 }),
      bob: player({ resetRequest: req("b1", "bob") }),
    };
    expect(
      resolveResetEpoch({ players, self: "bob", myEpoch: 0, hasPool: true }),
    ).toMatchObject({ epoch: 1, action: "wipe" });
  });
});

describe("consent", () => {
  it("only counts seats that are actually playing", () => {
    const players: ResetPlayers = {
      alice: player(),
      bob: player(),
      spectator: player({ pool: undefined }),
    };
    expect(requiredVoters(players, "alice")).toEqual(["bob"]);
  });

  it("commits with no voters at all (solo lobby / offline)", () => {
    expect(requiredVoters({ alice: player() }, "alice")).toEqual([]);
  });

  it("waits while an answer is outstanding", () => {
    const request = req("a1", "alice");
    const players: ResetPlayers = {
      alice: player({ resetRequest: request }),
      bob: player(),
      carol: player({ resetVotes: [{ requestId: "a1", accept: true, at: 5 }] }),
    };
    expect(
      evaluateResetRequest({ players, proposer: "alice", request }),
    ).toMatchObject({ outcome: "waiting", waitingOn: ["bob"] });
  });

  it("commits once everyone has accepted", () => {
    const request = req("a1", "alice");
    const players: ResetPlayers = {
      alice: player({ resetRequest: request }),
      bob: player({ resetVotes: [{ requestId: "a1", accept: true, at: 5 }] }),
    };
    expect(
      evaluateResetRequest({ players, proposer: "alice", request }),
    ).toMatchObject({ outcome: "commit", waitingOn: [] });
  });

  it("drops the request on a single decline", () => {
    const request = req("a1", "alice");
    const players: ResetPlayers = {
      alice: player({ resetRequest: request }),
      bob: player({ resetVotes: [{ requestId: "a1", accept: false, at: 5 }] }),
      carol: player({ resetVotes: [{ requestId: "a1", accept: true, at: 5 }] }),
    };
    expect(
      evaluateResetRequest({ players, proposer: "alice", request }),
    ).toMatchObject({ outcome: "declined", declinedBy: "bob" });
  });

  it("ignores votes cast on some older request", () => {
    const request = req("a2", "alice");
    const players: ResetPlayers = {
      alice: player({ resetRequest: request }),
      bob: player({ resetVotes: [{ requestId: "a1", accept: true, at: 5 }] }),
    };
    expect(
      evaluateResetRequest({ players, proposer: "alice", request }),
    ).toMatchObject({ outcome: "waiting", waitingOn: ["bob"] });
  });
});

describe("incoming prompts", () => {
  const now = 10_000;

  it("surfaces an unanswered request from another player", () => {
    const players: ResetPlayers = {
      alice: player({ resetRequest: req("a1", "alice", now - 1_000) }),
      bob: player(),
    };
    expect(
      incomingResetRequest({ players, self: "bob", now, myVotes: [] }),
    ).toMatchObject({ from: "alice" });
  });

  it("stays quiet once I have answered (idempotent across a refresh)", () => {
    const players: ResetPlayers = {
      alice: player({ resetRequest: req("a1", "alice", now - 1_000) }),
      bob: player({ resetVotes: [{ requestId: "a1", accept: true, at: now }] }),
    };
    // Local votes, not the echoed blob: answering hides the prompt at once.
    expect(
      incomingResetRequest({
        players,
        self: "bob",
        now,
        myVotes: [{ requestId: "a1", accept: true, at: now }],
      }),
    ).toBeUndefined();
  });

  it("ignores a request from a proposer who is long gone", () => {
    const players: ResetPlayers = {
      alice: player({
        resetRequest: req("a1", "alice", now - RESET_REQUEST_TTL_MS - 1),
      }),
      bob: player(),
    };
    expect(
      incomingResetRequest({ players, self: "bob", now, myVotes: [] }),
    ).toBeUndefined();
  });

  it("expires exactly at the TTL", () => {
    const request = req("a1", "alice", 0);
    expect(isRequestExpired(request, RESET_REQUEST_TTL_MS - 1)).toBe(false);
    expect(isRequestExpired(request, RESET_REQUEST_TTL_MS)).toBe(true);
  });
});

describe("housekeeping", () => {
  it("takes the highest epoch in the room", () => {
    expect(
      maxResetEpoch({
        alice: player({ resetEpoch: 2 }),
        bob: player({ resetEpoch: 7 }),
        carol: player(),
      }),
    ).toBe(7);
  });

  it("drops votes for requests nobody advertises anymore", () => {
    const players: ResetPlayers = {
      alice: player({ resetRequest: req("a2", "alice") }),
      bob: player(),
    };
    expect(
      pruneResetVotes(
        [
          { requestId: "a1", accept: true, at: 1 },
          { requestId: "a2", accept: false, at: 2 },
        ],
        players,
      ),
    ).toEqual([{ requestId: "a2", accept: false, at: 2 }]);
  });
});
