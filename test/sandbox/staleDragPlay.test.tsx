/**
 * Issue #496 — sandbox card duplication, pinned at the unit level through the
 * REAL HandContainer + WebGameProvider (only the socket, router, bag and the
 * HandFan presentation are mocked).
 *
 * Hypothesis A (drag stale closure): HandFan's pointerup fires the `playFn`
 * from the render in which the drag STARTED. That closure holds the pool
 * object of that render. If a new gamestate frame lands mid-drag (the friend
 * drew / rolled / logged), the play splices the card out of the OLD object and
 * sends it, but `logAction` re-broadcasts `readLocalPool()` — the NEW object,
 * card still in hand. Relay is last-write-wins → hand keeps the card, token is
 * already on the table.
 *
 * Hypothesis B (echo race): a frame built before my send lands after it and
 * reverts my pool for ~1 RTT. Permanent only if something re-sends the pool in
 * that window.
 *
 * Every `it` states the CORRECT behaviour; the ones marked "FAILS ON MAIN"
 * are the measurements.
 */
import { act, render } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { WebGameProvider, useWebGame } from "@/lib/contexts/WebGameProvider";
import { HandContainer } from "@/components/Game/Hand/hand.container";
import type { HandFan } from "@/components/Game/game.carousel";
import { GameState, PlayerState } from "@/lib/gamesocket/message";
import { PoolType } from "@/components/DeckPool/PoolFns";
import {
  DeckImportCardType,
  DeckImportType,
} from "@/components/DeckPool/deck-import.type";
import HOLLOW_OAK from "@/public/evergreen-decks/hollow-oak.json";
import { ConnectionStatus, WebsocketProps } from "@/lib/gamesocket/socket";

const ME = "alice";
const OPP = "bob";

type FanFunctions = Parameters<typeof HandFan>[0]["functions"];

// ---- mocks -----------------------------------------------------------------

let socket: WebsocketProps;
const sendState = jest.fn<void, [PlayerState]>();
const sendPosition = jest.fn<void, [unknown]>();

jest.mock("../../lib/gamesocket/socket", () => ({
  initializeWebsocket: (props: WebsocketProps) => {
    socket = props;
    return {
      updateMyPlayerState: (s: PlayerState) => sendState(s),
      updateMyPlayerPosition: (b: unknown) => sendPosition(b),
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

jest.mock("../../lib/hooks", () => ({
  useLocalServerStorage: () => ({ activeServer: "http://localhost:1111" }),
}));

// No starred deck by default → HandContainer's 500ms auto-init never fires;
// the pool arrives through the join replay like a rejoin. The fresh-joiner
// case at the bottom sets one.
let mockStarredDeck: DeckImportType | undefined;
jest.mock("../../lib/bag/useBag", () => ({
  useBagDecks: () => ({ starredDeck: mockStarredDeck }),
}));

// HandFan is presentation: record the `functions` prop of EVERY render so a
// test can pick the closure from an earlier render (= the drag's pointerup).
const fanRenders: FanFunctions[] = [];
jest.mock("../../components/Game/game.carousel", () => ({
  HandFan: (props: { functions: FanFunctions }) => {
    fanRenders.push(props.functions);
    return null;
  },
}));

// ---- fixtures --------------------------------------------------------------

const card = (title: string) =>
  ({ title, quantity: 1, boost: 1 }) as unknown as DeckImportCardType;
const [ACE, BOLT, CURE, DUSK] = ["Ace", "Bolt", "Cure", "Dusk"].map(card);

const poolWith = (hand: DeckImportCardType[], deck: DeckImportCardType[] = []) =>
  ({
    hand,
    deck,
    discard: [],
    commit: { main: null, reveal: false, boost: null },
  }) as unknown as PoolType;

const titles = (cards: DeckImportCardType[] | undefined) =>
  (cards ?? []).map((c) => c.title);

const playToTable = jest.fn();
const noop = () => {};

let ctx: ReturnType<typeof useWebGame>;
/** Mirrors GameShell's HandWrapper: the hand fed from the provider context. */
const Hand = () => {
  ctx = useWebGame();
  return (
    <HandContainer
      setModal={noop}
      gameState={ctx.gameState}
      setPlayerState={ctx.setPlayerState}
      logAction={ctx.logAction}
      playToTable={playToTable}
      offerCardTransfer={ctx.offerCardTransfer}
    />
  );
};

const mount = () =>
  render(
    <ChakraProvider>
      <WebGameProvider>
        <Hand />
      </WebGameProvider>
    </ChakraProvider>,
  );

const deliverState = (players: Record<string, PlayerState>) =>
  act(() => {
    socket.onGameState(
      JSON.stringify({
        msgtype: "gamestate",
        content: { gid: "room", players, last_updated: "" },
      }),
    );
  });
const setStatus = (status: ConnectionStatus) =>
  act(() => socket.onStatus?.(status));

const lastSentPool = () => sendState.mock.calls.at(-1)?.[0].pool;
const renderedHand = () =>
  (ctx.gameState?.content as GameState).players[ME].pool?.hand;
const latestPlayFn = () => fanRenders.at(-1)!.playFn!;

const join = () => {
  mount();
  setStatus("open");
  deliverState({
    [ME]: { pool: poolWith([ACE, BOLT], [CURE]) },
    [OPP]: { pool: poolWith([DUSK], [CURE]) },
  });
};

beforeEach(() => {
  sendState.mockClear();
  sendPosition.mockClear();
  playToTable.mockClear();
  fanRenders.length = 0;
});

// ---- Hypothesis A ----------------------------------------------------------

describe("Hypothesis A — playFn captured at drag start, frame lands mid-drag", () => {
  it("FAILS ON MAIN: the last pool broadcast no longer contains the card", () => {
    join();
    const dragPlayFn = latestPlayFn(); // pointerdown: closure of THIS render

    // Mid-drag the friend draws: relay rebroadcasts the room; my blob is
    // byte-identical but freshly parsed into a new object.
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT], [CURE]) },
      [OPP]: { pool: poolWith([DUSK, CURE], []) },
    });

    // pointerup over the board
    act(() => dragPlayFn(0, { screenPos: { x: 10, y: 10 } }));

    expect(playToTable).toHaveBeenCalledTimes(1);
    expect(playToTable.mock.calls[0][0].title).toBe("Ace");
    // 1st send (play) is correct; the LAST send (logAction) is what the relay
    // keeps.
    expect(titles(sendState.mock.calls.at(-2)?.[0].pool?.hand)).toEqual(["Bolt"]);
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
  });

  it("FAILS ON MAIN: the rendered hand no longer contains the card", () => {
    join();
    const dragPlayFn = latestPlayFn();
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT], [CURE]) },
      [OPP]: { pool: poolWith([DUSK, CURE], []) },
    });
    act(() => dragPlayFn(0, { screenPos: { x: 10, y: 10 } }));
    expect(titles(renderedHand())).toEqual(["Bolt"]);
  });

  it("passes on main: the menu path (latest closure) is unaffected", () => {
    join();
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT], [CURE]) },
      [OPP]: { pool: poolWith([DUSK, CURE], []) },
    });
    act(() => latestPlayFn()(0)); // "Place on table" builds its handler at click
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
    expect(titles(renderedHand())).toEqual(["Bolt"]);
  });

  it("passes on main: no frame mid-drag → no duplicate", () => {
    join();
    const dragPlayFn = latestPlayFn();
    act(() => dragPlayFn(0, { screenPos: { x: 10, y: 10 } }));
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
    expect(titles(renderedHand())).toEqual(["Bolt"]);
  });

  it("FAILS ON MAIN: stale index — friend's frame lands mid-drag after MY hand changed", () => {
    // Variant: the mid-drag frame is my own echo of an earlier action that
    // was still in flight at pointerdown (e.g. I drew, then immediately
    // started dragging card 0 before the echo returned). Same closure bug,
    // different visible symptom: nothing depends on the index here, but the
    // played card must still leave the hand.
    join();
    const dragPlayFn = latestPlayFn();
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT, CURE], []) },
      [OPP]: { pool: poolWith([DUSK], [CURE]) },
    });
    act(() => dragPlayFn(0, { screenPos: { x: 10, y: 10 } }));
    expect(playToTable.mock.calls[0][0].title).toBe("Ace");
    expect(titles(lastSentPool()?.hand)).not.toContain("Ace");
  });
});

