/**
 * Sandbox card duplication (issue #496): the client must own its own relay
 * blobs. These drive the provider the way the socket does — inbound snapshot
 * frames and outbound sends — with no live socket, so the races are exact.
 *
 * The relay rebroadcasts the WHOLE room on every message from ANY player, so
 * a frame can carry my blob as the server last knew it: older than a write I
 * still have in flight. Before the fix the provider served my pool out of that
 * echo, which is how a played card ended up in hand AND on the table.
 */
import { act, render } from "@testing-library/react";
import { WebGameProvider, useWebGame } from "./WebGameProvider";
import { GameState, PlayerState, PositionState } from "../gamesocket/message";
import { PoolType, draw, removeHandCard } from "@/components/DeckPool/PoolFns";
import { DeckImportCardType } from "@/components/DeckPool/deck-import.type";
import { PositionBlob } from "@/components/Positions/position.type";
import { ConnectionStatus, WebsocketProps } from "../gamesocket/socket";

const ME = "alice";
const OPP = "bob";

let socket: WebsocketProps;
const sendState = jest.fn<void, [PlayerState]>();
const sendPosition = jest.fn<void, [PositionBlob]>();

jest.mock("../gamesocket/socket", () => ({
  initializeWebsocket: (props: WebsocketProps) => {
    socket = props;
    return {
      updateMyPlayerState: (s: PlayerState) => sendState(s),
      updateMyPlayerPosition: (b: PositionBlob) => sendPosition(b),
      close: () => {},
    };
  },
}));

jest.mock("next/router", () => {
  const router = {
    isReady: true,
    query: { name: "alice", gid: "room" },
    replace: jest.fn(),
  };
  return { useRouter: () => router };
});

jest.mock("../hooks", () => ({
  useLocalServerStorage: () => ({ activeServer: "http://localhost:1111" }),
}));

const card = (title: string) =>
  ({ title, quantity: 1, boost: 1 }) as unknown as DeckImportCardType;
const [ACE, BOLT, CURE, DUSK] = ["Ace", "Bolt", "Cure", "Dusk"].map(card);

const poolWith = (hand: DeckImportCardType[], deck: DeckImportCardType[] = []) =>
  ({ hand, deck, discard: [], commit: {} }) as unknown as PoolType;

let ctx: ReturnType<typeof useWebGame>;
const Probe = () => {
  ctx = useWebGame();
  return null;
};

const mount = () => render(<WebGameProvider>{<Probe />}</WebGameProvider>);

/** A gamestate frame as the relay sends it (whole room, JSON over the wire). */
const deliverState = (players: Record<string, PlayerState>) =>
  act(() => {
    socket.onGameState(
      JSON.stringify({
        msgtype: "gamestate",
        content: { gid: "room", players, last_updated: "" },
      }),
    );
  });

const deliverPositions = (blobs: Record<string, PositionBlob>) =>
  act(() => {
    socket.onGamePositions(
      JSON.stringify({ msgtype: "playerposition", content: blobs }),
    );
  });

const setStatus = (status: ConnectionStatus) =>
  act(() => socket.onStatus?.(status));

const myPool = () =>
  (ctx.gameState?.content as GameState).players[ME].pool as PoolType;
const titles = (cards: DeckImportCardType[] | undefined) =>
  (cards ?? []).map((c) => c.title);
const lastSentPool = () => sendState.mock.calls.at(-1)?.[0].pool;
const lastSentTokens = () => sendPosition.mock.calls.at(-1)?.[0].tokens;

/** What `hand.container`'s play does: splice it out, send, then log. */
const playFirstCard = (pool = myPool()) =>
  act(() => {
    ctx.setPlayerState()({ pool: removeHandCard(pool, 0) });
    ctx.logAction("Placed a card face-down on the table");
  });

/** The join replay: my blob as the relay holds it, plus an opponent. */
const joinWith = (mine: PlayerState) => {
  setStatus("open");
  deliverState({ [ME]: mine, [OPP]: { pool: poolWith([DUSK]) } });
};

beforeEach(() => {
  sendState.mockClear();
  sendPosition.mockClear();
});

