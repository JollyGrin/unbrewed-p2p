/**
 * #807 (retry of #496) — sandbox card conservation through the REAL
 * WebGameProvider + HandContainer, with every client wired to an in-memory
 * double of the relay (gameserver/gameserver/server.go).
 *
 * Nothing is pre-delivered. Every frame a client sees is one the double sent
 * because of that client's own join or somebody's send — exactly what the
 * real relay does — so no test can smuggle in the frame a hold is waiting
 * for. That is how #797 shipped a room-wide deadlock: its tests delivered the
 * join replay by hand, the prod relay never sent it
 * (research/incident-2026-09-13-relay-gate-797.md, unbrewed workspace).
 *
 * The double's knobs model every relay we've had: `replayPositions: false` is
 * the pre-July prod relay (no playerposition on join), `replayState: false` a
 * relay that replays nothing, `sameNameReplaces: true` the relay before #807
 * (clients keyed by name). Per-connection outbox/inbox queues let a test put a
 * send "in flight" and deliver a frame the relay built before it landed.
 *
 * Verdict metric: card conservation — hand + deck + discard + commit + card
 * tokens on the table == deck size, for every player, on every client AND on
 * the relay, and every client agrees with the relay.
 */
import React, { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { act, fireEvent, render, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { RouterContext } from "next/dist/shared/lib/router-context";
import {
  JOIN_REPLAY_GRACE_MS,
  WebGameProvider,
  useWebGame,
} from "@/lib/contexts/WebGameProvider";
import { HandContainer } from "@/components/Game/Hand/hand.container";
import type { HandFan } from "@/components/Game/game.carousel";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import type { WebsocketProps } from "@/lib/gamesocket/socket";
import { PoolType } from "@/components/DeckPool/PoolFns";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import {
  PlayCardToTable,
  migrateBlob,
  newTokenId,
} from "@/components/Positions/position.type";
import { initPool, initPositionBlob } from "@/lib/sandbox/initGame";
import HOLLOW_OAK from "@/public/evergreen-decks/hollow-oak.json";

type FanProps = Parameters<typeof HandFan>[0];
type Ctx = ReturnType<typeof useWebGame>;

// ---- relay double ------------------------------------------------------------

type Wire = { msgtype: "playerstate" | "playerposition"; content: unknown };

class Conn {
  open = false;
  listening = false;
  holdOutbox = false;
  outbox: Wire[] = [];
  inbox: string[] = [];
  /** Every send the socket accepted, in order (the "outgoing ws frames"). */
  sent: Wire[] = [];
  dropped: Wire[] = [];
  constructor(
    readonly name: string,
    readonly props: WebsocketProps,
  ) {}
}

class RelayDouble {
  players: Record<string, unknown> = {};
  positions: Record<string, unknown> = {};
  conns: Conn[] = [];

  constructor(
    readonly opts: {
      replayState?: boolean;
      replayPositions?: boolean;
      sameNameReplaces?: boolean;
    } = {},
  ) {}

  /** initializeWebsocket: the socket starts connecting. */
  connect(props: WebsocketProps) {
    const conn = new Conn(props.name, props);
    this.conns.push(conn);
    props.onStatus?.("connecting");
    // socket.ts drops (never queues) a send while the socket isn't OPEN
    const send = (wire: Wire) => {
      if (!conn.open) return conn.dropped.push(wire);
      const copy = { ...wire, content: JSON.parse(JSON.stringify(wire.content)) };
      conn.sent.push(copy);
      conn.outbox.push(copy);
    };
    return {
      updateMyPlayerState: (content: PlayerState) =>
        send({ msgtype: "playerstate", content }),
      updateMyPlayerPosition: (content: unknown) =>
        send({ msgtype: "playerposition", content }),
      close: () => {
        conn.open = false;
        conn.listening = false;
      },
    };
  }

  /** The socket's onopen, then the relay's PlayerJoin. */
  open(conn: Conn) {
    conn.open = true;
    act(() => conn.props.onStatus?.("open"));
    if (this.opts.sameNameReplaces)
      for (const c of this.conns)
        if (c !== conn && c.name === conn.name) c.listening = false;
    conn.listening = true;
    if (!(conn.name in this.players)) this.players[conn.name] = {};
    if (this.opts.replayState !== false) this.broadcast("gamestate");
    if (this.opts.replayPositions !== false) this.broadcast("playerposition");
  }

  /** The socket drops: frames in flight either way are lost. */
  drop(conn: Conn) {
    conn.open = false;
    conn.listening = false;
    conn.inbox = [];
    conn.outbox = [];
    act(() => conn.props.onStatus?.("closed"));
  }

  private broadcast(msgtype: "gamestate" | "playerposition") {
    const raw = JSON.stringify(
      msgtype === "gamestate"
        ? {
            msgtype,
            content: { gid: "room", players: this.players, last_updated: "" },
          }
        : { msgtype, content: this.positions },
    );
    for (const c of this.conns) if (c.listening) c.inbox.push(raw);
  }

  /** The relay reads this connection's next queued send. */
  process(conn: Conn) {
    const wire = conn.outbox.shift();
    if (!wire) return false;
    if (wire.msgtype === "playerstate") {
      this.players[conn.name] = wire.content;
      this.broadcast("gamestate");
    } else {
      this.positions[conn.name] = wire.content;
      this.broadcast("playerposition");
    }
    return true;
  }

  /** The client receives this connection's next queued frame. */
  deliver(conn: Conn) {
    const raw = conn.inbox.shift();
    if (!raw) return false;
    act(() => {
      if (JSON.parse(raw).msgtype === "gamestate") conn.props.onGameState(raw);
      else conn.props.onGamePositions(raw);
    });
    return true;
  }

  /** Run the wire until quiet (held outboxes stay held). */
  flush() {
    for (let guard = 0; guard < 1000; guard++) {
      let moved = false;
      for (const c of this.conns) {
        if (!c.holdOutbox) while (this.process(c)) moved = true;
      }
      for (const c of this.conns) while (this.deliver(c)) moved = true;
      if (!moved) return;
    }
    throw new Error("relay double never went quiet");
  }
}

let mockRelay: RelayDouble;

jest.mock("../../lib/gamesocket/socket", () => ({
  initializeWebsocket: (props: WebsocketProps) => mockRelay.connect(props),
}));
jest.mock("../../lib/hooks", () => ({
  useLocalServerStorage: () => ({ activeServer: "http://relay.test" }),
}));
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({ starredDeck: HOLLOW_OAK }),
}));
// a room-wide reset rebuilds from the starred deck read at that moment
jest.mock("../../lib/sandbox/initGame", () => ({
  ...jest.requireActual("../../lib/sandbox/initGame"),
  readStarredDeck: () =>
    require("../../public/evergreen-decks/hollow-oak.json"),
}));