// ---- Hypothesis B ----------------------------------------------------------

describe("Hypothesis B — echo built before my send lands after it", () => {
  const playThenStaleEcho = () => {
    join();
    act(() => latestPlayFn()(0)); // clean play: hand → [Bolt]
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
    // Friend acted just before my send reached the relay: the frame carries
    // my blob as the relay last knew it — Ace still in hand.
    deliverState({
      [ME]: { pool: poolWith([ACE, BOLT], [CURE]) },
      [OPP]: { pool: poolWith([DUSK, CURE], []) },
    });
  };

  it("FAILS ON MAIN: the stale echo reverts the RENDERED hand (transient)", () => {
    playThenStaleEcho();
    expect(titles(renderedHand())).toEqual(["Bolt"]);
  });

  it("passes on main: with no send in the window, my own echo repairs it", () => {
    playThenStaleEcho();
    deliverState({
      [ME]: { pool: poolWith([BOLT], [CURE]) },
      [OPP]: { pool: poolWith([DUSK, CURE], []) },
    });
    expect(titles(renderedHand())).toEqual(["Bolt"]);
  });

  it("FAILS ON MAIN: a dice roll in the window makes the revert permanent", () => {
    playThenStaleEcho();
    act(() =>
      ctx.publishRoll({
        id: "r1",
        by: ME,
        notation: "1d6",
        values: [3],
        total: 3,
        at: 1,
      }),
    );
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt"]);
  });

  it("FAILS ON MAIN: a Draw in the window makes the revert permanent", () => {
    playThenStaleEcho();
    // gDraw reads playerState.pool of the current render = the stale echo
    const pool = (ctx.gameState?.content as GameState).players[ME].pool!;
    act(() => {
      ctx.setPlayerState()({ pool: { ...pool, hand: [...pool.hand, CURE], deck: [] } });
      ctx.logAction("Drew a card");
    });
    expect(titles(lastSentPool()?.hand)).toEqual(["Bolt", "Cure"]);
  });
});

// ---- Fresh joiner ----------------------------------------------------------

describe("fresh joiner: the hand's 500ms auto-init fires before the join replay", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockStarredDeck = HOLLOW_OAK as unknown as DeckImportType;
  });
  afterEach(() => {
    jest.useRealTimers();
    mockStarredDeck = undefined;
  });

  it("the relay's first update from me carries the dealt pool — no pool-less sends", () => {
    mount();
    setStatus("open");
    act(() => {
      jest.advanceTimersByTime(600); // auto-init fires; replay still in flight
    });
    expect(sendState).not.toHaveBeenCalled();

    // the relay's placeholder blob for a brand-new player
    deliverState({ [ME]: {}, [OPP]: { pool: poolWith([DUSK], [CURE]) } });
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const sends = sendState.mock.calls.map(([s]) => s);
    expect(sends).toHaveLength(1);
    expect(sends[0].rev).toBe(1);
    expect(sends[0].pool?.hand).toHaveLength(1);
    expect(renderedHand()).toHaveLength(1);
  });
});
