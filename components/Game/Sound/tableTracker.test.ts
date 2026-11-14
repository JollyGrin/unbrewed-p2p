import {
  RESET_QUIET_MS,
  SAME_DRAG_MS,
  SETTLE_MS,
  createTableTracker,
  diffPool,
  summarizePool,
} from "./tableTracker";

const card = (title: string) => ({ title });
const cards = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => card(`${prefix}${i}`));

type Pool = ReturnType<typeof pool>;
const pool = (over: Record<string, unknown> = {}) => ({
  hand: cards("h", 5),
  deck: cards("d", 20),
  discard: [] as { title: string }[],
  hero: { hp: 15 },
  sidekick: { hp: 6, quantity: 1 },
  extraCharacters: [],
  ...over,
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const setup = (hearOthers = true) => {
  const play = jest.fn();
  const timers: { fn: () => void; at: number; live: boolean }[] = [];
  let now = 0;
  const state = { hearOthers };
  const tracker = createTableTracker({
    play,
    hearOthers: () => state.hearOthers,
    setTimer: (fn, ms) => {
      const t = { fn, at: now + ms, live: true };
      timers.push(t);
      return t;
    },
    clearTimer: (h) => {
      if (h) (h as { live: boolean }).live = false;
    },
    now: () => now,
  });
  const advance = (ms: number) => {
    now += ms;
    timers.filter((t) => t.live && t.at <= now).forEach((t) => {
      t.live = false;
      t.fn();
    });
  };
  return { tracker, play, advance, state };
};

/** A table with me and one opponent, already seen once (the baseline). */
const seated = (hearOthers = true) => {
  const s = setup(hearOthers);
  const players = { me: { pool: pool() }, ann: { pool: pool() } };
  const blobs: Record<string, { tokens: Record<string, unknown>[] }> = {
    me: { tokens: [{ id: "m1", x: 10, y: 10 }] },
    ann: { tokens: [{ id: "a1", x: 50, y: 50 }] },
  };
  s.tracker.onPlayers(players, "me");
  s.tracker.onPositions(blobs, "me");
  expect(s.play).not.toHaveBeenCalled();
  return { ...s, players, blobs };
};

describe("table tracker: my own actions", () => {
  it("is silent for the first state it sees, however full", () => {
    const { tracker, play } = setup();
    tracker.onPlayers({ me: { pool: pool() }, ann: { pool: pool() } }, "me");
    tracker.onPositions({ me: { tokens: [{ id: "t", x: 1, y: 1 }] } }, "me");
    expect(play).not.toHaveBeenCalled();
  });

  it("is silent for the opening deal (no pool, then a pool)", () => {
    const { tracker, play } = setup();
    tracker.onPlayers({ me: {} }, "me");
    tracker.onPlayers({ me: { pool: pool() } }, "me");
    tracker.onPositions({}, "me");
    tracker.onPositions({ me: { tokens: [{ id: "t", x: 1, y: 1 }] } }, "me");
    expect(play).not.toHaveBeenCalled();
  });

  it("drawing sounds once per card, as one burst", () => {
    const { tracker, play, players } = seated();
    const p = players.me.pool;
    p.hand.push(p.deck.pop()!);
    tracker.onPlayers(players, "me"); // the pool is mutated in place, as the app does
    expect(play).toHaveBeenLastCalledWith("draw", { count: 1 });
    p.hand.push(...p.deck.splice(-3));
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("draw", { count: 3 });
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("an update that changes nothing audible is silent (a log line, a re-render)", () => {
    const { tracker, play, players, blobs } = seated();
    tracker.onPlayers(clone(players), "me");
    tracker.onPositions(clone(blobs), "me");
    expect(play).not.toHaveBeenCalled();
  });

  it("discard, mill and a card returned from the discard", () => {
    const { tracker, play, players } = seated();
    const p = players.me.pool;
    p.discard.push(p.hand.pop()!);
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("discard", { count: 1 });
    p.discard.push(...p.deck.splice(-3));
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("discard", { count: 3 });
    p.hand.push(p.discard.pop()!);
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("draw", { count: 1 });
  });

  it("shuffling, and shuffling the discard back in", () => {
    const { tracker, play, players } = seated();
    const p = players.me.pool;
    p.deck.reverse();
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("shuffle", {});
    p.discard.push(...p.hand.splice(0, 4));
    tracker.onPlayers(players, "me");
    p.deck.push(...p.discard.splice(0));
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("shuffle", {});
  });

  it("a new game is one shuffle, not a hand of draws", () => {
    const { tracker, play, players } = seated();
    players.me.pool.discard = cards("x", 9);
    players.me.pool.deck = cards("d", 11);
    tracker.onPlayers(players, "me");
    play.mockClear();
    players.me.pool = pool({ deck: cards("d", 20).reverse() });
    tracker.onPlayers(players, "me");
    expect(play.mock.calls).toEqual([["shuffle", {}]]);
  });

  it("reordering the top of the deck (scry) is a card slide, not a shuffle", () => {
    const { tracker, play, players } = seated();
    const d = players.me.pool.deck;
    [d[19], d[18]] = [d[18], d[19]];
    tracker.onPlayers(players, "me");
    expect(play.mock.calls).toEqual([["draw", {}]]);
  });

  it("a card put back on the deck lands like a placed card", () => {
    const { tracker, play, players } = seated();
    const p = players.me.pool;
    p.deck.push(p.hand.pop()!);
    tracker.onPlayers(players, "me");
    expect(play.mock.calls).toEqual([["place", {}]]);
  });

  it("health ticks lower for damage than for healing", () => {
    const { tracker, play, players } = seated();
    players.me.pool.hero.hp = 14;
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("hp", { pitch: 0.94 });
    players.me.pool.sidekick.hp = 7;
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenLastCalledWith("hp", { pitch: 1.06 });
  });

  it("playing a card to the table is heard once, when it lands", () => {
    const { tracker, play, players, blobs } = seated();
    const c = players.me.pool.hand.pop()!;
    tracker.onPlayers(players, "me"); // it left the hand: nothing yet
    expect(play).not.toHaveBeenCalled();
    blobs.me.tokens.push({ id: "c1", x: 0, y: 0, card: c, faceDown: true });
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls).toEqual([["place", { count: 1 }]]);
  });

  it("a card leaving the table is heard where it goes, not twice", () => {
    const { tracker, play, players, blobs } = seated();
    blobs.me.tokens.push({ id: "c1", x: 0, y: 0, card: card("Feint") });
    tracker.onPositions(blobs, "me");
    play.mockClear();
    players.me.pool.discard.push(card("Feint"));
    tracker.onPlayers(players, "me");
    blobs.me.tokens.pop();
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls).toEqual([["discard", { count: 1 }]]);
  });

  it("flipping a table card or a two-faced piece", () => {
    const { tracker, play, blobs } = seated();
    blobs.me.tokens.push({ id: "c1", x: 0, y: 0, card: card("Feint"), faceDown: true });
    tracker.onPositions(blobs, "me");
    play.mockClear();
    blobs.me.tokens[1].faceDown = false;
    tracker.onPositions(blobs, "me");
    blobs.me.tokens[0].flipped = true;
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls).toEqual([["flip", {}], ["flip", {}]]);
  });

  it("adding and removing pieces; a whole loadout is one set-down", () => {
    const { tracker, play, blobs } = seated();
    blobs.me.tokens.push({ id: "m2", x: 5, y: 5 });
    tracker.onPositions(blobs, "me");
    expect(play).toHaveBeenLastCalledWith("tokenDown", { count: 1 });
    blobs.me.tokens.pop();
    tracker.onPositions(blobs, "me");
    expect(play).toHaveBeenLastCalledWith("tokenUp", {});
    for (let i = 0; i < 8; i++) blobs.me.tokens.push({ id: `l${i}`, x: i, y: i });
    tracker.onPositions(blobs, "me");
    expect(play).toHaveBeenLastCalledWith("tokenDown", { count: 1 });
  });

  it("my own drag is left to the board: moving my token is silent here", () => {
    const { tracker, play, blobs, advance } = seated();
    for (let i = 0; i < 10; i++) {
      blobs.me.tokens[0].x = 10 + i * 7;
      tracker.onPositions(blobs, "me");
      advance(50);
    }
    advance(SETTLE_MS * 2);
    expect(play).not.toHaveBeenCalled();
  });

  it("a detached counter on a token ticks like health", () => {
    const { tracker, play, blobs } = seated();
    blobs.me.tokens[0].counter = { value: 3 };
    tracker.onPositions(blobs, "me");
    blobs.me.tokens[0].counter = { value: 4 };
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls).toEqual([["hp", { pitch: 1.06 }]]);
  });
});