// HandFan is presentation: record the props of EVERY render, per client, so a
// test can call the handlers of an earlier render (= a drag's pointerup).
const mockFans: Record<string, FanProps[]> = {};
const mockClientContext = React.createContext("");
jest.mock("../../components/Game/game.carousel", () => ({
  HandFan: (props: FanProps) => {
    const who = require("react").useContext(mockClientContext);
    (mockFans[who] ??= []).push(props);
    return null;
  },
}));

// ---- clients -----------------------------------------------------------------

/**
 * Mirrors GameShell's BoardContainer where it touches the wire: the join seed
 * ("Seed a fresh player's board") and playCardToTable, both built from
 * blobs[self] as the provider serves it, reached through a ref like
 * playToTableRef.
 */
const useBoard = (self: string): MutableRefObject<PlayCardToTable> => {
  const { gamePositions, gameState, setPlayerPosition } = useWebGame();
  const blobs = useMemo(
    () => (gamePositions?.content ?? {}) as Record<string, unknown>,
    [gamePositions],
  );
  const myBlob = migrateBlob(blobs[self]);
  useEffect(() => {
    if (gameState === undefined || blobs[self]) return;
    const timer = setTimeout(
      () => setPlayerPosition.current(initPositionBlob(undefined, self)),
      1500,
    );
    return () => clearTimeout(timer);
  }, [blobs, self, gameState, setPlayerPosition]);
  const playRef = useRef<PlayCardToTable>(() => {});
  playRef.current = (card, opts) =>
    setPlayerPosition.current({
      color: myBlob.color,
      tokens: [
        ...myBlob.tokens,
        {
          id: newTokenId(self),
          x: opts?.screenPos?.x ?? 0,
          y: opts?.screenPos?.y ?? 0,
          card,
          ...(opts?.faceDown ? { faceDown: true } : {}),
        },
      ],
    });
  return playRef;
};