describe("stale echoes can no longer revert my pool", () => {
  it("a frame built before my play does not put the card back in hand", () => {
    mount();
    const replay: PlayerState = { pool: poolWith([ACE, BOLT]) };
    joinWith(replay);

    playFirstCard();
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);

    // Bob acts before the relay has my send: it rebroadcasts the room with
    // MY blob as it last knew it — Ace still in hand.
    deliverState({ [ME]: replay, [OPP]: { pool: poolWith([DUSK, CURE]) } });

    expect(titles(myPool().hand)).toEqual(["Bolt"]);
  });

  it("the next action after a stale frame does not resurrect the card", () => {
    mount();
    const replay: PlayerState = { pool: poolWith([ACE, BOLT], [CURE]) };
    joinWith(replay);

    playFirstCard();
    deliverState({ [ME]: replay, [OPP]: { pool: poolWith([DUSK, BOLT]) } });

    // gDraw: mutate the pool the UI renders, send it, log it.
    act(() => {
      ctx.setPlayerState()({ pool: draw(myPool()) });
      ctx.logAction("Drew a card");
    });
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt", "Cure"]);

    // …and every other path that re-sends "the current pool" (dice, log).
    act(() =>
      ctx.publishRoll({
        id: "r1",
        by: ME,
        notation: "1d20",
        values: [7],
        total: 7,
        at: 1,
      }),
    );
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt", "Cure"]);
  });

  // The drag path (second report): HandFan fires the playFn captured when
  // the drag STARTED, so the play closes over the pool from that render.
  it("a play closure from before a frame still sends the card removed", () => {
    mount();
    joinWith({ pool: poolWith([ACE, BOLT]) });

    const poolAtDragStart = myPool();
    const { setPlayerState, logAction } = ctx;

    // Mid-drag, Bob draws: same content for me, but a freshly parsed frame.
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT]) },
      [OPP]: { pool: poolWith([DUSK, CURE]) },
    });

    act(() => {
      setPlayerState()({ pool: removeHandCard(poolAtDragStart, 0) });
      logAction("Placed a card face-down on the table");
    });

    // Last write wins on the relay — the last send is what sticks.
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
    expect(titles(myPool().hand)).toEqual(["Bolt"]);
  });

  it("every send carries a rising rev", () => {
    mount();
    joinWith({ pool: poolWith([ACE, BOLT]), rev: 7 } as PlayerState);

    playFirstCard();
    const revs = sendState.mock.calls.map(([s]) => s.rev);
    expect(revs).toEqual([8, 9]);
  });

  it("adopts my own blob when it is newer than anything I wrote", () => {
    mount();
    joinWith({ pool: poolWith([ACE]), rev: 3 } as PlayerState);

    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT]), rev: 4 } as PlayerState,
    });
    expect(titles(myPool().hand)).toEqual(["Ace", "Bolt"]);
  });

  it("still adopts opponents' blobs from every frame", () => {
    mount();
    joinWith({ pool: poolWith([ACE]) });
    deliverState({
      [ME]: { pool: poolWith([ACE]) },
      [OPP]: { pool: poolWith([DUSK, CURE]) },
    });
    const opp = (ctx.gameState?.content as GameState).players[OPP];
    expect(titles(opp.pool?.hand)).toEqual(["Dusk", "Cure"]);
  });
});

describe("position blob gets the same treatment", () => {
  const token = { id: "alice-t1", x: 1, y: 2, card: ACE };

  it("a stale positions frame cannot drop a token I just placed", () => {
    mount();
    joinWith({ pool: poolWith([ACE]) });
    deliverPositions({ [ME]: { tokens: [] }, [OPP]: { tokens: [] } });

    act(() => ctx.setPlayerPosition.current({ tokens: [token] }));
    deliverPositions({ [ME]: { tokens: [] }, [OPP]: { tokens: [] } });

    const blobs = (ctx.gamePositions?.content ?? {}) as PositionState;
    const mine = blobs[ME] as PositionBlob;
    expect(mine.tokens.map((t) => t.id)).toEqual(["alice-t1"]);
  });
});

describe("reconnect", () => {
  it("re-sends my pool and position blobs when the socket reopens", () => {
    mount();
    joinWith({ pool: poolWith([ACE, BOLT]) });
    deliverPositions({ [ME]: { tokens: [] } });

    // The blip: sends made while closed are dropped by the socket.
    setStatus("closed");
    playFirstCard();
    act(() =>
      ctx.setPlayerPosition.current({
        tokens: [{ id: "alice-t1", x: 0, y: 0, card: ACE }],
      }),
    );
    sendState.mockClear();
    sendPosition.mockClear();

    setStatus("connecting");
    setStatus("open");

    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
    expect(lastSentTokens()?.map((t) => t.id)).toEqual(["alice-t1"]);

    // …and the relay's join replay of my old blob doesn't undo it.
    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]) } });
    expect(titles(myPool().hand)).toEqual(["Bolt"]);
  });

  it("never sends before the join replay has told me what I hold", () => {
    mount();
    setStatus("open");
    // e.g. the hand's 500ms auto-init firing before the replay lands
    act(() => ctx.setPlayerState()({ pool: poolWith([]) }));
    act(() => ctx.setPlayerPosition.current({ tokens: [] }));
    expect(sendState).not.toHaveBeenCalled();
    expect(sendPosition).not.toHaveBeenCalled();

    deliverState({ [ME]: { pool: poolWith([ACE, BOLT]) } });
    expect(titles(myPool().hand)).toEqual(["Ace", "Bolt"]);
  });
});