describe("table tracker: other players", () => {
  it("their actions play more quietly", () => {
    const { tracker, play, players } = seated();
    const p = players.ann.pool;
    p.hand.push(p.deck.pop()!);
    tracker.onPlayers(players, "me");
    expect(play.mock.calls).toEqual([["draw", { count: 1, gain: 0.45 }]]);
  });

  it("are silent when the setting is off, and it applies at once", () => {
    const { tracker, play, players, state } = seated(false);
    const p = players.ann.pool;
    p.hand.push(p.deck.pop()!);
    tracker.onPlayers(players, "me");
    expect(play).not.toHaveBeenCalled();
    state.hearOthers = true;
    p.hand.push(p.deck.pop()!);
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("a snapshot that changes several seats at once is not a burst", () => {
    const { tracker, play } = setup();
    const players: Record<string, { pool: Pool }> = {
      me: { pool: pool() },
      ann: { pool: pool() },
      bo: { pool: pool() },
      cy: { pool: pool() },
    };
    tracker.onPlayers(players, "me");
    for (const seat of ["ann", "bo", "cy"]) {
      const p = players[seat].pool;
      p.hand.push(...p.deck.splice(-2));
      p.discard.push(p.hand.pop()!);
      p.hero.hp -= 3;
    }
    tracker.onPlayers(players, "me");
    expect(play).not.toHaveBeenCalled();
  });

  it("one seat's catch-up snapshot is at most one sound", () => {
    const { tracker, play, players, blobs } = seated();
    const p = players.ann.pool;
    p.hand.push(...p.deck.splice(-2));
    p.discard.push(p.hand.pop()!, p.hand.pop()!);
    p.hero.hp -= 5;
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 6; i++) {
      blobs.ann.tokens.push({ id: `c${i}`, x: i, y: i, card: card(`c${i}`) });
    }
    blobs.ann.tokens[0].x = 400;
    tracker.onPositions(blobs, "me");
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("everything that arrives while reconnecting is silent, then live again", () => {
    const { tracker, play, players, blobs } = seated();
    tracker.setQuiet(true);
    players.ann.pool.hand.push(players.ann.pool.deck.pop()!);
    players.me.pool.hero.hp = 3;
    blobs.ann.tokens.push({ id: "a2", x: 1, y: 1 });
    tracker.onPlayers(players, "me");
    tracker.onPositions(blobs, "me");
    tracker.onRoll({ id: "r-quiet", values: [3] });
    tracker.setQuiet(false);
    tracker.onPlayers(players, "me");
    tracker.onPositions(blobs, "me");
    expect(play).not.toHaveBeenCalled();
    players.ann.pool.hand.push(players.ann.pool.deck.pop()!);
    tracker.onPlayers(players, "me");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("their dragged piece is heard once, when it comes to rest", () => {
    const { tracker, play, blobs, advance } = seated();
    // 20 position updates, 50 ms apart: one drag.
    for (let i = 0; i < 20; i++) {
      blobs.ann.tokens[0].x = 50 + i * 9;
      tracker.onPositions(blobs, "me");
      advance(50);
    }
    expect(play).not.toHaveBeenCalled();
    advance(SETTLE_MS);
    expect(play.mock.calls).toEqual([["tokenDown", { gain: 0.45 }]]);
    advance(5000);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("a pause mid-drag is not a second landing", () => {
    const { tracker, play, blobs, advance } = seated();
    const drag = (steps: number) => {
      for (let i = 0; i < steps; i++) {
        blobs.ann.tokens[0].x = (blobs.ann.tokens[0].x as number) + 9;
        tracker.onPositions(blobs, "me");
        advance(50);
      }
    };
    drag(10);
    advance(SETTLE_MS + 300); // holds it still, mouse down
    expect(play).toHaveBeenCalledTimes(1);
    drag(10);
    advance(SETTLE_MS + 300); // pauses again
    drag(5);
    advance(SETTLE_MS); // lets go
    expect(play).toHaveBeenCalledTimes(1);
    // picking the same piece up again later is a new drag
    advance(SAME_DRAG_MS);
    drag(5);
    advance(SETTLE_MS);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("another piece right after is its own landing", () => {
    const { tracker, play, blobs, advance } = seated();
    blobs.ann.tokens.push({ id: "a2", x: 300, y: 300 });
    tracker.onPositions(blobs, "me");
    play.mockClear();
    blobs.ann.tokens[0].x = 90;
    tracker.onPositions(blobs, "me");
    advance(SETTLE_MS);
    blobs.ann.tokens[1].x = 340;
    tracker.onPositions(blobs, "me");
    advance(SETTLE_MS);
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(["tokenDown", "tokenDown"]);
  });

  it("a snapshot leaves no landing behind", () => {
    const { tracker, play, players, blobs, advance } = seated();
    // a third seat, so one update can change two other seats
    (players as Record<string, { pool: Pool }>).bo = { pool: pool() };
    blobs.bo = { tokens: [{ id: "b1", x: 90, y: 90 }] };
    tracker.onPlayers(players, "me");
    tracker.onPositions(blobs, "me");
    // ann is mid-drag when the snapshot lands: her piece moved, bo's board changed
    blobs.ann.tokens[0].x = 200;
    tracker.onPositions(blobs, "me");
    blobs.ann.tokens[0].x = 400;
    blobs.bo.tokens.push({ id: "b2", x: 1, y: 1 });
    tracker.onPositions(blobs, "me");
    advance(SETTLE_MS * 2);
    expect(play).not.toHaveBeenCalled();
  });

  it("a drag seen while quiet does not land once the quiet lifts", () => {
    const { tracker, play, blobs, advance } = seated();
    blobs.ann.tokens[0].x = 200;
    tracker.onPositions(blobs, "me"); // armed, live
    tracker.setQuiet(true);
    blobs.ann.tokens[0].x = 300;
    tracker.onPositions(blobs, "me"); // seen while quiet: baseline only
    advance(100);
    tracker.setQuiet(false);
    advance(SETTLE_MS * 2);
    expect(play).not.toHaveBeenCalled();
  });

  it("a new game with several players is one shuffle, however the seats trickle in", () => {
    const s = setup();
    const { tracker, play, advance } = s;
    type Seat = { pool: Pool; resetEpoch?: number };
    const players: Record<string, Seat> = {
      me: { pool: pool() },
      ann: { pool: pool() },
      bo: { pool: pool() },
      cy: { pool: pool() },
    };
    const blobs: Record<string, { tokens: Record<string, unknown>[] }> = {};
    for (const seat of Object.keys(players))
      blobs[seat] = { tokens: [{ id: `${seat}-hero`, x: 1, y: 1 }, { id: `${seat}-side`, x: 2, y: 2 }] };
    tracker.onPlayers(players, "me");
    tracker.onPositions(blobs, "me");

    // each seat applies the reset in its own update: pool first, then board
    for (const seat of ["ann", "bo", "me", "cy"]) {
      players[seat] = { pool: pool({ deck: cards("n", 20).reverse() }), resetEpoch: 1 };
      tracker.onPlayers(players, "me");
      advance(30);
      blobs[seat] = { tokens: [{ id: `${seat}-hero2`, x: 1, y: 1 }, { id: `${seat}-side2`, x: 2, y: 2 }] };
      tracker.onPositions(blobs, "me");
      advance(120);
    }
    expect(play.mock.calls).toEqual([["shuffle", { gain: 0.45 }]]);

    // the table is live again afterwards
    advance(RESET_QUIET_MS);
    play.mockClear();
    players.ann.pool.hand.push(players.ann.pool.deck.pop()!);
    tracker.onPlayers(players, "me");
    blobs.bo.tokens.push({ id: "bo-extra", x: 5, y: 5 });
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls.map(([sound]) => sound)).toEqual(["draw", "tokenDown"]);
  });

  it("my own new game is one shuffle at full level", () => {
    const { tracker, play, blobs, advance } = seated();
    const players: Record<string, { pool: Pool; resetEpoch?: number }> = {
      me: { pool: pool({ deck: cards("n", 20).reverse() }), resetEpoch: 3 },
      ann: { pool: pool() },
    };
    tracker.onPlayers(players, "me");
    blobs.me = { tokens: [{ id: "m-new", x: 1, y: 1 }] };
    tracker.onPositions(blobs, "me");
    advance(50);
    players.ann = { pool: pool({ deck: cards("n", 20).reverse() }), resetEpoch: 3 };
    tracker.onPlayers(players, "me");
    blobs.ann = { tokens: [{ id: "a-new", x: 1, y: 1 }] };
    tracker.onPositions(blobs, "me");
    expect(play.mock.calls).toEqual([["shuffle", {}]]);
  });

  it("a reset that arrived while reconnecting is not heard afterwards", () => {
    const { tracker, play } = seated();
    const players: Record<string, { pool: Pool; resetEpoch?: number }> = {
      me: { pool: pool() },
      ann: { pool: pool(), resetEpoch: 2 },
    };
    tracker.setQuiet(true);
    tracker.onPlayers(players, "me");
    tracker.setQuiet(false);
    players.me = { pool: pool({ deck: cards("n", 20).reverse() }), resetEpoch: 2 };
    tracker.onPlayers(players, "me");
    expect(play).not.toHaveBeenCalled();
  });

  it("a seat that leaves and comes back starts from a fresh baseline", () => {
    const { tracker, play, players } = seated();
    const { ann, ...withoutAnn } = players;
    tracker.onPlayers(withoutAnn, "me");
    ann.pool.hand.push(...ann.pool.deck.splice(-3));
    tracker.onPlayers(players, "me");
    expect(play).not.toHaveBeenCalled();
  });
});

describe("table tracker: dice", () => {
  it("each roll is heard once, however often it is re-delivered", () => {
    const { tracker, play } = setup();
    const roll = { id: "r1", values: [4] };
    tracker.onRoll(undefined);
    tracker.onRoll(roll);
    tracker.onRoll({ ...roll });
    expect(play.mock.calls).toEqual([["die", {}]]);
  });

  it("my own roll plays at full level, switch on or off", () => {
    const { tracker, play } = setup(false);
    tracker.onRoll({ id: "mine", by: "me", values: [4] }, "me");
    tracker.onRoll({ id: "mine4", by: "me", values: [1, 2, 3, 4] }, "me");
    expect(play.mock.calls).toEqual([
      ["die", {}],
      ["dice", {}],
      ["die", { gain: 0.6 }],
    ]);
  });

  it("another player's roll is quieter, like their other actions", () => {
    const { tracker, play } = setup();
    tracker.onRoll({ id: "theirs", by: "ann", values: [4] }, "me");
    tracker.onRoll({ id: "theirs4", by: "ann", values: [1, 2, 3, 4] }, "me");
    expect(play.mock.calls).toEqual([
      ["die", { gain: 0.45 }],
      ["dice", { gain: 0.45 }],
      ["die", { gain: 0.6 * 0.45 }],
    ]);
  });

  it("another player's roll is silent with Other players off", () => {
    const { tracker, play, state } = setup(false);
    tracker.onRoll({ id: "theirs", by: "ann", values: [4] }, "me");
    tracker.onRoll({ id: "theirs4", by: "ann", values: [1, 2, 3, 4] }, "me");
    expect(play).not.toHaveBeenCalled();
    // heard once per id: turning the switch on does not replay it
    state.hearOthers = true;
    tracker.onRoll({ id: "theirs", by: "ann", values: [4] }, "me");
    expect(play).not.toHaveBeenCalled();
    tracker.onRoll({ id: "next", by: "ann", values: [4] }, "me");
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("several dice clatter", () => {
    const { tracker, play } = setup();
    tracker.onRoll({ id: "r2", values: [4, 2] });
    expect(play.mock.calls).toEqual([["dice", {}]]);
    play.mockClear();
    tracker.onRoll({ id: "r3", values: [4, 2, 6, 1] });
    expect(play.mock.calls).toEqual([["dice", {}], ["die", { gain: 0.6 }]]);
  });
});

describe("diffPool", () => {
  it("copes with pools from older clients (missing zones)", () => {
    const bare = summarizePool({ hand: [], hero: null })!;
    const full = summarizePool(pool())!;
    expect(() => diffPool(bare, full)).not.toThrow();
    expect(summarizePool(undefined)).toBeUndefined();
  });
});