const ClientView = ({
  name,
  ctxRef,
}: {
  name: string;
  ctxRef: MutableRefObject<Ctx | undefined>;
}) => {
  const ctx = useWebGame();
  ctxRef.current = ctx;
  const playRef = useBoard(name);
  return (
    <HandContainer
      setModal={() => {}}
      gameState={ctx.gameState}
      setPlayerState={ctx.setPlayerState}
      logAction={ctx.logAction}
      playToTable={(card, opts) => playRef.current(card, opts)}
      offerCardTransfer={ctx.offerCardTransfer}
    />
  );
};

type Client = ReturnType<typeof mountClient>;
let tabs = 0;

const mountClient = (name: string) => {
  const tab = `${name}#${++tabs}`;
  const ctxRef: MutableRefObject<Ctx | undefined> = { current: undefined };
  const router = {
    isReady: true,
    query: { name, gid: "room" },
    pathname: "/game",
    asPath: `/game?name=${name}&gid=room`,
    replace: jest.fn(),
    push: jest.fn(),
    events: { on: jest.fn(), off: jest.fn(), emit: jest.fn() },
  };
  const utils = render(
    <ChakraProvider>
      <RouterContext.Provider value={router as never}>
        <mockClientContext.Provider value={tab}>
          <WebGameProvider>
            <ClientView name={name} ctxRef={ctxRef} />
          </WebGameProvider>
        </mockClientContext.Provider>
      </RouterContext.Provider>
    </ChakraProvider>,
  );
  const conn = mockRelay.conns.at(-1)!;
  return {
    name,
    conn,
    ctx: () => ctxRef.current!,
    fan: () => mockFans[tab].at(-1)!,
    draw: () =>
      act(() => {
        fireEvent.click(within(utils.container).getByText("Draw +1"));
      }),
    /** "Place on table" from the card menu (a fresh handler). */
    play: (index = 0) => act(() => mockFans[tab].at(-1)!.functions.playFn!(index)),
    unmount: utils.unmount,
  };
};

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

// ---- conservation ------------------------------------------------------------

const DECK_SIZE = (() => {
  const p = initPool(HOLLOW_OAK as unknown as DeckImportType);
  return p.hand.length + (p.deck?.length ?? 0) + p.discard.length;
})();

const cardsIn = (pool: PoolType | undefined) =>
  pool
    ? pool.hand.length +
      (pool.deck?.length ?? 0) +
      pool.discard.length +
      (pool.removed?.length ?? 0) +
      (pool.commit?.main ? 1 : 0) +
      (pool.commit?.boost ? 1 : 0) +
      (pool.commit?.extraBoosts?.length ?? 0)
    : NaN;
const tableCards = (blob: unknown) =>
  migrateBlob(blob).tokens.filter((t) => t.card).length;

type Seen = { pool?: PoolType; blob?: unknown };
const onRelay = (who: string): Seen => ({
  pool: (mockRelay.players[who] as PlayerState | undefined)?.pool,
  blob: mockRelay.positions[who],
});
const onClient = (c: Client, who: string): Seen => ({
  pool: (c.ctx().gameState?.content as GameState | undefined)?.players?.[who]
    ?.pool,
  blob: (c.ctx().gamePositions?.content as Record<string, unknown> | undefined)?.[
    who
  ],
});
const count = (s: Seen) => cardsIn(s.pool) + tableCards(s.blob);
const shape = (s: Seen) => ({
  hand: s.pool?.hand.map((k) => k.title),
  deck: s.pool?.deck?.length,
  discard: s.pool?.discard.map((k) => k.title),
  table: migrateBlob(s.blob)
    .tokens.filter((t) => t.card)
    .map((t) => `${t.id}:${t.card?.title}`),
});

/** Every player conserved on the relay and on every client, all agreeing. */
const expectConserved = (clients: Client[], players: string[]) => {
  for (const who of players) {
    expect({ who, where: "relay", n: count(onRelay(who)) }).toEqual({
      who,
      where: "relay",
      n: DECK_SIZE,
    });
    for (const c of clients) {
      expect({ who, where: c.name, n: count(onClient(c, who)) }).toEqual({
        who,
        where: c.name,
        n: DECK_SIZE,
      });
      expect(shape(onClient(c, who))).toEqual(shape(onRelay(who)));
    }
  }
};

const handTitles = (c: Client, who = c.name) =>
  onClient(c, who).pool?.hand.map((k: DeckImportCardType) => k.title) ?? [];

// ---- setup -------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  tabs = 0;
  for (const k of Object.keys(mockFans)) delete mockFans[k];
});
afterEach(() => {
  jest.useRealTimers();
});

/** Join, let the hand auto-init (500ms) and the board seed (1500ms) run. */
const joinAndSettle = (name: string) => {
  const c = mountClient(name);
  mockRelay.open(c.conn);
  mockRelay.flush();
  advance(500);
  mockRelay.flush();
  advance(2000);
  mockRelay.flush();
  return c;
};

const setupTwo = () => {
  mockRelay = new RelayDouble();
  const alice = joinAndSettle("alice");
  const bob = joinAndSettle("bob");
  alice.draw();
  alice.draw();
  bob.draw();
  mockRelay.flush();
  expect(handTitles(alice)).toHaveLength(3);
  return { alice, bob };
};

// ---- AC 2 / 3 / 4: fresh rooms, no pre-delivered snapshot --------------------

describe("fresh room, first player, nothing pre-delivered", () => {
  const firstPlayerFlow = () => {
    const alice = mountClient("alice");
    expect(alice.conn.sent).toEqual([]);
    mockRelay.open(alice.conn);
    mockRelay.flush();

    // hand initialises
    advance(500);
    mockRelay.flush();
    expect(handTitles(alice)).toHaveLength(1);
    expect(count(onRelay("alice"))).toBe(DECK_SIZE);

    // a token spawns (the board's join seed)
    advance(2000);
    mockRelay.flush();
    expect(migrateBlob(mockRelay.positions.alice).tokens).toHaveLength(1);

    // a dragged card lands
    alice.draw();
    const dragged = handTitles(alice)[0];
    act(() =>
      alice.fan().functions.playFn!(0, { screenPos: { x: 40, y: 40 } }),
    );
    mockRelay.flush();
    expect(shape(onRelay("alice")).table).toEqual([
      expect.stringContaining(`:${dragged}`),
    ]);
    expect(handTitles(alice)).toHaveLength(1);
    return alice;
  };

  it("relay that replays both channels (Railway): hand, token, dragged card, and a second joiner sees all of it", () => {
    mockRelay = new RelayDouble();
    const alice = firstPlayerFlow();

    const bob = mountClient("bob");
    mockRelay.open(bob.conn);
    mockRelay.flush();
    // on join, before bob has sent anything
    expect(bob.conn.sent).toEqual([]);
    expect(shape(onClient(bob, "alice"))).toEqual(shape(onRelay("alice")));
    expect(tableCards(onClient(bob, "alice").blob)).toBe(1);

    advance(2500);
    mockRelay.flush();
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("relay that sends NO playerposition on join (pre-July prod): still works, just without the replay", () => {
    mockRelay = new RelayDouble({ replayPositions: false });
    const alice = firstPlayerFlow();

    const bob = mountClient("bob");
    mockRelay.open(bob.conn);
    mockRelay.flush();
    expect(shape(onClient(bob, "alice")).hand).toEqual(
      shape(onRelay("alice")).hand,
    );
    // bob's own join seed is the first positions send he makes; the relay's
    // answer to it carries alice's board too
    advance(2500);
    mockRelay.flush();
    expect(tableCards(onClient(bob, "alice").blob)).toBe(1);
    expectConserved([alice, bob], ["alice", "bob"]);
  });
});

describe("the join hold always releases", () => {
  it("pool sends before the replay are held, and released by the replay", () => {
    mockRelay = new RelayDouble();
    const alice = mountClient("alice");
    // slow link: the hand auto-init fires before the socket even opens, and a
    // token is placed on the not-yet-connected board
    advance(500);
    act(() =>
      alice.ctx().setPlayerPosition.current({ tokens: [{ id: "t", x: 1, y: 1 }] }),
    );
    expect(alice.conn.sent).toEqual([]);

    mockRelay.open(alice.conn);
    mockRelay.flush();
    // the held pool goes out once the replay lands; the board blob was never
    // held (the closed socket dropped it) and is re-sent on open
    expect(alice.conn.sent.map((w) => w.msgtype).sort()).toEqual([
      "playerposition",
      "playerstate",
    ]);
    expect(count(onRelay("alice"))).toBe(DECK_SIZE);
    expect(migrateBlob(mockRelay.positions.alice).tokens).toHaveLength(1);
  });

  it("pool sends before the replay are held, and released WITHOUT one after the grace period", () => {
    mockRelay = new RelayDouble({ replayState: false, replayPositions: false });
    const alice = mountClient("alice");
    mockRelay.open(alice.conn);
    mockRelay.flush(); // the relay replays nothing at all
    advance(500); // hand auto-init: held
    act(() =>
      alice.ctx().setPlayerPosition.current({ tokens: [{ id: "t", x: 1, y: 1 }] }),
    );
    // the board channel is never held — only the pool waits for a replay
    expect(alice.conn.sent.map((w) => w.msgtype)).toEqual(["playerposition"]);

    advance(JOIN_REPLAY_GRACE_MS - 501);
    expect(alice.conn.sent.map((w) => w.msgtype)).toEqual(["playerposition"]);
    advance(1);
    mockRelay.flush();
    expect(alice.conn.sent.map((w) => w.msgtype)).toEqual([
      "playerposition",
      "playerstate",
    ]);
    expect(count(onRelay("alice"))).toBe(DECK_SIZE);

    // and from then on every send goes straight out
    alice.draw();
    mockRelay.flush();
    expect(handTitles(alice)).toHaveLength(2);
    expect(shape(onRelay("alice")).hand).toHaveLength(2);
  });

  it("a hold that was waiting when the socket dropped releases on the next open", () => {
    mockRelay = new RelayDouble({ replayState: false, replayPositions: false });
    const alice = mountClient("alice");
    mockRelay.open(alice.conn);
    advance(500); // held auto-init
    mockRelay.drop(alice.conn);
    advance(JOIN_REPLAY_GRACE_MS * 3); // no timer while closed
    expect(alice.conn.sent).toEqual([]);
    mockRelay.open(alice.conn);
    advance(JOIN_REPLAY_GRACE_MS);
    mockRelay.flush();
    expect(count(onRelay("alice"))).toBe(DECK_SIZE);
  });
});

// ---- AC 1: card conservation --------------------------------------------------

describe("card conservation, two clients + relay", () => {
  it("play from hand", () => {
    const { alice, bob } = setupTwo();
    alice.play(0);
    mockRelay.flush();
    expect(tableCards(onRelay("alice").blob)).toBe(1);
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("drag-to-table with a frame landing mid-drag (the drop fires the drag-start handler)", () => {
    const { alice, bob } = setupTwo();
    const dragStart = alice.fan();
    const picked = dragStart.cards![0].title;
    const copies = () => handTitles(alice).filter((t) => t === picked).length;
    const copiesBefore = copies(); // hollow-oak runs duplicates
    bob.draw(); // friend acts mid-drag: the relay rebroadcasts the room
    mockRelay.flush();
    act(() =>
      dragStart.functions.playFn!(0, { screenPos: { x: 10, y: 10 } }),
    );
    mockRelay.flush();
    expect(handTitles(alice)).toHaveLength(2);
    expect(copies()).toBe(copiesBefore - 1);
    expect(shape(onRelay("alice")).table).toEqual([
      expect.stringContaining(`:${picked}`),
    ]);
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("stale echo after play: a frame built before my play lands after it", () => {
    const { alice, bob } = setupTwo();
    alice.conn.holdOutbox = true; // alice's play is in flight
    alice.play(0);
    bob.draw();
    mockRelay.process(bob.conn); // the relay rebroadcasts alice's OLD blob
    while (mockRelay.deliver(alice.conn));
    expect(handTitles(alice)).toHaveLength(2);
    expect(tableCards(onClient(alice, "alice").blob)).toBe(1);

    alice.conn.holdOutbox = false;
    mockRelay.flush();
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("stale echo, then my next action inside the window", () => {
    const { alice, bob } = setupTwo();
    alice.conn.holdOutbox = true;
    alice.play(0);
    const played = onClient(alice, "alice");
    const playedTitle = migrateBlob(played.blob).tokens.find((t) => t.card)
      ?.card?.title;
    bob.draw();
    mockRelay.process(bob.conn);
    while (mockRelay.deliver(alice.conn));
    alice.draw(); // built from my committed pool, not the stale echo
    const lastState = alice.conn.sent
      .filter((w) => w.msgtype === "playerstate")
      .at(-1)!.content as PlayerState;
    expect(lastState.pool!.hand).toHaveLength(3);
    expect(
      lastState.pool!.hand.filter((k) => k.title === playedTitle).length,
    ).toBeLessThanOrEqual(
      // hollow-oak runs duplicates: the played copy is gone, others may remain
      onClient(alice, "alice").pool!.hand.filter((k) => k.title === playedTitle)
        .length,
    );

    alice.conn.holdOutbox = false;
    mockRelay.flush();
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("reconnect during a play: the play made while down is delivered on reopen, both channels", () => {
    const { alice, bob } = setupTwo();
    mockRelay.drop(alice.conn);
    alice.play(0);
    expect(alice.conn.dropped.map((w) => w.msgtype)).toContain(
      "playerposition",
    );
    expect(tableCards(onRelay("alice").blob)).toBe(0);

    mockRelay.open(alice.conn);
    mockRelay.flush();
    expect(tableCards(onRelay("alice").blob)).toBe(1);
    expectConserved([alice, bob], ["alice", "bob"]);
  });

  it("refresh with a slow link: the auto-init that beats the replay can't clobber my real pool", () => {
    const { alice, bob } = setupTwo();
    alice.play(0);
    mockRelay.flush();
    const before = shape(onRelay("alice"));
    act(() => alice.conn.props.onStatus?.("closed"));
    alice.unmount();

    const again = mountClient("alice");
    advance(500); // fresh pool auto-init fires before the socket opens
    mockRelay.open(again.conn);
    mockRelay.flush();
    advance(3000);
    mockRelay.flush();
    expect(shape(onRelay("alice"))).toEqual(before);
    expectConserved([again, bob], ["alice", "bob"]);
  });

  it("rejoin into a room reset while I was away: the wipe's fresh board beats my replayed old one", () => {
    const { alice, bob } = setupTwo();
    alice.play(0);
    mockRelay.flush();
    expect(tableCards(onRelay("alice").blob)).toBe(1);
    act(() => alice.conn.props.onStatus?.("closed"));
    alice.unmount();

    act(() => bob.ctx().forceGameReset()); // "Reset anyway" past the ghost
    mockRelay.flush();

    const again = mountClient("alice");
    // the replayed gamestate triggers my wipe BEFORE the positions replay —
    // carrying my old board, card token and all — is delivered
    mockRelay.open(again.conn);
    mockRelay.flush();
    advance(3000);
    mockRelay.flush();
    expect(again.ctx().resetStatus.epoch).toBe(1);
    expect(tableCards(onRelay("alice").blob)).toBe(0);
    expectConserved([again, bob], ["alice", "bob"]);
  });

  // Taking turns between the tabs. Two tabs writing in the SAME round trip
  // are two writers on one last-write-wins blob — not something a client
  // can make safe, and not what a person with one pair of hands does.
  it("two tabs under the same name, taking turns, converge (relay keeps both connections)", () => {
    const { alice, bob } = setupTwo();
    const tab2 = mountClient("alice");
    mockRelay.open(tab2.conn);
    mockRelay.flush();
    expect(tab2.conn.sent).toEqual([]); // seeded from the replay, sent nothing

    tab2.play(0);
    mockRelay.flush();
    expect(handTitles(alice)).toEqual(handTitles(tab2)); // tab 1 adopted it
    alice.draw();
    mockRelay.flush();
    tab2.play(0);
    mockRelay.flush();
    alice.play(0);
    bob.draw();
    mockRelay.flush();
    expect(handTitles(tab2)).toEqual(handTitles(alice));
    expectConserved([alice, tab2, bob], ["alice", "bob"]);
  });
});

// ---- random interleavings -------------------------------------------------------

/** mulberry32 — tiny seeded PRNG so a failure names its seed. */
const prng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

describe("random interleavings of plays, draws, discards, drags and wire order", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("seed %i conserves every card", (seed) => {
    const rand = prng(seed);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    const { alice, bob } = setupTwo();
    const clients = [alice, bob];
    const dragStarts = new Map<Client, FanProps>();

    for (let step = 0; step < 60; step++) {
      const c = pick(clients);
      const hand = handTitles(c).length;
      const r = rand();
      if (r < 0.15) c.draw();
      else if (r < 0.3 && hand > 0) c.play(Math.floor(rand() * hand));
      else if (r < 0.38 && hand > 0)
        act(() => c.fan().functions.discardFn(0));
      else if (r < 0.48 && hand > 0) dragStarts.set(c, c.fan());
      else if (r < 0.58 && dragStarts.has(c)) {
        const start = dragStarts.get(c)!;
        dragStarts.delete(c);
        // the drop: HandFan resolves the picked-up card in the current hand
        const card = start.cards![0];
        const at = c.fan().cards?.indexOf(card) ?? -1;
        if (at >= 0)
          act(() =>
            c.fan().functions.playFn!(at, { screenPos: { x: 5, y: 5 } }),
          );
      } else if (r < 0.8) mockRelay.process(c.conn);
      else mockRelay.deliver(c.conn);
    }
    mockRelay.flush();
    expectConserved(clients, ["alice", "bob"]);
  });
});
